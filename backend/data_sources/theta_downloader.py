"""
ThetaData downloader — connects via thetadata Python library (no Java Terminal required),
downloads 1-min OHLC for equities or options, aggregates to 5-min bars, and saves as
clean parquet files organized by ticker/year/month.
"""

import logging
import os
import shutil
from datetime import date, datetime, timezone
from pathlib import Path
from typing import Any, Callable, Dict, List, Optional

import pandas as pd
import pyarrow as pa
import pyarrow.parquet as pq

logger = logging.getLogger(__name__)

BAR_5MIN_SCHEMA = pa.schema([
    ("ts_event", pa.uint64()),
    ("open", pa.float64()),
    ("high", pa.float64()),
    ("low", pa.float64()),
    ("close", pa.float64()),
    ("volume", pa.uint64()),
])


def _build_datetime(df: pd.DataFrame) -> pd.Series:
    dt = pd.to_datetime(df["date"].astype(str), format="%Y%m%d")
    if "ms_cst" in df.columns:
        dt += pd.to_timedelta(df["ms_cst"], unit="ms")
    return dt


def _aggregate_5min(df: pd.DataFrame) -> pd.DataFrame:
    df = df.sort_index()
    agg = df.resample("5min").agg({
        "open": "first",
        "high": "max",
        "low": "min",
        "close": "last",
        "volume": "sum",
    })
    return agg[agg["close"] > 0].dropna()


def _write_parquet(df: pd.DataFrame, out_dir: Path):
    out_dir.mkdir(parents=True, exist_ok=True)
    if df.empty:
        return
    df["ts_event"] = df["ts_event"].astype("uint64")
    ts = pd.to_datetime(df["ts_event"], unit="ns", utc=True)
    for (year, month), group in df.groupby([ts.dt.year, ts.dt.month]):
        rows = group.drop(columns=["ts_event"], errors="ignore").to_dict("records")
        if not rows:
            continue
        table = pa.Table.from_pylist(
            [{"ts_event": r["ts_event"], **{k: v for k, v in r.items() if k != "ts_event"}}
             for r in df[df.index.isin(group.index)].to_dict("records")],
            schema=BAR_5MIN_SCHEMA,
        )
        pq.write_table(table, out_dir / f"{year}-{month:02d}.parquet")


def _ensure_client(api_key: str):
    """Lazy import of thetadata to avoid crash if not installed."""
    from thetadata import ThetaClient
    return ThetaClient(api_key=api_key)


def ticker_from_iid(iid: str) -> str:
    m = __import__("re").match(r"^([A-Za-z]+)", iid)
    return m.group(1).upper() if m else iid


# ── Public API ──────────────────────────────────────────────────────────────────────

def list_symbols(api_key: str) -> List[str]:
    try:
        client = _ensure_client(api_key)
        syms = client.stock_list_symbols()
        if syms is not None:
            df = syms.to_pandas() if hasattr(syms, "to_pandas") else syms
            return sorted(df.iloc[:, 0].tolist())
    except Exception as e:
        logger.error("list_symbols failed: %s", e)
    return []


def list_option_symbols(api_key: str) -> List[str]:
    try:
        client = _ensure_client(api_key)
        syms = client.option_list_symbols()
        if syms is not None:
            df = syms.to_pandas() if hasattr(syms, "to_pandas") else syms
            return sorted(df.iloc[:, 0].tolist())
    except Exception as e:
        logger.error("list_option_symbols failed: %s", e)
    return []


def download_equity_bars(
    api_key: str,
    symbol: str,
    start_date: date,
    end_date: date,
    output_dir: str,
    progress_callback: Optional[Callable] = None,
) -> Dict[str, Any]:
    """
    Download 1-min OHLC for an equity, aggregate to 5-min bars,
    write to output_dir/{symbol}/5min/{year}-{month}.parquet.
    """
    stats = {"converted": 0, "skipped": 0, "errors": 0}
    try:
        client = _ensure_client(api_key)

        def cb(msg, idx=0, converted=0, skipped=0, errors=0, total=0):
            if progress_callback:
                progress_callback(msg, idx, converted, skipped, errors, total)

        cb("Connecting to ThetaData...")

        df = client.stock_history_ohlc(
            symbol=symbol,
            start_date=start_date,
            end_date=end_date,
            interval=1,
        )

        if df is None or df.empty:
            stats["skipped"] = 1
            cb("No data returned from ThetaData", 0, 0, 1, 0, 0)
            return stats

        df = df.to_pandas() if hasattr(df, "to_pandas") else df
        cb(f"Downloaded {len(df)} 1-min rows", 0, 0, 0, 0, len(df))

        df["datetime"] = _build_datetime(df)
        df = df[df["close"] > 0].copy()
        if df.empty:
            stats["skipped"] = 1
            return stats

        df.set_index("datetime", inplace=True)
        bars = _aggregate_5min(df)
        total = len(bars)

        out_path = Path(output_dir) / symbol / "5min"
        out_path.mkdir(parents=True, exist_ok=True)

        records = []
        for idx, (ts, row) in enumerate(bars.iterrows()):
            records.append({
                "ts_event": int(ts.timestamp() * 1_000_000_000),
                "open": float(row["open"]),
                "high": float(row["high"]),
                "low": float(row["low"]),
                "close": float(row["close"]),
                "volume": int(row["volume"]),
            })
            if progress_callback and idx % 100 == 0:
                cb(f"Aggregating {idx}/{total}", idx, idx, 0, 0, total)

        cb(f"Writing {total} bars...", total, total, 0, 0, total)

        table = pa.Table.from_pylist(records, schema=BAR_5MIN_SCHEMA)
        ts_vals = [r["ts_event"] for r in records]
        ts_series = pd.to_datetime(ts_vals, unit="ns", utc=True)
        for (year, month), idx_group in pd.Series(index=range(len(records)), data=ts_series).groupby([ts_series.dt.year, ts_series.dt.month]):
            group_rows = [records[i] for i in idx_group.index]
            group_table = pa.Table.from_pylist(group_rows, schema=BAR_5MIN_SCHEMA)
            pq.write_table(group_table, out_path / f"{year}-{month:02d}.parquet")

        stats["converted"] = total
        cb(f"Done — {total} bars written", total, total, total, 0, total)

    except Exception as e:
        logger.exception("download_equity_bars failed: %s", e)
        stats["errors"] = 1
        if progress_callback:
            progress_callback(f"Error: {e}", 0, 0, 0, 1, 0)

    return stats


def scan_ticker_coverage(catalog_path: str) -> List[Dict[str, Any]]:
    """
    Walk the data directory and Nautilus catalog to produce per-ticker coverage info.
    Returns: [{ticker, contracts, data_types, total_files, total_size_bytes}]
    """
    tickers: Dict[str, Dict] = {}
    data_dir = Path(catalog_path) / "data"

    if data_dir.exists():
        for dtype_dir in sorted(data_dir.iterdir()):
            if not dtype_dir.is_dir():
                continue
            dtype = dtype_dir.name
            for instr_dir in sorted(dtype_dir.iterdir()):
                if not instr_dir.is_dir():
                    continue
                ticker = ticker_from_iid(instr_dir.name)
                if ticker not in tickers:
                    tickers[ticker] = {
                        "ticker": ticker,
                        "contracts": 0,
                        "data_types": set(),
                        "total_files": 0,
                        "total_size_bytes": 0,
                    }
                tickers[ticker]["contracts"] += 1
                tickers[ticker]["data_types"].add(dtype)
                for f in instr_dir.glob("*.parquet"):
                    tickers[ticker]["total_files"] += 1
                    tickers[ticker]["total_size_bytes"] += f.stat().st_size

    # Also scan theta download directory
    theta_dir = Path(catalog_path) / "theta"
    if theta_dir.exists():
        for sym_dir in theta_dir.iterdir():
            if not sym_dir.is_dir():
                continue
            ticker = sym_dir.name.upper()
            if ticker not in tickers:
                tickers[ticker] = {
                    "ticker": ticker,
                    "contracts": 0,
                    "data_types": set(),
                    "total_files": 0,
                    "total_size_bytes": 0,
                }
            tickers[ticker]["data_types"].add("5min_bars")
            for f in sym_dir.rglob("*.parquet"):
                tickers[ticker]["total_files"] += 1
                tickers[ticker]["total_size_bytes"] += f.stat().st_size

    result = []
    for info in tickers.values():
        info["data_types"] = sorted(info["data_types"])
        result.append(info)
    return sorted(result, key=lambda x: x["ticker"])


def delete_ticker(catalog_path: str, ticker: str) -> int:
    """Remove all catalog + theta data for a ticker. Returns count of deleted directories."""
    removed = 0
    data_dir = Path(catalog_path) / "data"
    if data_dir.exists():
        for dtype_dir in data_dir.iterdir():
            if not dtype_dir.is_dir():
                continue
            for instr_dir in dtype_dir.iterdir():
                if not instr_dir.is_dir():
                    continue
                if ticker_from_iid(instr_dir.name).upper() == ticker.upper():
                    shutil.rmtree(instr_dir)
                    removed += 1
    theta_dir = Path(catalog_path) / "theta" / ticker.upper()
    if theta_dir.exists():
        shutil.rmtree(theta_dir)
        removed += 1
    return removed

"""
ThetaData downloader — connects via thetadata Python library (no Java Terminal required),
downloads 1-min OHLC for equities day-by-day, aggregates to 5-min bars, and saves as
clean parquet files organized by ticker/year/month.
"""

import logging
import shutil
from datetime import date, timedelta
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


def _to_pandas(df):
    if df is None:
        return None
    return df.to_pandas() if hasattr(df, "to_pandas") else df


def _aggregate_5min(df: pd.DataFrame) -> pd.DataFrame:
    df = df.sort_index()
    agg = df.resample("5min").agg({
        "open": "first", "high": "max", "low": "min", "close": "last", "volume": "sum",
    })
    return agg[agg["close"] > 0].dropna()


def _write_batch(records: List[dict], out_dir: Path):
    if not records:
        return
    table = pa.Table.from_pylist(records, schema=BAR_5MIN_SCHEMA)
    ts = pd.to_datetime([r["ts_event"] for r in records], unit="ns", utc=True)
    for (year, month), idx in pd.Series(index=range(len(records)), data=ts).groupby([ts.dt.year, ts.dt.month]):
        month_dir = out_dir / str(year)
        month_dir.mkdir(parents=True, exist_ok=True)
        sub = [records[i] for i in idx.index]
        pq.write_table(
            pa.Table.from_pylist(sub, schema=BAR_5MIN_SCHEMA),
            month_dir / f"{month:02d}.parquet",
        )


def _business_days(start: date, end: date) -> List[date]:
    days = []
    cur = start
    while cur <= end:
        if cur.weekday() < 5:
            days.append(cur)
        cur += timedelta(days=1)
    return days


def ticker_from_iid(iid: str) -> str:
    m = __import__("re").match(r"^([A-Za-z]+)", iid)
    return m.group(1).upper() if m else iid


def list_symbols() -> List[str]:
    try:
        from thetadata import ThetaClient
        client = ThetaClient()
        syms = _to_pandas(client.stock_list_symbols())
        if syms is not None and not syms.empty:
            return sorted(syms.iloc[:, 0].tolist())
    except Exception as e:
        logger.error("list_symbols failed: %s", e)
    return []


def list_option_symbols() -> List[str]:
    try:
        from thetadata import ThetaClient
        client = ThetaClient()
        syms = _to_pandas(client.option_list_symbols())
        if syms is not None and not syms.empty:
            return sorted(syms.iloc[:, 0].tolist())
    except Exception as e:
        logger.error("list_option_symbols failed: %s", e)
    return []


def download_equity_bars(
    symbol: str,
    start_date: date,
    end_date: date,
    output_dir: str,
    progress_callback: Optional[Callable] = None,
) -> Dict[str, Any]:
    """
    Download 1-min OHLC day-by-day, aggregate to 5-min bars,
    write to output_dir/{symbol}/5min/{year}/{month:02d}.parquet.
    """
    stats = {"converted": 0, "skipped": 0, "errors": 0}

    try:
        from thetadata import ThetaClient
        client = ThetaClient()
    except Exception as e:
        logger.error("Failed to create ThetaClient: %s", e)
        stats["errors"] = 1
        if progress_callback:
            progress_callback(f"Import error: {e}", 0, 0, 0, 1, 0)
        return stats

    days = _business_days(start_date, end_date)
    total_days = len(days)
    all_records: List[dict] = []

    for idx, day in enumerate(days):
        if progress_callback:
            progress_callback(f"Downloading {symbol} {day.isoformat()} ({idx + 1}/{total_days})", idx, len(all_records), idx, 0, total_days)

        try:
            raw = client.stock_history_ohlc(
                symbol=symbol,
                date=day,
                interval="1m",
            )
            df = _to_pandas(raw)
            if df is None or df.empty:
                stats["skipped"] += 1
                continue
        except Exception as e:
            logger.warning("Failed day %s: %s", day, e)
            stats["errors"] += 1
            continue

        # Build datetime index
        dt_col = pd.to_datetime(
            df["date"].astype(str) + " " + df["ms_cst"].apply(lambda ms: f"{int(ms // 3600000):02d}:{int((ms % 3600000) // 60000):02d}:{int((ms % 60000) // 1000):02d}.{int(ms % 1000):03d}"),
            format="%Y%m%d %H:%M:%S.%f", errors="coerce",
        )
        df["datetime"] = dt_col
        df = df[df["close"] > 0].copy()
        if df.empty:
            stats["skipped"] += 1
            continue

        df.set_index("datetime", inplace=True)
        bars = _aggregate_5min(df)

        for ts, row in bars.iterrows():
            all_records.append({
                "ts_event": int(ts.timestamp() * 1_000_000_000),
                "open": float(row["open"]),
                "high": float(row["high"]),
                "low": float(row["low"]),
                "close": float(row["close"]),
                "volume": int(row["volume"]),
            })

        if progress_callback:
            progress_callback(f"Downloaded {symbol} {day.isoformat()} ({len(bars)} bars)", idx, len(all_records), idx + 1, stats["skipped"], total_days)

    if progress_callback:
        progress_callback(f"Writing {len(all_records)} total bars...", total_days, len(all_records), total_days, stats["skipped"], total_days)

    out_path = Path(output_dir) / symbol.upper() / "5min"
    _write_batch(all_records, out_path)
    stats["converted"] = len(all_records)

    if progress_callback:
        progress_callback(f"Done — {len(all_records)} bars written", total_days, len(all_records), total_days, stats["skipped"], total_days)

    return stats


def scan_ticker_coverage(catalog_path: str) -> List[Dict[str, Any]]:
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
                    tickers[ticker] = {"ticker": ticker, "contracts": 0, "data_types": set(), "total_files": 0, "total_size_bytes": 0}
                tickers[ticker]["contracts"] += 1
                tickers[ticker]["data_types"].add(dtype)
                for f in instr_dir.glob("*.parquet"):
                    tickers[ticker]["total_files"] += 1
                    tickers[ticker]["total_size_bytes"] += f.stat().st_size

    theta_dir = Path(catalog_path) / "theta"
    if theta_dir.exists():
        for sym_dir in theta_dir.iterdir():
            if not sym_dir.is_dir():
                continue
            ticker = sym_dir.name.upper()
            if ticker not in tickers:
                tickers[ticker] = {"ticker": ticker, "contracts": 0, "data_types": set(), "total_files": 0, "total_size_bytes": 0}
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

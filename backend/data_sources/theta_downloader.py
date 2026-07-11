"""
ThetaData downloader — connects via thetadata Python library (no Java Terminal required),
downloads 1-min OHLC for equities day-by-day, aggregates to 5-min bars, and saves as
clean parquet files organized by ticker/year/month. Also supports EOD option Greeks.
"""

import logging
import shutil
import time
from concurrent.futures import ThreadPoolExecutor, as_completed
from datetime import date, timedelta
from pathlib import Path
from typing import Any, Callable, Dict, List, Optional, Set, Tuple

import pandas as pd
import pyarrow as pa
import pyarrow.parquet as pq

logger = logging.getLogger(__name__)

TIER_CONFIG = {
    "free": {"concurrency": 1, "rate_limit": 25, "delay": 0.5, "first_access": date(2023, 6, 1)},
    "value": {"concurrency": 2, "rate_limit": None, "delay": 0.3, "first_access": date(2021, 1, 1)},
    "standard": {"concurrency": 4, "rate_limit": None, "delay": 0.15, "first_access": date(2016, 1, 1)},
    "pro": {"concurrency": 8, "rate_limit": None, "delay": 0.05, "first_access": date(2012, 6, 1)},
}

BAR_SCHEMA = pa.schema([
    ("symbol", pa.string()),
    ("ts_event", pa.uint64()),
    ("open", pa.float64()),
    ("high", pa.float64()),
    ("low", pa.float64()),
    ("close", pa.float64()),
    ("volume", pa.uint64()),
])

GREEKS_SCHEMA = pa.schema([
    ("symbol", pa.string()),
    ("expiration", pa.string()),
    ("strike", pa.float64()),
    ("right", pa.string()),
    ("ts_event", pa.uint64()),
    ("open", pa.float64()),
    ("high", pa.float64()),
    ("low", pa.float64()),
    ("close", pa.float64()),
    ("volume", pa.uint64()),
    ("bid", pa.float64()),
    ("ask", pa.float64()),
    ("delta", pa.float64()),
    ("gamma", pa.float64()),
    ("theta", pa.float64()),
    ("vega", pa.float64()),
    ("rho", pa.float64()),
    ("implied_vol", pa.float64()),
    ("underlying_price", pa.float64()),
])


def _to_pandas(df):
    if df is None:
        return None
    return df.to_pandas() if hasattr(df, "to_pandas") else df


def _completed_months(output_dir: Path) -> Set[Tuple[int, int]]:
    completed = set()
    if not output_dir.exists():
        return completed
    for year_dir in output_dir.iterdir():
        if not year_dir.is_dir():
            continue
        try:
            year = int(year_dir.name)
        except ValueError:
            continue
        for f in year_dir.iterdir():
            if f.suffix == ".parquet":
                try:
                    month = int(f.stem)
                    completed.add((year, month))
                except ValueError:
                    continue
    return completed


def _write_bar_month(bars: List[dict], output_dir: Path, year: int, month: int):
    if not bars:
        return
    month_dir = output_dir / str(year)
    month_dir.mkdir(parents=True, exist_ok=True)
    table = pa.Table.from_pylist(bars, schema=BAR_SCHEMA)
    pq.write_table(table, month_dir / f"{month:02d}.parquet", compression="zstd")


def _write_greeks_month(records: List[dict], output_dir: Path, year: int, month: int):
    if not records:
        return
    month_dir = output_dir / str(year)
    month_dir.mkdir(parents=True, exist_ok=True)
    table = pa.Table.from_pylist(records, schema=GREEKS_SCHEMA)
    pq.write_table(table, month_dir / f"{month:02d}.parquet", compression="zstd")


def _aggregate_5min(df: pd.DataFrame) -> pd.DataFrame:
    df = df.sort_index()
    agg = df.resample("5min").agg({
        "open": "first", "high": "max", "low": "min", "close": "last", "volume": "sum",
    })
    return agg[agg["close"] > 0].dropna()


def _business_days(start: date, end: date) -> List[date]:
    days = []
    cur = start
    while cur <= end:
        if cur.weekday() < 5:
            days.append(cur)
        cur += timedelta(days=1)
    return days


def _make_client(api_key: str):
    from thetadata import ThetaClient
    return ThetaClient(api_key=api_key)


def download_equity_bars(
    symbol: str,
    start_date: date,
    end_date: date,
    output_dir: str,
    api_key: str,
    tier: str = "free",
    progress_callback: Optional[Callable] = None,
) -> Dict[str, Any]:
    stats = {"converted": 0, "skipped": 0, "errors": 0}
    tier = tier.lower()
    if tier not in TIER_CONFIG:
        raise ValueError(f"Unknown tier: {tier}")

    try:
        client = _make_client(api_key)
    except Exception as e:
        logger.error("Failed to create ThetaClient: %s", e)
        stats["errors"] = 1
        if progress_callback:
            progress_callback(f"Import error: {e}", 0, 0, 0, 1, 0)
        return stats

    out_path = Path(output_dir) / "theta" / symbol.upper() / "5min"
    completed = _completed_months(out_path)
    all_records: List[dict] = []
    total = 0
    errors = 0
    skipped = 0

    if tier == "free":
        # EOD query — single request for date range
        try:
            raw = client.stock_history_eod(symbol=symbol, start_date=start_date, end_date=end_date)
            df = _to_pandas(raw)
        except Exception as e:
            logger.error("EOD query failed for %s: %s", symbol, e)
            stats["errors"] = 1
            if progress_callback:
                progress_callback(f"EOD error: {e}", 0, 0, 0, 1, 0)
            return stats

        monthly_bars: Dict[Tuple[int, int], List[dict]] = {}
        if df is not None and not df.empty:
            for _, row in df.iterrows():
                ts = row.get("created") or row.get("timestamp")
                if ts is None:
                    continue
                ts_dt = pd.Timestamp(ts)
                rec = {
                    "symbol": symbol.upper(),
                    "ts_event": int(ts_dt.timestamp() * 1_000_000_000),
                    "open": float(row.get("open", 0)),
                    "high": float(row.get("high", 0)),
                    "low": float(row.get("low", 0)),
                    "close": float(row.get("close", 0)),
                    "volume": int(row.get("volume", 0)),
                }
                key = (ts_dt.year, ts_dt.month)
                monthly_bars.setdefault(key, []).append(rec)
            stats["converted"] = len(df)
        else:
            stats["skipped"] = 1

        out_path = Path(output_dir) / "theta" / symbol.upper() / "5min"
        for (year, month), records in monthly_bars.items():
            _write_bar_month(records, out_path, year, month)
        if progress_callback:
            total_records = sum(len(v) for v in monthly_bars.values())
            progress_callback(f"Done — {total_records} bars written", 0, total_records, 0, stats["skipped"], 0)
        return stats

    # Value+ tier: day-by-day 1-min OHLC, aggregate to 5-min
    days = _business_days(start_date, end_date)
    total_days = len(days)
    out_path = Path(output_dir) / "theta" / symbol.upper() / "5min"
    completed = _completed_months(out_path)

    monthly_bars: Dict[Tuple[int, int], List[dict]] = {}

    for idx, day in enumerate(days):
        if progress_callback:
            progress_callback(
                f"Downloading {symbol} {day.isoformat()} ({idx + 1}/{total_days})",
                idx, sum(len(v) for v in monthly_bars.values()), idx, skipped, total_days,
            )

        # Check if this day's month is already complete
        if (day.year, day.month) in completed:
            skipped += 1
            continue

        try:
            raw = client.stock_history_ohlc(symbol=symbol, date=day, interval="1m")
            df = _to_pandas(raw)
            if df is None or df.empty:
                skipped += 1
                continue
        except Exception as e:
            logger.warning("Failed day %s for %s: %s", day, symbol, e)
            errors += 1
            continue

        # Parse timestamp column directly (it's already a datetime)
        if "timestamp" in df.columns:
            dt_col = pd.to_datetime(df["timestamp"])
        else:
            skipped += 1
            continue

        df = df[df["close"] > 0].copy()
        if df.empty:
            skipped += 1
            continue

        df["datetime"] = dt_col
        df.set_index("datetime", inplace=True)
        bars = _aggregate_5min(df)

        for ts, row in bars.iterrows():
            rec = {
                "symbol": symbol.upper(),
                "ts_event": int(ts.timestamp() * 1_000_000_000),
                "open": float(row["open"]),
                "high": float(row["high"]),
                "low": float(row["low"]),
                "close": float(row["close"]),
                "volume": int(row["volume"]),
            }
            key = (ts.year, ts.month)
            monthly_bars.setdefault(key, []).append(rec)

        if progress_callback:
            progress_callback(
                f"Downloaded {symbol} {day.isoformat()} ({len(bars)} bars)",
                idx, sum(len(v) for v in monthly_bars.values()), idx + 1, skipped, total_days,
            )

    for (year, month), records in monthly_bars.items():
        _write_bar_month(records, out_path, year, month)

    total_bars = sum(len(v) for v in monthly_bars.values())
    stats["converted"] = total_bars
    stats["skipped"] = skipped
    stats["errors"] = errors

    if progress_callback:
        progress_callback(
            f"Done — {total_bars} bars written for {symbol}",
            total_days, total_bars, total_days, skipped, total_days,
        )

    return stats


def download_option_greeks(
    symbol: str,
    start_date: date,
    end_date: date,
    output_dir: str,
    api_key: str,
    tier: str = "free",
    progress_callback: Optional[Callable] = None,
) -> Dict[str, Any]:
    stats = {"converted": 0, "skipped": 0, "errors": 0}
    tier = tier.lower()
    if tier not in TIER_CONFIG:
        raise ValueError(f"Unknown tier: {tier}")

    if tier == "free":
        logger.warning("Free tier cannot download option Greeks — skipping %s", symbol)
        if progress_callback:
            progress_callback(f"Free tier cannot download Greeks for {symbol}", 0, 0, 0, 0, 0)
        return stats

    try:
        client = _make_client(api_key)
    except Exception as e:
        logger.error("Failed to create ThetaClient: %s", e)
        stats["errors"] = 1
        if progress_callback:
            progress_callback(f"Import error: {e}", 0, 0, 0, 1, 0)
        return stats

    out_path = Path(output_dir) / "theta" / symbol.upper() / "option_greeks_eod"
    completed = _completed_months(out_path)
    days = _business_days(start_date, end_date)
    total_days = len(days)
    monthly_records: Dict[Tuple[int, int], List[dict]] = {}
    errors = 0
    skipped = 0

    for idx, day in enumerate(days):
        if (day.year, day.month) in completed:
            skipped += 1
            continue

        if progress_callback:
            progress_callback(
                f"Downloading Greeks {symbol} {day.isoformat()} ({idx + 1}/{total_days})",
                idx, sum(len(v) for v in monthly_records.values()), idx, skipped, total_days,
            )

        try:
            raw = client.option_history_greeks_eod(
                symbol=symbol,
                expiration="*",
                start_date=day,
                end_date=day,
            )
            df = _to_pandas(raw)
        except Exception as e:
            ename = type(e).__name__
            if "NoDataFound" in ename or "NoDataFoundError" in ename:
                skipped += 1
                continue
            logger.warning("Failed Greeks day %s for %s: %s", day, symbol, e)
            errors += 1
            continue

        if df is None or df.empty:
            skipped += 1
            continue

        for _, row in df.iterrows():
            ts = row.get("timestamp")
            if ts is None:
                continue
            ts_dt = pd.Timestamp(ts)
            rec = {
                "symbol": str(row.get("symbol", symbol.upper())),
                "expiration": str(row.get("expiration", "")),
                "strike": float(row.get("strike", 0)),
                "right": str(row.get("right", "")),
                "ts_event": int(ts_dt.timestamp() * 1_000_000_000),
                "open": float(row.get("open", 0)),
                "high": float(row.get("high", 0)),
                "low": float(row.get("low", 0)),
                "close": float(row.get("close", 0)),
                "volume": int(row.get("volume", 0)),
                "bid": float(row.get("bid", 0)),
                "ask": float(row.get("ask", 0)),
                "delta": float(row.get("delta", 0)),
                "gamma": float(row.get("gamma", 0)),
                "theta": float(row.get("theta", 0)),
                "vega": float(row.get("vega", 0)),
                "rho": float(row.get("rho", 0)),
                "implied_vol": float(row.get("implied_vol", 0)),
                "underlying_price": float(row.get("underlying_price", 0)),
            }
            key = (ts_dt.year, ts_dt.month)
            monthly_records.setdefault(key, []).append(rec)

        if progress_callback:
            total_so_far = sum(len(v) for v in monthly_records.values())
            progress_callback(
                f"Downloaded Greeks {symbol} {day.isoformat()}",
                idx, total_so_far, idx + 1, skipped, total_days,
            )

    for (year, month), records in monthly_records.items():
        _write_greeks_month(records, out_path, year, month)

    total = sum(len(v) for v in monthly_records.values())
    stats["converted"] = total
    stats["skipped"] = skipped
    stats["errors"] = errors

    if progress_callback:
        progress_callback(
            f"Done — {total} Greeks records written for {symbol}",
            total_days, total, total_days, skipped, total_days,
        )

    return stats


def batch_download(
    symbols: List[str],
    start_date: date,
    end_date: date,
    output_dir: str,
    api_key: str,
    tier: str = "free",
    bars: bool = True,
    greeks: bool = False,
    progress_callback: Optional[Callable] = None,
) -> Dict[str, Any]:
    tier = tier.lower()
    if tier not in TIER_CONFIG:
        raise ValueError(f"Unknown tier: {tier}")
    cfg = TIER_CONFIG[tier]

    total_symbols = len(symbols)
    total_converted = 0
    total_skipped = 0
    total_errors = 0
    results: Dict[str, Dict] = {}

    def _progress(msg, idx, converted, skipped, errors, total):
        if progress_callback:
            progress_callback(msg, idx, converted, skipped, errors, total)

    with ThreadPoolExecutor(max_workers=cfg["concurrency"]) as executor:
        futures = []
        for sym in symbols:
            if bars:
                futures.append(executor.submit(
                    download_equity_bars, sym, start_date, end_date, output_dir, api_key, tier, _progress,
                ))
            if greeks:
                futures.append(executor.submit(
                    download_option_greeks, sym, start_date, end_date, output_dir, api_key, tier, _progress,
                ))

        for future in as_completed(futures):
            try:
                result = future.result()
                total_converted += result.get("converted", 0)
                total_skipped += result.get("skipped", 0)
                total_errors += result.get("errors", 0)
            except Exception as e:
                logger.error("Batch task failed: %s", e)
                total_errors += 1

    stats = {
        "converted": total_converted,
        "skipped": total_skipped,
        "errors": total_errors,
        "total_symbols": total_symbols,
    }
    if progress_callback:
        progress_callback(
            f"Batch done — {total_converted} records, {total_skipped} skipped, {total_errors} errors",
            total_symbols, total_converted, total_symbols, total_skipped, total_symbols,
        )
    return stats


def scan_ticker_coverage(catalog_path: str) -> List[Dict[str, Any]]:
    tickers: Dict[str, Dict] = {}
    theta_dir = Path(catalog_path) / "theta"
    if not theta_dir.exists():
        return []

    for sym_dir in sorted(theta_dir.iterdir()):
        if not sym_dir.is_dir():
            continue
        ticker = sym_dir.name.upper()
        info: Dict[str, Any] = {
            "ticker": ticker,
            "bars_date_range": None,
            "greeks_date_range": None,
            "total_files": 0,
            "total_size_bytes": 0,
        }

        bars_dir = sym_dir / "5min"
        if bars_dir.exists():
            years = sorted(
                int(d.name) for d in bars_dir.iterdir() if d.is_dir() and d.name.isdigit()
            )
            if years:
                months_bars = _completed_months(bars_dir)
                if months_bars:
                    ys = sorted({y for y, m in months_bars})
                    info["bars_date_range"] = f"{min(ys)}-{max(ys)}"
                for f in bars_dir.rglob("*.parquet"):
                    info["total_files"] += 1
                    info["total_size_bytes"] += f.stat().st_size

        greeks_dir = sym_dir / "option_greeks_eod"
        if greeks_dir.exists():
            months_greeks = _completed_months(greeks_dir)
            if months_greeks:
                ys = sorted({y for y, m in months_greeks})
                info["greeks_date_range"] = f"{min(ys)}-{max(ys)}"
            for f in greeks_dir.rglob("*.parquet"):
                info["total_files"] += 1
                info["total_size_bytes"] += f.stat().st_size

        tickers[ticker] = info

    return sorted(tickers.values(), key=lambda x: x["ticker"])


def delete_ticker(catalog_path: str, ticker: str) -> int:
    theta_dir = Path(catalog_path) / "theta" / ticker.upper()
    if theta_dir.exists():
        shutil.rmtree(theta_dir)
        logger.info("Deleted ticker directory: %s", theta_dir)
        return 1
    return 0


def list_symbols(catalog_path: Optional[str] = None, api_key: Optional[str] = None) -> List[str]:
    if catalog_path is None:
        try:
            from thetadata import ThetaClient
            kwargs = {}
            if api_key:
                kwargs["api_key"] = api_key
            client = ThetaClient(**kwargs)
            syms = _to_pandas(client.stock_list_symbols())
            if syms is not None and not syms.empty:
                return sorted(syms.iloc[:, 0].tolist())
        except Exception as e:
            logger.error("list_symbols from ThetaData failed: %s", e)
        return []

    theta_dir = Path(catalog_path) / "theta"
    if not theta_dir.exists():
        return []
    return sorted(
        d.name for d in theta_dir.iterdir()
        if d.is_dir() and not d.name.startswith(".")
    )

"""
data_loader.py — reads market data from the theta archive (float64+zstd parquet)
for use by the backtest engines. No nautilus_trader dependency, no yfinance.

Pipeline: theta/{SYMBOL}/5min/ → aggregation → yfinance-compatible DataFrame.
"""

import logging
import os
from datetime import datetime, timezone
from pathlib import Path
from typing import Dict, List, Optional, Tuple

import pandas as pd

logger = logging.getLogger(__name__)


def get_archive_root() -> Path:
    return Path(os.getenv("NAUTILUS_CATALOG_PATH", "./data_lake")).resolve()


def _archive_symbol(symbol: str) -> str:
    """Convert Yahoo-style ticker to archive path convention."""
    return symbol.replace("^", "").upper()


def _parquet_files_in_range(
    archive_dir: Path, start: datetime, end: datetime
) -> List[Path]:
    """List parquet files in theta/{SYMBOL}/{YYYY}/{MM}.parquet covering [start, end]."""
    files: List[Path] = []
    if not archive_dir.exists():
        return files

    for year_dir in sorted(archive_dir.iterdir()):
        if not year_dir.is_dir():
            continue
        try:
            year = int(year_dir.name)
        except ValueError:
            continue
        year_start = datetime(year, 1, 1, tzinfo=timezone.utc)
        year_end = datetime(year, 12, 31, 23, 59, tzinfo=timezone.utc)
        if year_start > end or year_end < start:
            continue

        for f in sorted(year_dir.iterdir()):
            if f.suffix != ".parquet":
                continue
            try:
                month = int(f.stem)
            except ValueError:
                continue
            month_start = datetime(year, month, 1, tzinfo=timezone.utc)
            month_end = (
                datetime(year + 1, 1, 1, tzinfo=timezone.utc) if month == 12
                else datetime(year, month + 1, 1, tzinfo=timezone.utc)
            ) - pd.Timedelta(seconds=1)
            if month_start > end or month_end < start:
                continue
            files.append(f)

    return files


def _aggregate_daily(df: pd.DataFrame) -> pd.DataFrame:
    """Aggregate intraday bars to daily OHLCV."""
    df = df.copy()
    df["Date"] = pd.to_datetime(df["ts_event"], unit="ns").dt.date
    daily = df.groupby("Date").agg(
        Open=("open", "first"),
        High=("high", "max"),
        Low=("low", "min"),
        Close=("close", "last"),
        Volume=("volume", "sum"),
    ).reset_index()
    daily["Date"] = pd.to_datetime(daily["Date"])
    return daily


def load_bars(
    symbol: str,
    start: str,
    end: str,
    resolution: str = "daily",
) -> pd.DataFrame:
    """
    Read bars from the theta archive.

    Returns yfinance-compatible DataFrame with columns:
        Date, Open, High, Low, Close, Volume

    Raises FileNotFoundError if the ticker is not in the archive.
    """
    start_dt = datetime.fromisoformat(start).replace(tzinfo=timezone.utc) if "T" in start else datetime.strptime(start, "%Y-%m-%d").replace(tzinfo=timezone.utc)
    end_dt = datetime.fromisoformat(end).replace(tzinfo=timezone.utc) if "T" in end else datetime.strptime(end, "%Y-%m-%d").replace(tzinfo=timezone.utc)

    sym = _archive_symbol(symbol)
    bars_dir = get_archive_root() / "theta" / sym / "5min"

    files = _parquet_files_in_range(bars_dir, start_dt, end_dt)
    if not files:
        raise FileNotFoundError(
            f"No data for {symbol} in theta archive ({bars_dir}). "
            f"Download it from the Data Harvest tab first."
        )

    chunks: List[pd.DataFrame] = []
    for fpath in files:
        df = pd.read_parquet(fpath)
        if df.empty:
            continue
        chunks.append(df)

    if not chunks:
        raise FileNotFoundError(f"Empty parquet files for {symbol} in archive.")

    df = pd.concat(chunks, ignore_index=True)

    # Filter exact date range
    df["_ts"] = pd.to_datetime(df["ts_event"], unit="ns")
    df = df[(df["_ts"] >= start_dt) & (df["_ts"] <= end_dt)]
    df = df.sort_values("_ts").reset_index(drop=True)

    if df.empty:
        raise FileNotFoundError(
            f"No data for {symbol} between {start} and {end} in archive."
        )

    if resolution == "daily":
        result = _aggregate_daily(df)
    else:
        result = pd.DataFrame({
            "Date": df["_ts"],
            "Open": df["open"],
            "High": df["high"],
            "Low": df["low"],
            "Close": df["close"],
            "Volume": df["volume"],
        }).reset_index(drop=True)

    return result


def load_daily_prices(symbol: str, start: str, end: str) -> pd.DataFrame:
    """Convenience wrapper — daily bars only."""
    return load_bars(symbol, start, end, resolution="daily")

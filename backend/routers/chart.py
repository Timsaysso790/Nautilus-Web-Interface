"""
Chart data API — OHLCV with technical indicators for the chart view.
Pulls from Equity_Archive (daily) or Options_Archive5min (5-min bars).
"""
import logging
import math
import os
from pathlib import Path
from typing import Any, Dict, List, Optional, Tuple

from fastapi import APIRouter, Depends, HTTPException, Query
import pandas as pd

from auth_jwt import get_current_user

logger = logging.getLogger(__name__)
router = APIRouter(prefix="/api/chart", tags=["chart"])

EQUITY_ARCHIVE = Path(os.getenv("EQUITY_ARCHIVE_PATH", "/workspace/Archive/Equity_Archive"))
OPTIONS_ARCHIVE = Path(os.getenv("OPTIONS_ARCHIVE_PATH", "/workspace/Archive/Nautilus_Archive5min"))


def _sma(data: List[float], period: int) -> List[Optional[float]]:
    result = [None] * len(data)
    for i in range(period - 1, len(data)):
        result[i] = sum(data[i - period + 1 : i + 1]) / period
    return result


def _ema(data: List[float], period: int) -> List[Optional[float]]:
    result = [None] * len(data)
    multiplier = 2 / (period + 1)
    for i in range(len(data)):
        if i == 0:
            result[i] = data[i]
        elif i < period - 1:
            result[i] = data[i]  # not enough data
        elif i == period - 1:
            result[i] = sum(data[:period]) / period
        else:
            result[i] = (data[i] - result[i - 1]) * multiplier + result[i - 1]
    return result


def _rsi(data: List[float], period: int = 14) -> List[Optional[float]]:
    result = [None] * len(data)
    gains = []
    losses = []
    for i in range(1, len(data)):
        diff = data[i] - data[i - 1]
        gains.append(diff if diff > 0 else 0)
        losses.append(-diff if diff < 0 else 0)
    for i in range(period, len(gains)):
        avg_gain = sum(gains[i - period : i]) / period
        avg_loss = sum(losses[i - period : i]) / period
        if avg_loss == 0:
            result[i + 1] = 100.0
        else:
            rs = avg_gain / avg_loss
            result[i + 1] = 100 - (100 / (1 + rs))
    return result


def _bollinger(data: List[float], period: int = 20, std_dev: float = 2.0) -> Tuple[List[Optional[float]], List[Optional[float]], List[Optional[float]]]:
    mid = _sma(data, period)
    upper = [None] * len(data)
    lower = [None] * len(data)
    for i in range(period - 1, len(data)):
        slice_data = data[i - period + 1 : i + 1]
        mean = sum(slice_data) / period
        variance = sum((x - mean) ** 2 for x in slice_data) / period
        std = math.sqrt(variance)
        upper[i] = mean + std_dev * std
        lower[i] = mean - std_dev * std
    return upper, mid, lower


@router.get("/{ticker}")
async def get_chart_data(
    ticker: str,
    start: str = Query("2024-01-01"),
    end: str = Query("2026-07-20"),
    indicators: str = Query("bb,sma20,rsi", description="Comma-separated: bb, sma20, sma50, ema12, ema26, rsi"),
    user: dict = Depends(get_current_user),
):
    """Get OHLCV data with technical indicators for charting."""
    ticker = ticker.upper()

    # Try equity archive first, fall back to options archive
    df = None
    ticker_dir = EQUITY_ARCHIVE / ticker
    if ticker_dir.exists():
        dfs = []
        for f in sorted(ticker_dir.glob("*.parquet")):
            dfs.append(pd.read_parquet(f))
        if dfs:
            df = pd.concat(dfs, ignore_index=True)
    else:
        # Try options archive — use underlying_price as close
        ticker_dir = OPTIONS_ARCHIVE / ticker
        if ticker_dir.exists():
            dfs = []
            for f in sorted(ticker_dir.glob("*.parquet")):
                d = pd.read_parquet(f)
                if "underlying_price" in d.columns:
                    # Aggregate to daily bars from 5-min data
                    d["date_str"] = d["date"].astype(str)
                    daily = d.groupby("date_str").agg({
                        "underlying_price": ["first", "max", "min", "last"],
                        "volume": "sum",
                    }).reset_index()
                    daily.columns = ["date", "open", "high", "low", "close", "volume"]
                    dfs.append(daily)
            if dfs:
                df = pd.concat(dfs, ignore_index=True)

    if df is None or df.empty:
        raise HTTPException(404, f"No data for {ticker}")

    # Ensure date column
    if "date" in df.columns:
        df["date"] = pd.to_datetime(df["date"].astype(str), errors="coerce")
    df = df.sort_values("date").dropna(subset=["date"])

    # Filter date range
    mask = (df["date"] >= pd.Timestamp(start)) & (df["date"] <= pd.Timestamp(end))
    df = df[mask].copy()
    if df.empty:
        raise HTTPException(404, f"No data for {ticker} in range {start} to {end}")

    closes = df["close"].tolist()
    indicator_flag = indicators.split(",") if indicators else []

    # Build candle data
    candles = []
    for _, row in df.iterrows():
        candles.append({
            "time": int(row["date"].timestamp()),
            "open": float(row["open"]),
            "high": float(row["high"]),
            "low": float(row["low"]),
            "close": float(row["close"]),
            "volume": int(row.get("volume", 0) or 0),
        })

    # Compute indicators
    result = {"ticker": ticker, "candles": candles, "indicators": {}}

    for ind in indicator_flag:
        ind = ind.strip().lower()
        if ind == "bb":
            upper, mid, lower = _bollinger(closes)
            result["indicators"]["bb"] = {
                "upper": [{"time": c["time"], "value": v} for c, v in zip(candles, upper) if v is not None],
                "mid": [{"time": c["time"], "value": v} for c, v in zip(candles, mid) if v is not None],
                "lower": [{"time": c["time"], "value": v} for c, v in zip(candles, lower) if v is not None],
            }
        elif ind == "sma20":
            values = _sma(closes, 20)
            result["indicators"]["sma20"] = [{"time": c["time"], "value": v} for c, v in zip(candles, values) if v is not None]
        elif ind == "sma50":
            values = _sma(closes, 50)
            result["indicators"]["sma50"] = [{"time": c["time"], "value": v} for c, v in zip(candles, values) if v is not None]
        elif ind == "ema12":
            values = _ema(closes, 12)
            result["indicators"]["ema12"] = [{"time": c["time"], "value": v} for c, v in zip(candles, values) if v is not None]
        elif ind == "ema26":
            values = _ema(closes, 26)
            result["indicators"]["ema26"] = [{"time": c["time"], "value": v} for c, v in zip(candles, values) if v is not None]
        elif ind == "rsi":
            values = _rsi(closes)
            result["indicators"]["rsi"] = [{"time": c["time"], "value": v} for c, v in zip(candles, values) if v is not None]

    return result

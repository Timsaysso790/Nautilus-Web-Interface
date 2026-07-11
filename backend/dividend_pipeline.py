"""
Dividend pipeline — yfinance dividend scraper + schedule builder + forward projection.
"""

import json
import logging
from datetime import date, datetime, timezone
from typing import Dict, List, Optional

import pandas as pd
import yfinance as yf

import database

logger = logging.getLogger(__name__)


async def get_dividend_history(ticker: str, start: str, end: str) -> pd.Series:
    """Fetch dividend history from yfinance, with SQLite cache."""
    cached = await get_cached_dividends(ticker)
    if cached is not None:
        cached_dates = pd.to_datetime(cached.index)
        mask = (cached_dates >= start) & (cached_dates <= end)
        return cached[mask.values]

    tk = yf.Ticker(ticker)
    divs = tk.dividends
    if divs is None or divs.empty:
        return pd.Series(dtype=float)

    # Cache the whole series
    divs_json = json.dumps([
        {"date": str(d.date()), "amount": float(v)}
        for d, v in divs.items()
    ])
    await cache_dividends(ticker, divs_json)

    divs.index = pd.to_datetime(divs.index)
    mask = (divs.index >= start) & (divs.index <= end)
    return divs[mask]


async def get_cached_dividends(ticker: str) -> Optional[pd.Series]:
    """Return cached dividend series or None."""
    async with database._execute_async(
        "SELECT dividends FROM dividend_cache WHERE ticker = ?", (ticker.upper(),)
    ) as cur:
        row = await cur.fetchone()
    if not row:
        return None
    try:
        records = json.loads(row["dividends"])
        dates = pd.to_datetime([r["date"] for r in records])
        amounts = [r["amount"] for r in records]
        return pd.Series(amounts, index=dates)
    except (json.JSONDecodeError, KeyError, TypeError):
        return None


async def cache_dividends(ticker: str, dividends_json: str) -> None:
    """Persist dividend data in SQLite cache."""
    now = datetime.now(timezone.utc).isoformat()
    async with database._execute_async(
        """INSERT OR REPLACE INTO dividend_cache (ticker, dividends, fetched_at)
           VALUES (?, ?, ?)""",
        (ticker.upper(), dividends_json, now),
        commit=True,
    ):
        pass


async def project_dividends(
    tickers: List[str],
    start: str,
    end: str,
    existing_positions: Optional[Dict[str, float]] = None,
) -> Dict[str, float]:
    """
    Project total dividends per ticker between start and end.
    Returns {ticker: total_dividend_cash}.
    Uses the most recent dividend as proxy for forward dividends.
    """
    result: Dict[str, float] = {}
    for ticker in tickers:
        divs = await get_dividend_history(ticker, start, end)
        if divs.empty:
            # Fallback: use last known dividend as a single projected payment
            tk = yf.Ticker(ticker)
            all_divs = tk.dividends
            if all_divs is not None and not all_divs.empty:
                last_div = float(all_divs.iloc[-1])
                # Assume 4 payments/year for most dividend stocks
                months = max(1, (pd.to_datetime(end) - pd.to_datetime(start)).days / 30)
                result[ticker] = last_div * (months / 3)
            else:
                result[ticker] = 0.0
        else:
            result[ticker] = float(divs.sum())
    return result


async def get_dividends_on_date(ticker: str, target_date: date) -> float:
    """Return dividend amount for a ticker on a specific date, or 0.0."""
    divs = await get_cached_dividends(ticker)
    if divs is None or divs.empty:
        return 0.0
    target = pd.Timestamp(target_date)
    if target in divs.index:
        return float(divs[target])
    return 0.0

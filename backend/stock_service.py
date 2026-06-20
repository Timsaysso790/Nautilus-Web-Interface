import logging
import os
from datetime import datetime, timezone
from pathlib import Path
from typing import Any, Dict, List, Optional

import pandas as pd
import yfinance as yf

logger = logging.getLogger(__name__)

NAUTILUS_CATALOG_PATH = Path(os.getenv("NAUTILUS_CATALOG_PATH", "./data_lake"))


def _find_catalog_bars(symbol: str, interval: str = "1d") -> Optional[List[Dict[str, Any]]]:
    """Try to read bar data from the ParquetDataCatalog.

    Searches for ``<catalog>/data/bar/<symbol>/*.parquet`` files and returns
    the rows sorted by timestamp.  Returns ``None`` when nothing is found.
    """
    bars_dir = NAUTILUS_CATALOG_PATH / "data" / "bar" / symbol.upper()
    if not bars_dir.exists():
        bars_dir = NAUTILUS_CATALOG_PATH / "data" / "bar" / f"{symbol.upper()}.OPRA"
    if not bars_dir.exists():
        return None

    try:
        import pyarrow.parquet as pq

        frames = []
        for f in sorted(bars_dir.glob("*.parquet")):
            table = pq.read_table(f)
            frames.append(table.to_pandas())

        if not frames:
            return None

        df = pd.concat(frames, ignore_index=True)
        if "timestamp" in df.columns:
            df["timestamp"] = pd.to_datetime(df["timestamp"])
            df.sort_values("timestamp", inplace=True)

        records = df.to_dict(orient="records")
        for r in records:
            if isinstance(r.get("timestamp"), pd.Timestamp):
                r["timestamp"] = r["timestamp"].isoformat()
            for k in ("open", "high", "low", "close", "volume"):
                if k in r and isinstance(r[k], (float, int)):
                    r[k] = float(r[k])
        return records
    except Exception as e:
        logger.warning("Failed to read catalog bars for %s: %s", symbol, e)
        return None


async def search_symbols(query: str) -> List[Dict[str, Any]]:
    """Search for stock symbols matching *query*.

    Checks the catalog first, then falls back to yfinance search.
    Returns a list of ``{"symbol": ..., "name": ...}`` dicts.
    """
    results: List[Dict[str, Any]] = []

    q = query.upper().strip()
    if not q:
        return results

    # Check catalog for matching instrument IDs
    data_dir = NAUTILUS_CATALOG_PATH / "data"
    if data_dir.exists():
        for data_type_dir in data_dir.iterdir():
            if not data_type_dir.is_dir():
                continue
            for instr_dir in data_type_dir.iterdir():
                name = instr_dir.name
                if q in name.upper():
                    entry = {"symbol": name, "name": name, "source": "catalog"}
                    if entry not in results:
                        results.append(entry)

    # Try yfinance
    try:
        tickers = yf.Tickers(q)
        for t in q.split():
            tk = tickers.tickers.get(t.upper())
            if tk and tk.info:
                info = tk.info
                results.append({
                    "symbol": info.get("symbol", t.upper()),
                    "name": info.get("longName") or info.get("shortName") or t.upper(),
                    "source": "yfinance",
                })
    except Exception:
        pass

    return results


async def get_quote(symbol: str) -> Dict[str, Any]:
    """Return a real-time quote for *symbol*.

    Uses yfinance as the primary source.
    """
    upper = symbol.upper()
    try:
        tk = yf.Ticker(upper)
        info = tk.info or {}
        fast = tk.fast_info
        price = None
        if fast:
            try:
                price = fast.last_price if hasattr(fast, "last_price") else fast.get("lastPrice", None)
            except Exception:
                price = info.get("currentPrice") or info.get("regularMarketPrice") or info.get("previousClose")
        else:
            price = info.get("currentPrice") or info.get("regularMarketPrice") or info.get("previousClose")

        prev_close = info.get("previousClose") or info.get("regularMarketPreviousClose")
        change = None
        change_pct = None
        if price is not None and prev_close is not None and prev_close != 0:
            change = round(price - prev_close, 2)
            change_pct = round((change / prev_close) * 100, 2)

        return {
            "symbol": upper,
            "price": price,
            "change": change,
            "change_pct": change_pct,
            "bid": info.get("bid"),
            "ask": info.get("ask"),
            "volume": info.get("volume") or info.get("regularMarketVolume"),
            "open": info.get("regularMarketOpen"),
            "high": info.get("regularMarketDayHigh") or info.get("dayHigh"),
            "low": info.get("regularMarketDayLow") or info.get("dayLow"),
            "prev_close": prev_close,
            "market_cap": info.get("marketCap"),
            "name": info.get("longName") or info.get("shortName") or upper,
            "exchange": info.get("exchange"),
            "timestamp": datetime.now(timezone.utc).isoformat(),
        }
    except Exception as e:
        logger.warning("yfinance quote failed for %s: %s", upper, e)
        return {
            "symbol": upper,
            "price": None,
            "change": None,
            "change_pct": None,
            "error": str(e),
            "timestamp": datetime.now(timezone.utc).isoformat(),
        }


async def get_history(
    symbol: str,
    interval: str = "1d",
    start: Optional[str] = None,
    end: Optional[str] = None,
) -> List[Dict[str, Any]]:
    """Return historical OHLCV bars for *symbol*.

    Resolution ladder (catalog first, yfinance fallback):
      - Catalog parquet bars (when available)
      - yfinance download
    """
    upper = symbol.upper()

    # Try catalog first
    bars = _find_catalog_bars(upper, interval)
    if bars is not None:
        return bars

    # Fall back to yfinance
    try:
        period = "max"
        if start and end:
            tk = yf.Ticker(upper)
            df = tk.history(start=start, end=end, interval=_map_interval(interval))
        else:
            tk = yf.Ticker(upper)
            df = tk.history(period=period, interval=_map_interval(interval))

        if df.empty:
            return []

        df.reset_index(inplace=True)
        records = []
        for _, row in df.iterrows():
            ts = row.get("Date") or row.get("Datetime")
            if isinstance(ts, pd.Timestamp):
                ts = ts.isoformat()
            records.append({
                "timestamp": ts,
                "open": float(row.get("Open", 0)),
                "high": float(row.get("High", 0)),
                "low": float(row.get("Low", 0)),
                "close": float(row.get("Close", 0)),
                "volume": float(row.get("Volume", 0)),
            })
        return records
    except Exception as e:
        logger.warning("yfinance history failed for %s: %s", upper, e)
        return []


async def get_info(symbol: str) -> Dict[str, Any]:
    """Return company fundamentals and metadata."""
    upper = symbol.upper()
    try:
        tk = yf.Ticker(upper)
        info = tk.info or {}
        return {
            "symbol": upper,
            "name": info.get("longName") or info.get("shortName") or upper,
            "sector": info.get("sector"),
            "industry": info.get("industry"),
            "exchange": info.get("exchange"),
            "market_cap": info.get("marketCap"),
            "pe_ratio": info.get("trailingPE") or info.get("forwardPE"),
            "dividend_yield": info.get("dividendYield"),
            "beta": info.get("beta"),
            "52w_high": info.get("fiftyTwoWeekHigh"),
            "52w_low": info.get("fiftyTwoWeekLow"),
            "avg_volume": info.get("averageVolume"),
            "description": info.get("longBusinessSummary"),
        }
    except Exception as e:
        logger.warning("yfinance info failed for %s: %s", upper, e)
        return {"symbol": upper, "error": str(e)}


def _map_interval(interval: str) -> str:
    mapping = {
        "1m": "1m",
        "2m": "2m",
        "5m": "5m",
        "15m": "15m",
        "30m": "30m",
        "60m": "60m",
        "1h": "60m",
        "1d": "1d",
        "5d": "5d",
        "1wk": "1wk",
        "1mo": "1mo",
        "3mo": "3mo",
    }
    return mapping.get(interval, "1d")




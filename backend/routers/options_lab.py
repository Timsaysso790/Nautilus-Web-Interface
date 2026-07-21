"""
Options Lab API router.
Chain viewer, Greeks, payoff diagrams, IV surface, screener — all from local parquet.
"""
import logging
import os
from datetime import datetime, timezone
from pathlib import Path
from typing import Any, Dict, List, Optional

import pandas as pd
import pyarrow.parquet as pq
from fastapi import APIRouter, HTTPException, Query
from pydantic import BaseModel

logger = logging.getLogger(__name__)
router = APIRouter(prefix="/api/options-lab", tags=["options-lab"])

ARCHIVE_PATH = Path(os.getenv("OPTIONS_ARCHIVE_PATH", "/workspace/Archive/Nautilus_Archive5min"))


def _load_ticker_data(ticker: str, year: Optional[int] = None) -> pd.DataFrame:
    """Load parquet data for a ticker. If year is None, loads the most recent year."""
    ticker_dir = ARCHIVE_PATH / ticker.upper()
    if not ticker_dir.exists():
        raise HTTPException(404, f"Ticker {ticker} not found in archive")

    parquets = sorted(ticker_dir.glob(f"{ticker.upper()}_*.parquet"))
    if not parquets:
        raise HTTPException(404, f"No data files for {ticker}")

    if year:
        target = ticker_dir / f"{ticker.upper()}_{year}.parquet"
        if not target.exists():
            raise HTTPException(404, f"No data for {ticker} in {year}")
        return pd.read_parquet(target)
    else:
        # Load most recent year
        return pd.read_parquet(parquets[-1])


@router.get("/expirations/{ticker}")
async def get_expirations(ticker: str, year: Optional[int] = None):
    """Get all available expiration dates for a ticker."""
    df = _load_ticker_data(ticker, year)
    exps = sorted(df["expiration"].unique().tolist())
    return {"ticker": ticker.upper(), "expirations": exps, "count": len(exps)}


@router.get("/chain/{ticker}/{expiration}")
async def get_chain(
    ticker: str,
    expiration: str,
    year: Optional[int] = None,
    right: Optional[str] = Query(None, pattern="^(C|P)$"),
):
    """Get option chain for a ticker + expiration date."""
    df = _load_ticker_data(ticker, year)
    chain = df[df["expiration"] == expiration].copy()

    if chain.empty:
        raise HTTPException(404, f"No chain data for {ticker} {expiration}")

    if right:
        chain = chain[chain["right"] == right]

    # Sort by strike
    chain = chain.sort_values("strike_price")

    # Underlying price from first row
    underlying = float(chain["underlying_price"].iloc[0]) if "underlying_price" in chain.columns else None

    rows = []
    for _, row in chain.iterrows():
        rows.append({
            "strike": float(row["strike_price"]),
            "right": str(row["right"]),
            "bid": float(row.get("bid", 0) or 0),
            "ask": float(row.get("ask", 0) or 0),
            "last": float(row.get("close", row.get("last", 0)) or 0),
            "volume": int(row.get("volume", 0) or 0),
            "trades": int(row.get("trades", 0) or 0),
            "iv": float(row.get("implied_volatility", 0) or 0),
            "delta": float(row.get("delta", 0) or 0),
            "gamma": float(row.get("gamma", 0) or 0),
            "theta": float(row.get("theta", 0) or 0),
            "vega": float(row.get("vega", 0) or 0),
            "rho": float(row.get("rho", 0) or 0),
        })

    return {
        "ticker": ticker.upper(),
        "expiration": expiration,
        "underlying_price": underlying,
        "rows": rows,
        "count": len(rows),
    }


@router.get("/greeks/{ticker}/{expiration}/{strike}")
async def get_greeks(ticker: str, expiration: str, strike: float):
    """Get Greeks for a specific strike."""
    df = _load_ticker_data(ticker)
    row = df[(df["expiration"] == expiration) & (df["strike_price"] == strike)]
    if row.empty:
        raise HTTPException(404, f"No data for {ticker} {expiration} {strike}")

    row = row.iloc[-1]  # Most recent snapshot
    return {
        "ticker": ticker.upper(),
        "expiration": expiration,
        "strike": float(row["strike_price"]),
        "right": str(row["right"]),
        "underlying_price": float(row.get("underlying_price", 0)),
        "iv": float(row.get("implied_volatility", 0)),
        "delta": float(row.get("delta", 0)),
        "gamma": float(row.get("gamma", 0)),
        "theta": float(row.get("theta", 0)),
        "vega": float(row.get("vega", 0)),
        "rho": float(row.get("rho", 0)),
        "bid": float(row.get("bid", 0)),
        "ask": float(row.get("ask", 0)),
    }


@router.get("/iv-surface/{ticker}")
async def get_iv_surface(ticker: str, year: Optional[int] = None):
    """Get IV surface: strikes × expirations as a grid."""
    df = _load_ticker_data(ticker, year)
    # Pick one snapshot per expiration-strike combo (latest date)
    df = df.sort_values("date")
    surface = df.groupby(["expiration", "strike_price"]).last().reset_index()

    expirations = sorted(surface["expiration"].unique().tolist())
    strikes = sorted(surface["strike_price"].unique().tolist())

    grid = []
    for _, row in surface.iterrows():
        grid.append({
            "expiration": str(row["expiration"]),
            "strike": float(row["strike_price"]),
            "iv": float(row.get("implied_volatility", 0) or 0),
            "delta": float(row.get("delta", 0) or 0),
        })

    return {
        "ticker": ticker.upper(),
        "expirations": expirations,
        "strikes": strikes,
        "grid": grid,
        "expiration_count": len(expirations),
        "strike_count": len(strikes),
    }


@router.get("/screener")
async def screener(
    ticker: str = Query(...),
    dte_min: int = Query(30, ge=1),
    dte_max: int = Query(60, ge=1),
    delta_min: float = Query(0.10, ge=0, le=1),
    delta_max: float = Query(0.25, ge=0, le=1),
    credit_min: float = Query(0.0, ge=0),
    strategy: str = Query("credit_spread", pattern="^(credit_spread|debit_spread|iron_condor)$"),
    year: Optional[int] = None,
):
    """Screen for option strategies meeting criteria."""
    df = _load_ticker_data(ticker, year)

    # Convert expiration to DTE
    df["exp_date"] = pd.to_datetime(df["expiration"], format="%Y%m%d", errors="coerce")
    df["trade_date"] = pd.to_datetime(df["date"].astype(str), format="%Y%m%d", errors="coerce")
    df["dte"] = (df["exp_date"] - df["trade_date"]).dt.days

    # Filter by DTE
    mask = (df["dte"] >= dte_min) & (df["dte"] <= dte_max)
    df = df[mask].copy()

    if df.empty:
        return {"ticker": ticker.upper(), "results": [], "count": 0}

    # Filter by delta range (puts only for credit spreads)
    if strategy == "credit_spread":
        df = df[df["right"] == "P"]
        df = df[(df["delta"] >= delta_min) & (df["delta"] <= delta_max)]
    else:
        df = df[(df["delta"].abs() >= delta_min) & (df["delta"].abs() <= delta_max)]

    # Deduplicate by expiration + strike (latest snapshot per group)
    df = df.sort_values("date").groupby(["expiration", "strike_price"]).last().reset_index()

    results = []
    for _, row in df.iterrows():
        credit = round(float(row.get("ask", 0) or 0) * 100, 2)  # Per share to premium
        if credit < credit_min:
            continue
        results.append({
            "ticker": ticker.upper(),
            "expiration": str(row["expiration"]),
            "expiration_date": str(row["exp_date"].date()) if pd.notna(row.get("exp_date")) else "",
            "dte": int(row["dte"]),
            "strike": float(row["strike_price"]),
            "right": str(row["right"]),
            "mid": round((float(row.get("bid", 0) or 0) + float(row.get("ask", 0) or 0)) / 2, 2),
            "credit": credit,
            "iv": round(float(row["implied_volatility"] or 0), 4),
            "delta": round(float(row["delta"] or 0), 4),
            "gamma": round(float(row["gamma"] or 0), 4),
            "theta": round(float(row["theta"] or 0), 4),
            "vega": round(float(row["vega"] or 0), 4),
            "underlying_price": float(row.get("underlying_price", 0)),
        })

    return {"ticker": ticker.upper(), "results": results, "count": len(results)}


@router.get("/info/{ticker}")
async def ticker_info(ticker: str):
    """Get summary info about a ticker in the archive."""
    ticker_dir = ARCHIVE_PATH / ticker.upper()
    if not ticker_dir.exists():
        raise HTTPException(404, f"Ticker {ticker} not found")

    parquets = sorted(ticker_dir.glob("*.parquet"))
    total_size = sum(f.stat().st_size for f in parquets)
    years = [f.stem.split("_")[-1] for f in parquets]

    # Quick stats from most recent year
    stats = {}
    if parquets:
        df = pd.read_parquet(parquets[-1])
        stats = {
            "rows": len(df),
            "expirations": int(df["expiration"].nunique()),
            "strikes": int(df["strike_price"].nunique()),
            "date_min": str(df["date"].min()),
            "date_max": str(df["date"].max()),
            "avg_iv": round(float(df["implied_volatility"].mean()), 4) if "implied_volatility" in df.columns else None,
        }

    return {
        "ticker": ticker.upper(),
        "in_archive": True,
        "files": len(parquets),
        "size_mb": round(total_size / 1e6, 1),
        "years": years,
        "stats": stats,
    }

"""
Portfolio Backtest API Router.
POST /api/portfolio/backtest — run a full portfolio simulation.
"""
import asyncio
import logging
from typing import Any, Dict, List, Optional

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel, Field

from auth_jwt import get_current_user
from engines.portfolio_engine import (
    PortfolioBacktestEngine,
    PortfolioConfig,
    PortfolioAsset,
    CashEvent,
)

logger = logging.getLogger(__name__)
router = APIRouter(prefix="/api/portfolio", tags=["portfolio-backtest"])

_portfolio_lock = asyncio.Lock()


class AssetConfig(BaseModel):
    ticker: str
    weight: float = Field(gt=0, le=100)
    dividend_yield: float = Field(0.0, ge=0, le=1.0)


class CashEventConfig(BaseModel):
    date: str  # YYYY-MM-DD
    amount: float
    description: str = ""


class PortfolioBacktestRequest(BaseModel):
    assets: List[AssetConfig] = Field(min_length=1, max_length=20)
    initial_cash: float = Field(100_000, ge=0)
    margin_target: float = Field(0.0, ge=0, le=200)
    margin_rate: float = Field(0.065, ge=0, le=1.0)
    interest_free_buffer: float = Field(1000, ge=0)
    drip_enabled: bool = True
    maintenance_req_pct: float = Field(0.25, ge=0.1, le=0.5)
    start_date: str = "2020-01-01"
    end_date: str = ""
    deposits: List[CashEventConfig] = []
    withdrawals: List[CashEventConfig] = []


@router.post("/backtest")
async def run_portfolio_backtest(
    req: PortfolioBacktestRequest,
    user: dict = Depends(get_current_user),
):
    """Run a full portfolio backtest with margin, dividends, and cash flows."""
    async with _portfolio_lock:
        try:
            assets = [
                PortfolioAsset(a.ticker, a.weight, a.dividend_yield)
                for a in req.assets
            ]
            deposits = [
                CashEvent(d.date, d.amount, d.description)
                for d in req.deposits
            ]
            withdrawals = [
                CashEvent(w.date, -abs(w.amount), w.description)
                for w in req.withdrawals
            ]

            config = PortfolioConfig(
                assets=assets,
                initial_cash=req.initial_cash,
                margin_target=req.margin_target,
                margin_rate=req.margin_rate,
                interest_free_buffer=req.interest_free_buffer,
                drip_enabled=req.drip_enabled,
                maintenance_req_pct=req.maintenance_req_pct,
                start_date=req.start_date,
                end_date=req.end_date or "",
                deposits=deposits,
                withdrawals=withdrawals,
            )

            loop = asyncio.get_event_loop()
            engine = PortfolioBacktestEngine(config)
            result = await loop.run_in_executor(None, engine.run)
            return result

        except FileNotFoundError as e:
            raise HTTPException(404, str(e))
        except ValueError as e:
            raise HTTPException(400, str(e))
        except Exception as e:
            logger.exception("Portfolio backtest failed")
            raise HTTPException(500, f"Portfolio backtest failed: {str(e)[:200]}")


@router.get("/tickers")
async def list_available_equity_tickers(user: dict = Depends(get_current_user)):
    """List all tickers available in the equity archive for portfolio backtesting."""
    from pathlib import Path
    import os
    archive = Path(os.getenv("EQUITY_ARCHIVE_PATH", "/workspace/Archive/Equity_Archive"))
    if not archive.exists():
        # Fall back to options archive
        alt = Path(os.getenv("OPTIONS_ARCHIVE_PATH", "/workspace/Archive/Nautilus_Archive5min"))
        if alt.exists():
            tickers = sorted(d.name for d in alt.iterdir() if d.is_dir() and not d.name.startswith("."))
            return {"tickers": tickers, "archive_path": str(alt), "count": len(tickers), "found": True}
        return {"tickers": [], "archive_path": str(archive), "found": False}
    tickers = sorted(d.name for d in archive.iterdir() if d.is_dir() and not d.name.startswith("."))
    return {"tickers": tickers, "archive_path": str(archive), "count": len(tickers), "found": True}

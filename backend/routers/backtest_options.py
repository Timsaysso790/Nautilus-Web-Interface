"""
Options backtest API router.
Runs bar-by-bar backtests using the local parquet archive.
"""
import asyncio
import logging
import uuid
from datetime import datetime, timezone
from typing import Any, Dict, List, Optional

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel, Field

from auth_jwt import get_current_user
from options_backtest_engine import OptionsBacktestEngine, OptionLeg as EngineLeg, OptionStrategy

logger = logging.getLogger(__name__)
router = APIRouter(prefix="/api/backtest/options", tags=["backtest-options"])

_backtest_lock = asyncio.Lock()
_result_cache: Dict[str, Any] = {}


class BacktestLeg(BaseModel):
    strike: float
    right: str = Field(pattern="^(C|P)$")
    action: str = Field(pattern="^(buy|sell)$")
    quantity: int = 1


class BacktestRequest(BaseModel):
    ticker: str = "SPY"
    legs: List[BacktestLeg] = Field(min_length=1, max_length=4)
    entry_dte_min: int = Field(30, ge=7, le=365)
    entry_dte_max: int = Field(60, ge=7, le=365)
    hold_until_dte: int = Field(21, ge=0, le=365)
    entry_frequency_days: int = Field(7, ge=1, le=90)
    start_year: int = Field(2018, ge=2018, le=2026)
    end_year: int = Field(2026, ge=2018, le=2026)


@router.post("/run")
async def run_backtest(req: BacktestRequest, user: dict = Depends(get_current_user)):
    """Run a full backtest."""
    async with _backtest_lock:
        try:
            legs = [EngineLeg(l.strike, l.right, l.action, l.quantity) for l in req.legs]
            strategy = OptionStrategy(legs)
            engine = OptionsBacktestEngine(
                ticker=req.ticker,
                strategy=strategy,
                entry_dte_range=(req.entry_dte_min, req.entry_dte_max),
                hold_until_dte=req.hold_until_dte,
                entry_frequency_days=req.entry_frequency_days,
                start_year=req.start_year,
                end_year=req.end_year,
            )

            # Run in thread pool to avoid blocking
            loop = asyncio.get_event_loop()
            result = await loop.run_in_executor(None, engine.run)

            result_id = str(uuid.uuid4())[:8]
            _result_cache[result_id] = result
            result["id"] = result_id
            return result

        except FileNotFoundError as e:
            raise HTTPException(404, str(e))
        except ValueError as e:
            raise HTTPException(400, str(e))
        except Exception as e:
            logger.exception("Backtest failed")
            raise HTTPException(500, f"Backtest failed: {str(e)[:200]}")


@router.get("/result/{result_id}")
async def get_backtest_result(result_id: str, user: dict = Depends(get_current_user)):
    """Retrieve a cached backtest result."""
    result = _result_cache.get(result_id)
    if not result:
        raise HTTPException(404, f"Result {result_id} not found (cache may have expired)")
    return result


@router.get("/tickers")
async def list_available_tickers(user: dict = Depends(get_current_user)):
    """List all tickers available in the options archive for backtesting."""
    from pathlib import Path
    import os
    archive = Path(os.getenv("OPTIONS_ARCHIVE_PATH", "/workspace/Archive/Nautilus_Archive5min"))
    if not archive.exists():
        return {"tickers": [], "archive_path": str(archive), "found": False}
    tickers = sorted(
        d.name for d in archive.iterdir()
        if d.is_dir() and not d.name.startswith(".")
    )
    return {"tickers": tickers, "archive_path": str(archive), "count": len(tickers), "found": True}


@router.post("/walk-forward")
async def walk_forward(req: BacktestRequest, user: dict = Depends(get_current_user)):
    """Run backtest on each year independently."""
    async with _backtest_lock:
        results = []
        for year in range(req.start_year, req.end_year + 1):
            try:
                legs = [EngineLeg(l.strike, l.right, l.action, l.quantity) for l in req.legs]
                strategy = OptionStrategy(legs)
                engine = OptionsBacktestEngine(
                    ticker=req.ticker,
                    strategy=strategy,
                    entry_dte_range=(req.entry_dte_min, req.entry_dte_max),
                    hold_until_dte=req.hold_until_dte,
                    entry_frequency_days=req.entry_frequency_days,
                    start_year=year,
                    end_year=year,
                )
                loop = asyncio.get_event_loop()
                result = await loop.run_in_executor(None, engine.run)
                results.append({
                    "year": year,
                    "metrics": result["metrics"],
                    "trade_count": len(result["trades"]),
                })
            except Exception as e:
                results.append({"year": year, "error": str(e)[:100]})

        return {
            "ticker": req.ticker,
            "strategy": f"{len(req.legs)}-leg strategy",
            "walk_forward_results": results,
            "years_tested": len(results),
        }

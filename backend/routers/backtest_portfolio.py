"""
Portfolio Engine API router — endpoints for portfolio backtesting.
"""

import json
import logging
from typing import Any, Dict, List, Optional

from fastapi import APIRouter, Depends, HTTPException, Query
from pydantic import BaseModel, Field

import database as db_mod
import portfolio_engine
from auth_jwt import get_current_user
from state import nautilus_system

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/api/backtest/portfolio", tags=["backtest-portfolio"])

_backtest_lock = False


class PortfolioAssetRequest(BaseModel):
    ticker: str
    allocation: float = Field(..., ge=0, le=100)
    dripEnabled: bool = True


class LumpSumInjectionRequest(BaseModel):
    date: str
    amount: float = Field(..., gt=0)
    label: str = ""


class CashScheduleRequest(BaseModel):
    enabled: bool = True
    paycheckAmount: float = 1200.0
    paycheckFrequency: str = "monthly"
    lumpSumInjections: List[LumpSumInjectionRequest] = []


class ValuationClearanceConfigRequest(BaseModel):
    enabled: bool = True
    rsiThreshold: float = 40.0
    bbPeriod: int = 20
    bbStdDev: float = 2.0
    frontLoadMonths: int = 3


class MarginBridgeConfigRequest(BaseModel):
    enabled: bool = True
    maxLeverage: float = 5.0
    maintenanceRate: float = 0.25
    borrowRate: float = 0.06
    debtGovernorPct: float = 20.0
    freezeDays: int = 60


class VixLegRequest(BaseModel):
    dte: int = 45
    action: str = "sell"
    right: str = "put"
    quantity: int = 1
    strikeModel: str = "atm"


class SpikeHarvestTriggerRequest(BaseModel):
    enabled: bool = False
    vixSpikeMultiplier: float = 3.0
    vixMaPeriod: int = 20
    reentryVixThreshold: float = 20.0


class VixHedgeConfigRequest(BaseModel):
    enabled: bool = False
    vixTicker: str = "^VIX"
    ladder45dte: List[VixLegRequest] = []
    ladder90dte: List[VixLegRequest] = []
    systematicRollThreshold: int = 10
    opportunisticRollVixMin: float = 18.0
    spikeHarvest: SpikeHarvestTriggerRequest = SpikeHarvestTriggerRequest()


class PortfolioBacktestRequest(BaseModel):
    assets: List[PortfolioAssetRequest] = []
    cashSchedule: CashScheduleRequest = CashScheduleRequest()
    clearanceConfig: ValuationClearanceConfigRequest = ValuationClearanceConfigRequest()
    marginConfig: MarginBridgeConfigRequest = MarginBridgeConfigRequest()
    vixConfig: VixHedgeConfigRequest = VixHedgeConfigRequest()
    startDate: str = "2024-01-01"
    endDate: str = ""
    initialCash: float = Field(50000.0, gt=0)


@router.post("/run")
async def run_portfolio_backtest(
    request: PortfolioBacktestRequest,
    _user: dict = Depends(get_current_user),
):
    global _backtest_lock
    if _backtest_lock:
        raise HTTPException(status_code=409, detail="A backtest is already running. Please wait.")
    _backtest_lock = True
    try:
        config = request.model_dump()
        result = await portfolio_engine.run_portfolio_backtest(config)
        if not result.get("success"):
            raise HTTPException(status_code=400, detail=result.get("error", "Portfolio backtest failed"))
        return result
    except HTTPException:
        raise
    except Exception as e:
        logger.exception("Portfolio backtest error")
        raise HTTPException(status_code=500, detail=str(e))
    finally:
        _backtest_lock = False


@router.get("/dividends")
async def fetch_dividends(
    ticker: str = Query(..., description="Ticker symbol"),
    _user: dict = Depends(get_current_user),
):
    """Fetch cached dividend data for a ticker."""
    import dividend_pipeline
    divs = await dividend_pipeline.get_cached_dividends(ticker.upper())
    if divs is None:
        return {"ticker": ticker.upper(), "dividends": [], "cached": False}
    records = [
        {"date": str(d.date()), "amount": float(v)}
        for d, v in divs.items()
    ]
    return {"ticker": ticker.upper(), "dividends": records, "cached": True}


@router.get("/macro-prices")
async def fetch_macro_prices(
    symbols: str = Query("QQQ,IWM", description="Comma-separated symbols"),
    _user: dict = Depends(get_current_user),
):
    """Fetch latest close prices for macro symbols."""
    import yfinance as yf
    sym_list = [s.strip().upper() for s in symbols.split(",") if s.strip()]
    result = {}
    for sym in sym_list:
        try:
            tk = yf.Ticker(sym)
            df = tk.history(period="5d", interval="1d")
            if not df.empty:
                latest = df.iloc[-1]
                result[sym] = {
                    "close": round(float(latest["Close"]), 2),
                    "date": str(latest.name)[:10] if hasattr(latest.name, "strftime") else str(latest.name)[:10],
                }
            else:
                result[sym] = {"close": None, "date": None}
        except Exception:
            result[sym] = {"close": None, "date": None}
    return {"symbols": result}

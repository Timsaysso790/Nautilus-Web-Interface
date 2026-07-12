"""
Portfolio Engine API router — endpoints for portfolio backtesting.
"""

import asyncio
import logging
import uuid
from typing import List, Optional

from fastapi import APIRouter, Depends, HTTPException, Query
from pydantic import BaseModel, Field

import portfolio_engine
import backtest_project_service as bps
from backtest_project_service import _sanitize_id
from auth_jwt import get_current_user

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/api/backtest/portfolio", tags=["backtest-portfolio"])

_backtest_lock = asyncio.Lock()


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
    projectId: str = ""


@router.post("/run")
async def run_portfolio_backtest(
    request: PortfolioBacktestRequest,
    _user: dict = Depends(get_current_user),
):
    async with _backtest_lock:
        try:
            config = request.model_dump()

            project_id = config.get("projectId", "") or ""
            if project_id:
                try:
                    _sanitize_id(project_id, "projectId")
                except ValueError as e:
                    raise HTTPException(status_code=400, detail=str(e))

            result = await portfolio_engine.run_portfolio_backtest(config)
            if not result.get("success"):
                raise HTTPException(status_code=400, detail=result.get("error", "Portfolio backtest failed"))

            if project_id:
                try:
                    bps.save_project_config(project_id, "config-portfolio", config)
                    bps.save_project_result(project_id, f"result-{uuid.uuid4().hex[:8]}", result)
                except Exception as e:
                    logger.warning(f"Failed to save portfolio result for project {project_id}: {e}")

            return result
        except HTTPException:
            raise
        except Exception as e:
            logger.exception("Portfolio backtest error")
            raise HTTPException(status_code=500, detail=str(e))


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

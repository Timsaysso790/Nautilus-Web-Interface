from typing import Any, Dict, List, Optional

from fastapi import APIRouter, HTTPException, Query
from pydantic import BaseModel

import option_service as svc

router = APIRouter(prefix="/api/options", tags=["options"])


class PayoffLeg(BaseModel):
    strike: float
    right: str
    quantity: int = 1
    entry_price: float = 0.0


class PayoffRequest(BaseModel):
    legs: List[PayoffLeg]
    price_min: Optional[float] = None
    price_max: Optional[float] = None
    steps: int = 100


class BSMCaluclateRequest(BaseModel):
    underlying_price: float
    strike: float
    time_to_expiry: float
    risk_free_rate: float = 0.05
    volatility: float = 0.20
    right: str = "call"


# ── Expirations ─────────────────────────────────────────────────────────────

@router.get("/{symbol}/expirations")
async def get_expirations(symbol: str):
    exps = await svc.get_expirations(symbol)
    return {"symbol": symbol.upper(), "expirations": exps, "count": len(exps)}


# ── Chain ───────────────────────────────────────────────────────────────────

@router.get("/{symbol}/chain")
async def get_chain(
    symbol: str,
    expiration: str = Query(..., description="YYYY-MM-DD"),
):
    chain = await svc.get_chain(symbol, expiration)
    return chain


# ── Greeks ──────────────────────────────────────────────────────────────────

@router.get("/{symbol}/greeks")
async def get_greeks(
    symbol: str,
    expiration: str = Query(...),
    strike: float = Query(...),
    right: str = Query(...),
):
    data = await svc.get_greeks(symbol, expiration, strike, right)
    return data


# ── BSM Calculator ──────────────────────────────────────────────────────────

@router.post("/calculate")
async def calculate_bsm(req: BSMCaluclateRequest):
    result = await svc.calculate_bsm(
        underlying_price=req.underlying_price,
        strike=req.strike,
        time_to_expiry=req.time_to_expiry,
        risk_free_rate=req.risk_free_rate,
        volatility=req.volatility,
        right=req.right,
    )
    return result


# ── Payoff ──────────────────────────────────────────────────────────────────

@router.post("/payoff")
async def calculate_payoff(req: PayoffRequest):
    legs = [leg.model_dump() for leg in req.legs]
    result = await svc.calculate_payoff(
        legs=legs,
        price_min=req.price_min,
        price_max=req.price_max,
        steps=req.steps,
    )
    return result

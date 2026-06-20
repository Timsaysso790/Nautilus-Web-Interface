from typing import Optional

from fastapi import APIRouter, HTTPException, Query
from pydantic import BaseModel

import database
import stock_service as svc

router = APIRouter(prefix="/api/stocks", tags=["stocks"])


class WatchlistAddRequest(BaseModel):
    symbol: str
    notes: str = ""


# ── Search / Lookup ──────────────────────────────────────────────────────────

@router.get("/search")
async def search_stocks(q: str = Query("", min_length=1)):
    results = await svc.search_symbols(q)
    return {"results": results, "count": len(results)}


# ── Quotes ───────────────────────────────────────────────────────────────────

@router.get("/{symbol}/quote")
async def get_quote(symbol: str):
    quote = await svc.get_quote(symbol)
    return quote


# ── History ──────────────────────────────────────────────────────────────────

@router.get("/{symbol}/history")
async def get_history(
    symbol: str,
    interval: str = Query("1d", regex="^(1m|5m|15m|30m|1h|1d|1wk|1mo)$"),
    start: Optional[str] = None,
    end: Optional[str] = None,
):
    bars = await svc.get_history(symbol, interval=interval, start=start, end=end)
    return {"symbol": symbol.upper(), "interval": interval, "bars": bars, "count": len(bars)}


# ── Info ─────────────────────────────────────────────────────────────────────

@router.get("/{symbol}/info")
async def get_info(symbol: str):
    info = await svc.get_info(symbol)
    return info


# ── Watchlist ────────────────────────────────────────────────────────────────

@router.get("/watchlist")
async def list_watchlist():
    items = await database.get_watchlist()
    return {"watchlist": items, "count": len(items)}


@router.post("/watchlist")
async def add_watchlist(req: WatchlistAddRequest):
    ok = await database.add_to_watchlist(req.symbol, notes=req.notes)
    if not ok:
        raise HTTPException(status_code=409, detail="Symbol already in watchlist")
    return {"success": True, "symbol": req.symbol.upper()}


@router.delete("/watchlist/{symbol}")
async def remove_watchlist(symbol: str):
    ok = await database.remove_from_watchlist(symbol)
    if not ok:
        raise HTTPException(status_code=404, detail="Symbol not in watchlist")
    return {"success": True}

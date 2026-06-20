"""
Broker Orders router.

Exposes endpoints to manage live orders on connected broker adapters
(Tastytrade, Robinhood).  Lists open/closed orders, submits new orders,
and cancels pending orders.
"""

import logging
from typing import Any, Dict, List, Optional

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel

import database
from auth_jwt import get_current_user
from credential_utils import decrypt_credential
from state import live_manager

logger = logging.getLogger(__name__)
router = APIRouter(prefix="/api", tags=["broker_orders"])


# ── Pydantic models ───────────────────────────────────────────────────────────

class BrokerOrderRequest(BaseModel):
    adapter_id: str
    instrument: str
    side: str = "BUY"           # BUY | SELL
    quantity: int = 1
    order_type: str = "MARKET"  # MARKET | LIMIT
    price: Optional[float] = None


class CancelOrderRequest(BaseModel):
    adapter_id: str
    order_id: str
    instrument: Optional[str] = None


# ── Helpers ───────────────────────────────────────────────────────────────────

def _order_to_dict(order: Any) -> Dict[str, Any]:
    """Normalize a broker SDK order object (or dict) to a standard dict."""
    if isinstance(order, dict):
        return {
            "id": str(order.get("id", order.get("order_id", order.get("orderId", "")))),
            "instrument": str(order.get("symbol", order.get("instrument", ""))),
            "side": str(order.get("side", "UNKNOWN")),
            "quantity": float(order.get("quantity", order.get("qty", 0))),
            "price": float(order.get("price", 0) or 0),
            "status": str(order.get("status", order.get("state", "UNKNOWN"))).lower(),
            "type": str(order.get("order_type", order.get("type", "UNKNOWN"))),
            "created_at": str(order.get("created_at", order.get("time", ""))),
        }
    return {
        "id": str(getattr(order, "id", getattr(order, "order_id", getattr(order, "orderId", "")))),
        "instrument": str(getattr(order, "symbol", getattr(order, "instrument", ""))),
        "side": str(getattr(order, "side", "UNKNOWN")),
        "quantity": float(getattr(order, "quantity", getattr(order, "qty", 0))),
        "price": float(getattr(order, "price", 0) or 0),
        "status": str(getattr(order, "status", getattr(order, "state", "UNKNOWN"))).lower(),
        "type": str(getattr(order, "order_type", getattr(order, "type", "UNKNOWN"))),
        "created_at": str(getattr(order, "created_at", getattr(order, "time", ""))),
    }


# ── Endpoints ─────────────────────────────────────────────────────────────────

@router.get("/broker-orders")
async def list_broker_orders(adapter_id: Optional[str] = None):
    """
    List orders from connected broker adapters.
    If adapter_id is provided, returns orders only for that broker.
    """
    conns = live_manager.get_connections()
    results: List[Dict[str, Any]] = []

    for aid, conn in conns.items():
        if adapter_id and aid != adapter_id:
            continue
        if conn.status not in ("connected", "connected_offline"):
            continue

        try:
            if aid == "tastytrade" and conn.tastytrade_session:
                session = conn.tastytrade_session
                accounts = session.get_accounts()
                if accounts:
                    orders = accounts[0].get_orders()
                    for o in (orders or []):
                        d = _order_to_dict(o)
                        d["adapter_id"] = aid
                        results.append(d)
            elif aid == "robinhood" and conn.robinhood_session:
                import robin_stocks.robinhood as r
                orders = r.orders.get_all_orders()
                for o in (orders or []):
                    d = _order_to_dict(o)
                    d["adapter_id"] = aid
                    results.append(d)
        except Exception as exc:
            logger.warning("Failed to list orders for %s: %s", aid, exc)

    return {"orders": results, "count": len(results)}


@router.post("/broker-orders/submit")
async def submit_broker_order(req: BrokerOrderRequest, _user: dict = Depends(get_current_user)):
    """Submit an order through the specified broker adapter."""
    conns = live_manager.get_connections()
    conn = conns.get(req.adapter_id)

    if not conn or conn.status not in ("connected", "connected_offline"):
        raise HTTPException(status_code=400, detail=f"Adapter '{req.adapter_id}' is not connected")

    result = await live_manager.submit_order(req.model_dump())

    if not result.get("success"):
        raise HTTPException(status_code=502, detail=result.get("error", "Order submission failed"))

    return {
        "success": True,
        "order_id": result.get("order_id"),
        "exchange_order_id": result.get("exchange_order_id"),
        "status": result.get("status", "pending"),
        "adapter_id": req.adapter_id,
    }


@router.post("/broker-orders/{adapter_id}/sync")
async def sync_broker_orders(adapter_id: str, _user: dict = Depends(get_current_user)):
    """Sync positions from the specified broker adapter and persist to DB."""
    live_positions = await live_manager.sync_positions()
    broker_positions = [p for p in live_positions if p.get("exchange", "").upper() == adapter_id.upper()]

    if broker_positions:
        await database.save_positions(broker_positions)

    return {
        "success": True,
        "synced_count": len(broker_positions),
        "positions": broker_positions,
    }

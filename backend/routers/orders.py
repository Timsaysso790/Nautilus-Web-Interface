from datetime import datetime, timezone
from typing import Any, Dict, List, Optional

from fastapi import APIRouter, Body, Depends, HTTPException
from pydantic import BaseModel, Field

import database
from auth_jwt import get_current_user
from state import live_manager, nautilus_system
from utils import normalize_order

router = APIRouter(prefix="/api", tags=["orders"])


class OrderCreateRequest(BaseModel):
    instrument: str = Field("EUR/USD.SIM", min_length=1, max_length=50)
    side: str = Field("BUY", pattern="^(BUY|SELL)$")
    type: str = Field("MARKET", pattern="^(MARKET|LIMIT|STOP)$")
    quantity: float = Field(..., gt=0)
    price: Optional[float] = Field(None, ge=0)
    leverage: float = Field(1.0, ge=1.0, le=1000.0)


@router.get("/orders")
async def list_orders():
    """List orders: backtest orders + persistent user-created orders."""
    all_orders: List[Dict[str, Any]] = []

    for results in nautilus_system.backtest_results.values():
        for o in results.get("orders", []):
            row = normalize_order(o)
            row["timestamp"] = datetime.now(timezone.utc).isoformat()
            all_orders.append(row)

    db_orders = await database.list_orders()
    all_orders.extend(db_orders)
    return {"orders": all_orders, "count": len(all_orders)}


@router.post("/orders")
async def create_order(req: OrderCreateRequest, _user: dict = Depends(get_current_user)):
    order_dict = req.model_dump()

    # Route to live exchange when adapter is connected
    exchange_order_id = None
    if live_manager.is_connected():
        try:
            exchange_result = await live_manager.submit_order(order_dict)
            if isinstance(exchange_result, dict):
                exchange_order_id = (
                    exchange_result.get("exchange_order_id")
                    or exchange_result.get("order_id")
                )
        except Exception as e:
            raise HTTPException(status_code=502, detail=str(e))

    # Persist order in DB
    order = await database.create_order(
        instrument=req.instrument,
        side=req.side,
        order_type=req.type,
        quantity=req.quantity,
        price=req.price,
    )
    if exchange_order_id:
        order["exchange_order_id"] = exchange_order_id

    return {"success": True, "order": order}


@router.delete("/orders/{order_id}")
async def cancel_order(order_id: str, _user: dict = Depends(get_current_user)):
    # Try live cancel first
    if live_manager.is_connected():
        try:
            await live_manager.cancel_order(order_id)
        except Exception:
            pass  # DB fallback

    cancelled = await database.cancel_order(order_id)
    if not cancelled:
        raise HTTPException(status_code=404, detail=f"Order {order_id} not found")
    return {"success": True, "message": f"Order {order_id} cancelled"}

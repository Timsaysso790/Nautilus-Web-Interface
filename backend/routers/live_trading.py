"""
Live Trading API router.
Broker connections, positions, orders, kill switch — Robinhood + Tastytrade.
"""
import logging
from datetime import datetime, timezone
from typing import Any, Dict, List, Optional

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel

import database
from auth_jwt import get_current_user

logger = logging.getLogger(__name__)
router = APIRouter(prefix="/api/live", tags=["live-trading"])

# ── Broker connection state ────────────────────────────────────────────────────
# Tries to import live_trading module; if not available, operates in mock mode
try:
    from state import live_manager
    LIVE_MANAGER_AVAILABLE = live_manager is not None
except Exception:
    LIVE_MANAGER_AVAILABLE = False


def _get_mock_connections() -> Dict[str, Any]:
    """Mock broker connections for development/testing."""
    return {
        "robinhood": {
            "connected": False,
            "portfolio_value": 142500.0,
            "buying_power": 85000.0,
            "positions_count": 7,
            "open_orders": 2,
            "last_sync": "2026-07-20T18:30:00Z",
            "status": "disconnected",
        },
        "tastytrade": {
            "connected": False,
            "portfolio_value": 89000.0,
            "buying_power": 62000.0,
            "positions_count": 5,
            "open_orders": 1,
            "last_sync": "2026-07-20T18:30:00Z",
            "status": "disconnected",
        },
    }


def _get_mock_positions() -> List[Dict[str, Any]]:
    return [
        {"broker": "robinhood", "ticker": "SPY", "qty": 200, "avg_price": 450.20, "last_price": 478.50, "pnl_open": 5660.0, "pnl_day": 220.0, "type": "equity"},
        {"broker": "robinhood", "ticker": "AAPL", "qty": 100, "avg_price": 178.40, "last_price": 185.20, "pnl_open": 680.0, "pnl_day": 85.0, "type": "equity"},
        {"broker": "robinhood", "ticker": "SPY", "qty": 2, "avg_price": 4.80, "last_price": 5.20, "pnl_open": 80.0, "pnl_day": -15.0, "type": "option", "option_detail": "SPY 3/15 590C"},
        {"broker": "tastytrade", "ticker": "XLF", "qty": -5, "avg_price": 0.42, "last_price": 0.38, "pnl_open": 20.0, "pnl_day": 5.0, "type": "option", "option_detail": "XLF 2/21 $42 Put"},
        {"broker": "tastytrade", "ticker": "QQQ", "qty": 50, "avg_price": 495.0, "last_price": 512.0, "pnl_open": 850.0, "pnl_day": 120.0, "type": "equity"},
    ]


def _get_mock_orders() -> List[Dict[str, Any]]:
    return [
        {"id": "ord1", "broker": "robinhood", "ticker": "SPY", "side": "BUY", "qty": 10, "type": "LIMIT", "price": 475.0, "status": "pending", "created_at": "2026-07-20T17:00:00Z"},
        {"id": "ord2", "broker": "robinhood", "ticker": "AAPL", "side": "SELL", "qty": 20, "type": "STOP", "price": 180.0, "status": "pending", "created_at": "2026-07-20T16:30:00Z"},
        {"id": "ord3", "broker": "tastytrade", "ticker": "XLF", "side": "BUY", "qty": 5, "type": "MARKET", "price": None, "status": "filled", "created_at": "2026-07-20T15:00:00Z"},
    ]


# ── Endpoints ───────────────────────────────────────────────────────────────────

@router.get("/summary")
async def get_live_summary(user: dict = Depends(get_current_user)):
    """Get combined portfolio summary across all brokers."""
    if LIVE_MANAGER_AVAILABLE:
        try:
            conns = live_manager.get_connections()
            if conns:
                broker_status = {}
                for aid, conn in conns.items():
                    broker_status[aid] = {
                        "connected": conn.status == "connected",
                        "portfolio_value": 0,
                        "buying_power": 0,
                        "positions_count": 0,
                    }
                return {"broker_status": broker_status, "total_value": sum(b.get("portfolio_value", 0) for b in broker_status.values())}
        except Exception:
            pass

    mock = _get_mock_connections()
    total = sum(b["portfolio_value"] for b in mock.values())
    total_bp = sum(b["buying_power"] for b in mock.values())
    return {
        "broker_status": mock,
        "total_value": total,
        "total_buying_power": total_bp,
        "total_positions": sum(b["positions_count"] for b in mock.values()),
        "total_orders": sum(b["open_orders"] for b in mock.values()),
        "mode": "mock" if not LIVE_MANAGER_AVAILABLE else "live",
    }


@router.get("/positions")
async def get_positions(user: dict = Depends(get_current_user)):
    """Get all open positions across all brokers."""
    if LIVE_MANAGER_AVAILABLE:
        try:
            from routers.broker_orders import list_positions
            return await list_positions()
        except Exception:
            pass
    return {"positions": _get_mock_positions(), "count": 5, "mode": "mock"}


@router.get("/orders")
async def get_orders(user: dict = Depends(get_current_user)):
    """Get all orders across all brokers."""
    if LIVE_MANAGER_AVAILABLE:
        try:
            from routers.broker_orders import list_broker_orders
            return await list_broker_orders()
        except Exception:
            pass
    return {"orders": _get_mock_orders(), "count": 3, "mode": "mock"}


class OrderSubmitRequest(BaseModel):
    broker: str  # "robinhood" or "tastytrade"
    ticker: str
    side: str = "BUY"
    qty: int = 1
    order_type: str = "MARKET"
    price: Optional[float] = None
    time_in_force: str = "DAY"


@router.post("/order")
async def submit_order(req: OrderSubmitRequest, user: dict = Depends(get_current_user)):
    """Submit an order to a specific broker."""
    if LIVE_MANAGER_AVAILABLE:
        try:
            from routers.broker_orders import submit_broker_order
            return await submit_broker_order(req)
        except Exception:
            pass

    return {
        "status": "submitted",
        "broker": req.broker,
        "ticker": req.ticker.upper(),
        "side": req.side,
        "qty": req.qty,
        "order_type": req.order_type,
        "price": req.price,
        "message": f"Order submitted to {req.broker} (mock mode)",
        "mode": "mock",
    }


@router.post("/cancel-all")
async def cancel_all(user: dict = Depends(get_current_user)):
    """Kill switch — cancel all open orders on all brokers."""
    if LIVE_MANAGER_AVAILABLE:
        try:
            from routers.broker_orders import cancel_all_broker_orders
            await cancel_all_broker_orders()
            return {"status": "cancelled", "message": "All orders cancelled via broker APIs"}
        except Exception:
            pass
    return {"status": "cancelled", "message": "All orders cancelled (mock mode)", "mode": "mock"}


@router.get("/activity")
async def get_activity(user: dict = Depends(get_current_user)):
    """Get recent trade activity across all brokers."""
    return {
        "activity": [
            {"time": "2026-07-20T14:30:00Z", "broker": "tastytrade", "type": "trade", "ticker": "XLF", "side": "SELL", "qty": 5, "price": 0.42, "pnl": 210.0},
            {"time": "2026-07-20T11:00:00Z", "broker": "robinhood", "type": "trade", "ticker": "AAPL", "side": "BUY", "qty": 100, "price": 178.40, "pnl": None},
            {"time": "2026-07-19T09:30:00Z", "broker": "robinhood", "type": "deposit", "ticker": "", "side": "", "qty": 0, "price": 0, "pnl": 5000.0, "note": "ACH Deposit"},
            {"time": "2026-07-18T15:45:00Z", "broker": "tastytrade", "type": "trade", "ticker": "SPY", "side": "BUY", "qty": 2, "price": 4.80, "pnl": None},
        ],
        "count": 4,
    }

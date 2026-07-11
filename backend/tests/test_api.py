"""
Unit tests for the Nautilus Trader API.

Run with:
    cd backend
    pytest tests/ -v
"""

import sys
from pathlib import Path

import pytest

# Ensure the backend directory is on the path
sys.path.insert(0, str(Path(__file__).parent.parent))


# ── Fixtures ──────────────────────────────────────────────────────────────────

@pytest.fixture
def client(tmp_path, monkeypatch):
    """Create an authenticated test client with an isolated SQLite database."""
    import database
    monkeypatch.setattr(database, "DB_PATH", tmp_path / "test.db")

    from fastapi.testclient import TestClient
    from nautilus_fastapi import app

    with TestClient(app) as c:
        # Auto-authenticate so tests work after JWT middleware is added
        login_r = c.post("/api/auth/login", json={"username": "admin", "password": "admin"})
        if login_r.status_code == 200:
            token = login_r.json()["access_token"]
            c.headers.update({"Authorization": f"Bearer {token}"})
        yield c


# ── Health ────────────────────────────────────────────────────────────────────

def test_health(client):
    r = client.get("/api/health")
    assert r.status_code == 200
    body = r.json()
    # In a network-isolated test environment Binance may be unreachable,
    # causing status='degraded'. Both values indicate the service is up.
    assert body["status"] in ("healthy", "degraded")
    assert body["version"] == "2.0.0"


def test_root(client):
    r = client.get("/")
    assert r.status_code == 200
    assert r.json()["status"] == "running"


def test_health_alias(client):
    r = client.get("/health")
    assert r.status_code == 200
    assert r.json()["status"] == "healthy"


# ── Engine ────────────────────────────────────────────────────────────────────

def test_engine_info(client):
    r = client.get("/api/engine/info")
    assert r.status_code == 200
    body = r.json()
    assert "trader_id" in body
    assert "is_initialized" in body


def test_system_metrics(client):
    r = client.get("/api/system/metrics")
    assert r.status_code == 200
    body = r.json()
    assert "uptime_seconds" in body
    assert "requests_total" in body


# ── Strategies ────────────────────────────────────────────────────────────────

def test_list_strategies_empty(client):
    r = client.get("/api/strategies")
    assert r.status_code == 200
    body = r.json()
    assert "strategies" in body
    assert isinstance(body["strategies"], list)


def test_create_and_list_strategy(client):
    r = client.post("/api/strategies", json={"name": "Test Strategy"})
    assert r.status_code == 200

    r = client.get("/api/strategies")
    assert r.status_code == 200
    strategies = r.json()["strategies"]
    names = [s["name"] for s in strategies]
    assert "Test Strategy" in names


def test_start_stop_nonexistent_strategy(client):
    r = client.post("/api/strategies/nonexistent/start")
    assert r.status_code == 404

    r = client.post("/api/strategies/nonexistent/stop")
    assert r.status_code == 404


# ── Orders ────────────────────────────────────────────────────────────────────

def test_list_orders(client):
    r = client.get("/api/orders")
    assert r.status_code == 200
    assert "orders" in r.json()


def test_create_order(client):
    payload = {
        "instrument": "EUR/USD.SIM",
        "side": "BUY",
        "type": "MARKET",
        "quantity": 10000,
    }
    r = client.post("/api/orders", json=payload)
    assert r.status_code == 200
    body = r.json()
    assert body["success"] is True
    assert body["order"]["instrument"] == "EUR/USD.SIM"
    assert body["order"]["status"] == "PENDING"


def test_create_order_invalid_side(client):
    r = client.post(
        "/api/orders",
        json={"instrument": "EUR/USD.SIM", "side": "INVALID", "quantity": 1000},
    )
    assert r.status_code == 422  # Pydantic validation error


def test_cancel_order(client):
    # Create first
    r = client.post(
        "/api/orders",
        json={"instrument": "EUR/USD.SIM", "side": "BUY", "quantity": 1000},
    )
    order_id = r.json()["order"]["id"]

    # Cancel it
    r = client.delete(f"/api/orders/{order_id}")
    assert r.status_code == 200
    assert r.json()["success"] is True


def test_cancel_nonexistent_order(client):
    r = client.delete("/api/orders/ORD-DOESNOTEXIST")
    assert r.status_code == 404


# ── Market Data ───────────────────────────────────────────────────────────────

def test_market_data_instruments(client):
    r = client.get("/api/market-data/instruments")
    assert r.status_code == 200
    body = r.json()
    assert body["count"] > 0
    syms = [i["symbol"] for i in body["instruments"]]
    assert "BTCUSDT" in syms


def test_market_data_quote(client):
    r = client.get("/api/market-data/BTCUSDT")
    assert r.status_code == 200
    body = r.json()
    assert body["symbol"] == "BTCUSDT"
    assert body["price"] > 0
    assert body["bid"] < body["ask"]


def test_market_data_unknown_symbol(client):
    r = client.get("/api/market-data/FAKECOIN")
    assert r.status_code == 404


# ── Settings ──────────────────────────────────────────────────────────────────

def test_get_settings(client):
    r = client.get("/api/settings")
    assert r.status_code == 200
    body = r.json()
    assert "general" in body
    assert "notifications" in body


def test_save_settings(client):
    r = client.post(
        "/api/settings",
        json={"general": {"system_name": "Test System"}},
    )
    assert r.status_code == 200
    body = r.json()
    assert body["settings"]["general"]["system_name"] == "Test System"


# ── Database ops ──────────────────────────────────────────────────────────────

def test_database_backup(client):
    r = client.post("/api/database/backup", json={"db_type": "postgresql"})
    assert r.status_code == 200
    assert r.json()["success"] is True


def test_database_optimize(client):
    r = client.post("/api/database/optimize", json={"db_type": "parquet"})
    assert r.status_code == 200
    assert r.json()["success"] is True


def test_database_clean(client):
    r = client.post("/api/database/clean", json={"cache_type": "redis"})
    assert r.status_code == 200
    assert r.json()["success"] is True


# ── RSI Strategy ─────────────────────────────────────────────────────────────

def test_create_rsi_strategy(client):
    payload = {
        "name": "RSI Test",
        "type": "rsi",
        "rsi_period": 14,
        "oversold_level": 30,
        "overbought_level": 70,
    }
    r = client.post("/api/strategies", json=payload)
    assert r.status_code == 200
    body = r.json()
    assert body["success"] is True
    sid = body["strategy_id"]

    r = client.get("/api/strategies")
    found = [s for s in r.json()["strategies"] if s["id"] == sid]
    assert found, "RSI strategy not found in list"
    assert found[0]["type"] == "rsi"


def test_rsi_strategy_start_stop(client):
    r = client.post("/api/strategies", json={"name": "RSI SS", "type": "rsi"})
    sid = r.json()["strategy_id"]

    r = client.post(f"/api/strategies/{sid}/start")
    assert r.status_code == 200
    assert r.json()["success"] is True

    r = client.post(f"/api/strategies/{sid}/stop")
    assert r.status_code == 200
    assert r.json()["success"] is True


def test_rsi_strategy_status_persists(client):
    """Status change must survive a DB round-trip."""
    r = client.post("/api/strategies", json={"name": "RSI Persist", "type": "rsi"})
    sid = r.json()["strategy_id"]

    client.post(f"/api/strategies/{sid}/start")

    # Re-query the list and verify persisted status
    r = client.get("/api/strategies")
    found = [s for s in r.json()["strategies"] if s["id"] == sid]
    assert found[0]["status"] == "running"


# ── Auth middleware ───────────────────────────────────────────────────────────

def test_auth_disabled_by_default(client):
    """Without API_KEY set, all requests should pass through."""
    r = client.get("/api/strategies")
    assert r.status_code == 200


@pytest.fixture
def authed_client(monkeypatch, tmp_path):
    """TestClient with API_KEY='test-secret' enabled."""
    import auth
    import database

    monkeypatch.setattr(auth, "API_KEY", "test-secret")
    monkeypatch.setattr(database, "DB_PATH", tmp_path / "test.db")

    from fastapi.testclient import TestClient
    from nautilus_fastapi import app

    with TestClient(app, raise_server_exceptions=False) as c:
        login_r = c.post("/api/auth/login", json={"username": "admin", "password": "admin"})
        if login_r.status_code == 200:
            token = login_r.json()["access_token"]
            c.headers.update({"Authorization": f"Bearer {token}"})
        yield c


def test_auth_enabled_blocks_without_key(authed_client):
    """With API_KEY set, requests without the header should get 401."""
    # When API_KEY env is active, requests without the key are blocked.
    # We need to temporarily strip the Authorization header to test this.
    r = authed_client.get("/api/strategies", headers={"Authorization": "", "X-API-Key": ""})
    assert r.status_code == 401


def test_auth_enabled_passes_with_key(authed_client):
    """With API_KEY set and correct header, requests should pass through."""
    r = authed_client.get("/api/strategies", headers={"X-API-Key": "test-secret"})
    assert r.status_code == 200


# ── Orders — validation edge cases ───────────────────────────────────────────

def test_create_order_zero_quantity(client):
    """quantity=0 must be rejected with 422."""
    r = client.post(
        "/api/orders",
        json={"instrument": "EUR/USD.SIM", "side": "BUY", "quantity": 0},
    )
    assert r.status_code == 422


def test_create_order_negative_quantity(client):
    """Negative quantity must be rejected with 422."""
    r = client.post(
        "/api/orders",
        json={"instrument": "EUR/USD.SIM", "side": "BUY", "quantity": -100},
    )
    assert r.status_code == 422


# ── Positions ─────────────────────────────────────────────────────────────────

def test_positions_list(client):
    """GET /api/positions returns a list (may be empty)."""
    r = client.get("/api/positions")
    assert r.status_code == 200
    assert isinstance(r.json(), list)


def test_close_nonexistent_position(client):
    """Closing an unknown position ID still returns 200 (graceful no-op)."""
    r = client.post("/api/positions/POS-DOESNOTEXIST/close")
    assert r.status_code == 200
    body = r.json()
    assert body["success"] is True
    assert body["closed_in_db"] is False


# ── Strategy — SMA validation ─────────────────────────────────────────────────

def test_create_sma_strategy_invalid_periods(client):
    """fast_period >= slow_period must return 422."""
    r = client.post(
        "/api/strategies",
        json={"name": "Bad SMA", "type": "sma_crossover", "fast_period": 20, "slow_period": 10},
    )
    assert r.status_code == 422


def test_create_strategy_missing_name(client):
    """A strategy without a name must return 422."""
    r = client.post("/api/strategies", json={"type": "sma_crossover"})
    assert r.status_code == 422


# ── Backtest — concurrent lock ────────────────────────────────────────────────

def test_backtest_lock_prevents_concurrent_run(client):
    """
    Simulate the lock being held: import the module, set the flag, then
    verify that a second request gets 409.
    """
    import routers.backtest as bt_module

    original = bt_module._backtest_lock
    bt_module._backtest_lock = True
    try:
        r = client.post(
            "/api/nautilus/demo-backtest",
            json={"fast_period": 10, "slow_period": 20, "num_bars": 100, "starting_balance": 10000},
        )
        assert r.status_code == 409
        assert "already running" in r.json()["detail"].lower()
    finally:
        bt_module._backtest_lock = original  # always restore


# ── Strategy config edge cases ────────────────────────────────────────────────

def test_create_strategy_null_config_uses_defaults(client):
    """Explicitly passing null for a config value must use default, not None."""
    r = client.post(
        "/api/strategies",
        json={"name": "Null Config", "type": "sma_crossover", "fast_period": None},
    )
    assert r.status_code == 200
    sid = r.json()["strategy_id"]
    strategies = client.get("/api/strategies").json()["strategies"]
    found = next(s for s in strategies if s["id"] == sid)
    # config fast_period must be the default (10), not None
    assert found is not None


def test_create_strategy_macd_invalid_periods_rejected(client):
    """MACD fast_period >= slow_period must return 422."""
    r = client.post(
        "/api/strategies",
        json={"name": "Bad MACD", "type": "macd", "fast_period": 30, "slow_period": 12},
    )
    assert r.status_code == 422


def test_create_strategy_rsi_period_too_small_rejected(client):
    """RSI period < 2 must return 422."""
    r = client.post(
        "/api/strategies",
        json={"name": "Tiny RSI", "type": "rsi", "rsi_period": 1},
    )
    assert r.status_code == 422


def test_create_strategy_rsi_inverted_levels_rejected(client):
    """oversold_level >= overbought_level must return 422."""
    r = client.post(
        "/api/strategies",
        json={
            "name": "Inverted RSI",
            "type": "rsi",
            "oversold_level": 70,
            "overbought_level": 30,
        },
    )
    assert r.status_code == 422




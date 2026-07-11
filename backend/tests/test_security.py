"""
Security tests — Sprint 1: JWT Auth & Rate Limiting.

These tests cover JWT auth, rate limiting, and input sanitisation.

Run:
    cd backend
    pytest tests/test_security.py -v
"""

import sys
from pathlib import Path

import pytest

sys.path.insert(0, str(Path(__file__).parent.parent))


# ─── Shared fixtures ──────────────────────────────────────────────────────────

@pytest.fixture
def client(tmp_path, monkeypatch):
    import database
    monkeypatch.setattr(database, "DB_PATH", tmp_path / "test.db")
    from fastapi.testclient import TestClient
    from nautilus_fastapi import app
    with TestClient(app) as c:
        yield c


# ═════════════════════════════════════════════════════════════════════════════
# SECTION 1 — JWT Authentication
# ═════════════════════════════════════════════════════════════════════════════

class TestJWTAuth:
    """
    All API routes (except health/login) must require a valid JWT Bearer token.
    """

    def test_login_returns_access_token(self, client):
        """POST /api/auth/login must return a JWT access_token."""
        r = client.post(
            "/api/auth/login",
            json={"username": "admin", "password": "admin"},
        )
        assert r.status_code == 200
        body = r.json()
        assert "access_token" in body
        assert body["token_type"] == "bearer"
        assert len(body["access_token"]) > 20  # JWT is at least 20 chars

    def test_login_wrong_password_returns_401(self, client):
        """Wrong password must return 401."""
        r = client.post(
            "/api/auth/login",
            json={"username": "admin", "password": "wrong_password"},
        )
        assert r.status_code == 401

    def test_protected_route_without_token_returns_401(self, client):
        """Without Authorization header, protected routes return 401."""
        r = client.get("/api/strategies")
        assert r.status_code == 401

    def test_protected_route_with_valid_token(self, client):
        """With valid Bearer token, protected routes are accessible."""
        login_r = client.post(
            "/api/auth/login",
            json={"username": "admin", "password": "admin"},
        )
        token = login_r.json()["access_token"]

        r = client.get(
            "/api/strategies",
            headers={"Authorization": f"Bearer {token}"},
        )
        assert r.status_code == 200

    def test_invalid_token_returns_401(self, client):
        """Garbage token must return 401."""
        r = client.get(
            "/api/strategies",
            headers={"Authorization": "Bearer this.is.garbage"},
        )
        assert r.status_code == 401

    def test_health_endpoint_does_not_require_auth(self, client):
        """GET /api/health must always be public (no auth required)."""
        r = client.get("/api/health")
        assert r.status_code in (200, 503)  # either ok or degraded, not 401

    def test_token_contains_username(self, client):
        """Decoded JWT payload must contain 'sub' (username)."""
        import base64
        import json

        r = client.post(
            "/api/auth/login",
            json={"username": "admin", "password": "admin"},
        )
        token = r.json()["access_token"]

        # Decode payload (middle part) without verification
        payload_b64 = token.split(".")[1]
        # Add padding
        payload_b64 += "=" * (4 - len(payload_b64) % 4)
        payload = json.loads(base64.b64decode(payload_b64))

        assert "sub" in payload
        assert payload["sub"] == "admin"

    def test_token_has_expiry(self, client):
        """Decoded JWT payload must contain 'exp' (expiry timestamp)."""
        import base64
        import json

        r = client.post(
            "/api/auth/login",
            json={"username": "admin", "password": "admin"},
        )
        token = r.json()["access_token"]
        payload_b64 = token.split(".")[1]
        payload_b64 += "=" * (4 - len(payload_b64) % 4)
        payload = json.loads(base64.b64decode(payload_b64))

        assert "exp" in payload

    def test_refresh_token_extends_expiry(self, client):
        """POST /api/auth/refresh must return a new token with new expiry."""
        login_r = client.post(
            "/api/auth/login",
            json={"username": "admin", "password": "admin"},
        )
        token = login_r.json()["access_token"]

        refresh_r = client.post(
            "/api/auth/refresh",
            headers={"Authorization": f"Bearer {token}"},
        )
        assert refresh_r.status_code == 200
        new_token = refresh_r.json()["access_token"]
        assert new_token != token  # new token generated


# ═════════════════════════════════════════════════════════════════════════════
# SECTION 3 — Rate Limiting
# ═════════════════════════════════════════════════════════════════════════════

class TestRateLimiting:
    """
    API must enforce rate limits to prevent brute-force and abuse.
    """

    def test_login_rate_limit_after_5_attempts(self, client):
        """5+ failed login attempts in a row must result in 429."""
        for i in range(5):
            client.post(
                "/api/auth/login",
                json={"username": "admin", "password": f"wrong{i}"},
            )

        # 6th attempt
        r = client.post(
            "/api/auth/login",
            json={"username": "admin", "password": "wrong6"},
        )
        assert r.status_code == 429
        assert "retry" in r.text.lower() or "rate" in r.text.lower()

    def test_response_has_ratelimit_header(self, client):
        """All responses should include X-RateLimit-Remaining header."""
        r = client.get("/api/health")
        assert "X-RateLimit-Remaining" in r.headers

    def test_ratelimit_remaining_decrements(self, client):
        """X-RateLimit-Remaining must decrease with each request."""
        r1 = client.get("/api/health")
        r2 = client.get("/api/health")
        remaining1 = int(r1.headers.get("X-RateLimit-Remaining", 999))
        remaining2 = int(r2.headers.get("X-RateLimit-Remaining", 999))
        assert remaining2 < remaining1


# ═════════════════════════════════════════════════════════════════════════════
# SECTION 4 — Input Sanitisation (already partially working — regression tests)
# ═════════════════════════════════════════════════════════════════════════════

class TestInputSanitisation:
    """
    Ensure common injection patterns are safely handled.
    These tests should PASS even before Sprint 1 (regression tests).
    """

    def test_xss_in_strategy_name_is_stored_safely(self, client):
        """Strategy name with XSS payload must be stored as plain text."""
        payload = "<script>alert('xss')</script>"
        r = client.post(
            "/api/strategies",
            json={"name": payload, "type": "sma_crossover"},
        )
        # Either stored safely or rejected
        if r.status_code == 200:
            strategy_id = r.json()["strategy_id"]
            r2 = client.get("/api/strategies")
            found = [s for s in r2.json()["strategies"] if s["id"] == strategy_id]
            assert found[0]["name"] == payload  # Stored as-is (plain text, no execution)

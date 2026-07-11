"""
Admin Panel Database API
SQLite database management endpoints with auto audit logging.
"""
from fastapi import FastAPI, HTTPException, Query, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse
from pydantic import BaseModel
from typing import List, Optional
import hashlib
import secrets
import sqlite3
import json
import os
from datetime import datetime
from contextlib import asynccontextmanager

# Environment variables with defaults
DB_PATH = os.getenv("DB_PATH", "/app/data/admin_panel.db")
API_PORT = int(os.getenv("ADMIN_DB_API_PORT", "8001"))
_cors_env = os.getenv("CORS_ORIGINS", "")
CORS_ORIGINS = (
    [o.strip() for o in _cors_env.split(",") if o.strip()]
    or ["http://localhost:3000", "http://localhost:5173"]
)
ADMIN_API_KEY = os.getenv("ADMIN_API_KEY", "")

# ── Schema creation + seed data ──────────────────────────────────────────────

def _init_db() -> None:
    """Create all tables and seed default data if they don't exist."""
    os.makedirs(os.path.dirname(DB_PATH), exist_ok=True)
    conn = sqlite3.connect(DB_PATH)
    conn.row_factory = sqlite3.Row
    c = conn.cursor()

    c.executescript("""
        CREATE TABLE IF NOT EXISTS settings (
            key         TEXT PRIMARY KEY,
            value       TEXT NOT NULL,
            category    TEXT NOT NULL DEFAULT 'general',
            description TEXT,
            updated_at  TEXT DEFAULT CURRENT_TIMESTAMP
        );

        CREATE TABLE IF NOT EXISTS users (
            id            INTEGER PRIMARY KEY AUTOINCREMENT,
            username      TEXT UNIQUE NOT NULL,
            email         TEXT UNIQUE NOT NULL,
            role          TEXT NOT NULL DEFAULT 'viewer',
            password_hash TEXT,
            created_at    TEXT DEFAULT CURRENT_TIMESTAMP
        );

        CREATE TABLE IF NOT EXISTS api_configs (
            id         INTEGER PRIMARY KEY AUTOINCREMENT,
            name       TEXT UNIQUE NOT NULL,
            endpoint   TEXT NOT NULL,
            api_key    TEXT,
            is_enabled INTEGER NOT NULL DEFAULT 1,
            created_at TEXT DEFAULT CURRENT_TIMESTAMP
        );

        CREATE TABLE IF NOT EXISTS scheduled_tasks (
            id         INTEGER PRIMARY KEY AUTOINCREMENT,
            name       TEXT NOT NULL,
            task_type  TEXT NOT NULL,
            schedule   TEXT NOT NULL,
            parameters TEXT,
            is_active  INTEGER NOT NULL DEFAULT 1,
            created_at TEXT DEFAULT CURRENT_TIMESTAMP
        );

        CREATE TABLE IF NOT EXISTS audit_logs (
            id         INTEGER PRIMARY KEY AUTOINCREMENT,
            action     TEXT NOT NULL,
            user       TEXT NOT NULL DEFAULT 'system',
            details    TEXT,
            created_at TEXT DEFAULT CURRENT_TIMESTAMP
        );

        CREATE TABLE IF NOT EXISTS api_endpoints (
            id           INTEGER PRIMARY KEY AUTOINCREMENT,
            name         TEXT NOT NULL,
            url          TEXT NOT NULL,
            is_active    INTEGER NOT NULL DEFAULT 1,
            last_updated TEXT DEFAULT CURRENT_TIMESTAMP
        );
    """)
    conn.commit()

    # ── Seed default data (only if tables are empty) ──────────────────────────

    # Settings
    if not c.execute("SELECT 1 FROM settings LIMIT 1").fetchone():
        defaults = [
            ("theme",            "dark",          "ui",           "Interface theme"),
            ("language",         "en",            "ui",           "Display language"),
            ("timezone",         "UTC",           "general",      "System timezone"),
            ("log_level",        "INFO",          "system",       "Logging verbosity"),
            ("max_connections",  "100",           "performance",  "Max DB connections"),
            ("session_timeout",  "1440",          "security",     "Session timeout (min)"),
        ]
        c.executemany(
            "INSERT OR IGNORE INTO settings (key, value, category, description) VALUES (?, ?, ?, ?)",
            defaults
        )

    # Users
    if not c.execute("SELECT 1 FROM users LIMIT 1").fetchone():
        c.execute(
            "INSERT OR IGNORE INTO users (username, email, role) VALUES (?, ?, ?)",
            ("admin", "admin@nautilus.local", "admin")
        )

    # API Configs
    if not c.execute("SELECT 1 FROM api_configs LIMIT 1").fetchone():
        c.executemany(
            "INSERT OR IGNORE INTO api_configs (name, endpoint, is_enabled) VALUES (?, ?, ?)",
            [
                ("Nautilus Main API", "http://localhost:8000", 1),
                ("Binance REST",      "https://api.binance.com", 1),
                ("Bybit REST",        "https://api.bybit.com",   0),
            ]
        )

    # Scheduled Tasks
    if not c.execute("SELECT 1 FROM scheduled_tasks LIMIT 1").fetchone():
        c.executemany(
            "INSERT OR IGNORE INTO scheduled_tasks (name, task_type, schedule, is_active) VALUES (?, ?, ?, ?)",
            [
                ("Daily Backup",    "backup",    "0 2 * * *", 1),
                ("DB Optimize",     "optimize",  "0 3 * * 0", 1),
                ("Cache Cleanup",   "clean",     "0 1 * * *", 1),
            ]
        )

    # API Endpoints
    if not c.execute("SELECT 1 FROM api_endpoints LIMIT 1").fetchone():
        c.executemany(
            "INSERT OR IGNORE INTO api_endpoints (name, url, is_active) VALUES (?, ?, ?)",
            [
                ("Main API",       "http://localhost:8000", 1),
                ("Admin DB API",   "http://localhost:8001", 1),
                ("WebSocket",      "ws://localhost:8000/ws", 1),
            ]
        )

    # Audit log entry
    if not c.execute("SELECT 1 FROM audit_logs LIMIT 1").fetchone():
        c.execute(
            "INSERT INTO audit_logs (action, user, details) VALUES (?, ?, ?)",
            ("system_init", "system", "Admin database initialised with default seed data")
        )

    conn.commit()
    conn.close()


# ── Lifespan ──────────────────────────────────────────────────────────────────

@asynccontextmanager
async def lifespan(app: FastAPI):
    if not ADMIN_API_KEY:
        import sys
        print(
            "\n[SECURITY WARNING] ADMIN_API_KEY is not set — "
            "admin_db_api is running WITHOUT authentication. "
            "Set ADMIN_API_KEY env var before deploying.\n",
            file=sys.stderr,
        )
    _init_db()
    yield


app = FastAPI(title="Admin Panel Database API", lifespan=lifespan)

app.add_middleware(
    CORSMiddleware,
    allow_origins=CORS_ORIGINS,
    allow_credentials=True,
    allow_methods=["GET", "POST", "PUT", "DELETE", "OPTIONS"],
    allow_headers=["Authorization", "Content-Type", "X-Admin-Key"],
)

_ADMIN_PUBLIC = frozenset({"/api/admin/health", "/docs", "/redoc", "/openapi.json"})


@app.middleware("http")
async def _admin_auth_middleware(request: Request, call_next):
    """Enforce ADMIN_API_KEY when set. Public paths are always allowed."""
    if not ADMIN_API_KEY:
        return await call_next(request)
    if request.url.path in _ADMIN_PUBLIC or request.method == "OPTIONS":
        return await call_next(request)
    key = request.headers.get("X-Admin-Key", "")
    if not secrets.compare_digest(key, ADMIN_API_KEY):
        return JSONResponse(status_code=401, content={"detail": "Unauthorized"})
    return await call_next(request)


def get_db():
    conn = sqlite3.connect(DB_PATH)
    conn.row_factory = sqlite3.Row
    return conn


def _log_action(conn: sqlite3.Connection, action: str, user: str = "system", details: str = "") -> None:
    """Insert an audit log entry within an existing connection."""
    conn.execute(
        "INSERT INTO audit_logs (action, user, details) VALUES (?, ?, ?)",
        (action, user, details),
    )


def _hash_password(password: str) -> str:
    """Hash password with PBKDF2-HMAC-SHA256 + random salt (260k iterations)."""
    salt = secrets.token_hex(16)
    dk = hashlib.pbkdf2_hmac("sha256", password.encode(), salt.encode(), 260_000)
    return f"pbkdf2:sha256:{salt}:{dk.hex()}"


def _verify_password(password: str, stored: str) -> bool:
    """Verify a password against a stored hash (PBKDF2 or legacy SHA256)."""
    if stored.startswith("pbkdf2:sha256:"):
        _, _, salt, dk_hex = stored.split(":", 3)
        dk = hashlib.pbkdf2_hmac("sha256", password.encode(), salt.encode(), 260_000)
        return secrets.compare_digest(dk.hex(), dk_hex)
    # Legacy SHA256 fallback — still works but considered weak
    return secrets.compare_digest(
        hashlib.sha256(password.encode()).hexdigest(), stored
    )


# ── Pydantic models ───────────────────────────────────────────────────────────

class Setting(BaseModel):
    key: str
    value: str
    category: str
    description: Optional[str] = None

class User(BaseModel):
    username: str
    email: str
    role: str = "viewer"
    password: Optional[str] = None

class APIConfig(BaseModel):
    name: str
    endpoint: str
    api_key: Optional[str] = None
    is_enabled: bool = True

class ScheduledTask(BaseModel):
    name: str
    task_type: str
    schedule: str
    parameters: Optional[str] = None
    is_active: bool = True


# ── Health ────────────────────────────────────────────────────────────────────

@app.get("/api/admin/health")
def health_check():
    try:
        conn = get_db()
        conn.execute("SELECT 1")
        conn.close()
        db_ok = True
    except Exception:
        db_ok = False
    return {
        "status": "healthy" if db_ok else "degraded",
        "message": "Admin Panel Database API is running",
        "db_ok": db_ok,
    }


# ── Settings ──────────────────────────────────────────────────────────────────

@app.get("/api/admin/settings")
def get_settings():
    conn = get_db()
    cursor = conn.execute("SELECT * FROM settings ORDER BY category, key")
    settings = [dict(row) for row in cursor.fetchall()]
    conn.close()
    return {"settings": settings}

@app.get("/api/admin/settings/{key}")
def get_setting(key: str):
    conn = get_db()
    cursor = conn.execute("SELECT * FROM settings WHERE key = ?", (key,))
    setting = cursor.fetchone()
    conn.close()
    if not setting:
        raise HTTPException(status_code=404, detail="Setting not found")
    return dict(setting)

@app.post("/api/admin/settings")
def create_setting(setting: Setting):
    conn = get_db()
    try:
        conn.execute(
            "INSERT INTO settings (key, value, category, description) VALUES (?, ?, ?, ?)",
            (setting.key, setting.value, setting.category, setting.description)
        )
        _log_action(conn, "setting.create", details=f"key={setting.key} category={setting.category}")
        conn.commit()
        conn.close()
        return {"message": f"Setting '{setting.key}' created successfully"}
    except sqlite3.IntegrityError:
        conn.close()
        raise HTTPException(status_code=400, detail="Setting already exists")

@app.put("/api/admin/settings/{key}")
def update_setting(key: str, value: str = Query(...)):
    conn = get_db()
    conn.execute(
        "UPDATE settings SET value = ?, updated_at = CURRENT_TIMESTAMP WHERE key = ?",
        (value, key)
    )
    if conn.total_changes == 0:
        conn.close()
        raise HTTPException(status_code=404, detail="Setting not found")
    _log_action(conn, "setting.update", details=f"key={key} value={value}")
    conn.commit()
    conn.close()
    return {"message": f"Setting '{key}' updated successfully"}

@app.delete("/api/admin/settings/{key}")
def delete_setting(key: str):
    conn = get_db()
    conn.execute("DELETE FROM settings WHERE key = ?", (key,))
    if conn.total_changes == 0:
        conn.close()
        raise HTTPException(status_code=404, detail="Setting not found")
    _log_action(conn, "setting.delete", details=f"key={key}")
    conn.commit()
    conn.close()
    return {"message": f"Setting '{key}' deleted successfully"}


# ── Users ─────────────────────────────────────────────────────────────────────

@app.get("/api/admin/users")
def get_users():
    conn = get_db()
    cursor = conn.execute("SELECT * FROM users ORDER BY username")
    users = [dict(row) for row in cursor.fetchall()]
    conn.close()
    return {"users": users}

@app.post("/api/admin/users")
def create_user(user: User):
    conn = get_db()
    try:
        pw_hash = _hash_password(user.password) if user.password else None
        conn.execute(
            "INSERT INTO users (username, email, role, password_hash) VALUES (?, ?, ?, ?)",
            (user.username, user.email, user.role, pw_hash)
        )
        _log_action(conn, "user.create", details=f"username={user.username} role={user.role}")
        conn.commit()
        conn.close()
        return {"message": f"User '{user.username}' created successfully"}
    except sqlite3.IntegrityError:
        conn.close()
        raise HTTPException(status_code=400, detail="User already exists")


# ── API Configs ───────────────────────────────────────────────────────────────

@app.get("/api/admin/api-configs")
def get_api_configs():
    conn = get_db()
    cursor = conn.execute("SELECT * FROM api_configs ORDER BY name")
    configs = [dict(row) for row in cursor.fetchall()]
    conn.close()
    return {"configs": configs}

@app.post("/api/admin/api-configs")
def create_api_config(config: APIConfig):
    conn = get_db()
    try:
        conn.execute(
            "INSERT INTO api_configs (name, endpoint, api_key, is_enabled) VALUES (?, ?, ?, ?)",
            (config.name, config.endpoint, config.api_key, config.is_enabled)
        )
        _log_action(conn, "api_config.create", details=f"name={config.name} endpoint={config.endpoint}")
        conn.commit()
        conn.close()
        return {"message": f"API config '{config.name}' created successfully"}
    except sqlite3.IntegrityError:
        conn.close()
        raise HTTPException(status_code=400, detail="API config already exists")


# ── Scheduled Tasks ───────────────────────────────────────────────────────────

@app.get("/api/admin/scheduled-tasks")
def get_scheduled_tasks():
    conn = get_db()
    cursor = conn.execute("SELECT * FROM scheduled_tasks ORDER BY name")
    tasks = [dict(row) for row in cursor.fetchall()]
    conn.close()
    return {"tasks": tasks}

@app.post("/api/admin/scheduled-tasks")
def create_scheduled_task(task: ScheduledTask):
    conn = get_db()
    conn.execute(
        "INSERT INTO scheduled_tasks (name, task_type, schedule, parameters, is_active) VALUES (?, ?, ?, ?, ?)",
        (task.name, task.task_type, task.schedule, task.parameters, task.is_active)
    )
    _log_action(conn, "task.create", details=f"name={task.name} type={task.task_type} schedule={task.schedule}")
    conn.commit()
    conn.close()
    return {"message": f"Task '{task.name}' created successfully"}


# ── Audit Logs ────────────────────────────────────────────────────────────────

@app.get("/api/admin/audit-logs")
def get_audit_logs(limit: int = 100):
    conn = get_db()
    cursor = conn.execute("SELECT * FROM audit_logs ORDER BY created_at DESC LIMIT ?", (limit,))
    logs = [dict(row) for row in cursor.fetchall()]
    conn.close()
    return {"logs": logs}


# ── API Endpoints ─────────────────────────────────────────────────────────────

@app.get("/api/admin/endpoints")
def get_api_endpoints():
    conn = get_db()
    cursor = conn.execute("SELECT * FROM api_endpoints WHERE is_active = 1")
    endpoints = [dict(row) for row in cursor.fetchall()]
    conn.close()
    return {"endpoints": endpoints}

@app.put("/api/admin/endpoints/{endpoint_id}")
def update_api_endpoint(endpoint_id: int, data: dict):
    conn = get_db()
    conn.execute(
        "UPDATE api_endpoints SET url = ?, last_updated = CURRENT_TIMESTAMP WHERE id = ?",
        (data.get("url"), endpoint_id)
    )
    if conn.total_changes == 0:
        conn.close()
        raise HTTPException(status_code=404, detail="Endpoint not found")
    conn.commit()
    conn.close()
    return {"success": True, "message": "Endpoint updated"}


if __name__ == "__main__":
    import uvicorn
    uvicorn.run(app, host="0.0.0.0", port=API_PORT)

"""
Scanner Dashboard API router.
Replaces the standalone Express server from Trade-Scanner-Dashboard.
Reads/writes scan session JSON files from a configurable data directory.
"""
import json
import logging
import os
from datetime import datetime, timezone
from pathlib import Path
from typing import Any, Dict, List, Optional

import httpx
from fastapi import APIRouter, HTTPException, Query
from pydantic import BaseModel

# Import transcript fetcher (scripts/fetch_tastylive_transcripts.py)
import sys
_scripts_dir = Path(__file__).parent.parent / "scripts"
if _scripts_dir.exists():
    sys.path.insert(0, str(_scripts_dir))
try:
    import fetch_tastylive_transcripts as transcripts
    TRANSCRIPTS_AVAILABLE = True
except ImportError:
    TRANSCRIPTS_AVAILABLE = False
    transcripts = None
    logger.warning("fetch_tastylive_transcripts module not found — transcript endpoints disabled")

logger = logging.getLogger(__name__)
router = APIRouter(prefix="/api/scanner-dashboard", tags=["scanner-dashboard"])

# ── Configuration ──────────────────────────────────────────────────────────────
DATA_DIR = Path(os.getenv("SCANNER_DASHBOARD_DATA_DIR", "/app/data/scanner-dashboard"))
LLM_BASE_URL = os.getenv("LLM_BASE_URL", "http://localhost:8080")
LLM_MODEL = os.getenv("LLM_MODEL", "llama")

# ── Types ──────────────────────────────────────────────────────────────────────

class OptionSpread(BaseModel):
    width: float
    longStrike: float
    netCredit: float
    yieldPct: float
    maxRisk: float

class ScanEntry(BaseModel):
    ticker: str
    signal_type: str  # "radar_alert" | "trigger_entry"
    price: float
    rsi: float
    bb_lower: Optional[float] = None
    bb_upper: Optional[float] = None
    news_classification: Optional[str] = None
    news_confidence: Optional[float] = None
    news_summary: Optional[str] = None
    dte: Optional[int] = None
    composite_score: Optional[float] = None
    shortDelta: Optional[float] = None
    shortStrike: Optional[float] = None
    passingSpreads: Optional[List[OptionSpread]] = None

class ScanSession(BaseModel):
    scanId: str
    timestamp: str
    results: List[ScanEntry]

class BalanceData(BaseModel):
    netLiq: float = 0
    cashBalance: float = 0
    buyingPower: float = 0

class AIQueryRequest(BaseModel):
    question: str
    metrics: Optional[List[Any]] = None

# ── In-memory store ────────────────────────────────────────────────────────────

stored_sessions: List[ScanSession] = []
stored_balance: Optional[BalanceData] = None

# ── Helpers ────────────────────────────────────────────────────────────────────

SORT_FIELDS = {"rsi", "price", "dte", "composite_score"}

def _ensure_data_dir():
    DATA_DIR.mkdir(parents=True, exist_ok=True)

def _prune_old_files():
    _ensure_data_dir()
    cutoff = datetime.now(timezone.utc).timestamp() - 30 * 24 * 3600
    for f in DATA_DIR.iterdir():
        if not f.name.endswith(".json"):
            continue
        try:
            file_date = datetime.strptime(f.name.replace(".json", ""), "%Y-%m-%d").timestamp()
            if file_date < cutoff:
                f.unlink()
        except ValueError:
            continue

def _save_to_disk(sessions: List[ScanSession]):
    if not sessions:
        return
    date = sessions[0].timestamp[:10]
    _ensure_data_dir()
    path = DATA_DIR / f"{date}.json"
    path.write_text(json.dumps([s.model_dump() for s in sessions], indent=2))
    _prune_old_files()

def _load_from_disk(date: str) -> List[ScanSession]:
    path = DATA_DIR / f"{date}.json"
    if not path.exists():
        return []
    try:
        data = json.loads(path.read_text())
        return [ScanSession(**s) for s in data]
    except (json.JSONDecodeError, Exception):
        return []

def _get_latest_date() -> Optional[str]:
    _ensure_data_dir()
    files = sorted(
        [f.name.replace(".json", "") for f in DATA_DIR.iterdir() if f.name.endswith(".json")],
        reverse=True,
    )
    return files[0] if files else None

def _process_results(sessions: List[ScanSession], sort: str, dir_val: int, hide_passive: bool) -> List[dict]:
    all_results = []
    for s in sessions:
        for r in s.results:
            entry = r.model_dump()
            entry["_sessionTimestamp"] = s.timestamp
            entry["_sessionId"] = s.scanId
            all_results.append(entry)

    if hide_passive:
        all_results = [r for r in all_results if r.get("news_classification") != "passive"]

    if sort in SORT_FIELDS:
        all_results.sort(key=lambda r: r.get(sort, 0) or 0, reverse=dir_val == -1)

    return all_results

# ── Endpoints ──────────────────────────────────────────────────────────────────

@router.post("")
async def receive_scan_data(body: List[ScanSession] | ScanSession):
    """Receive scan sessions from Understory MCP."""
    incoming = body if isinstance(body, list) else [body]

    for s in incoming:
        if not s.scanId or not s.timestamp or not s.results:
            raise HTTPException(400, "Invalid session: missing scanId/timestamp/results")
        idx = next((i for i, x in enumerate(stored_sessions) if x.scanId == s.scanId), None)
        if idx is not None:
            stored_sessions[idx] = s
        else:
            stored_sessions.append(s)

    stored_sessions.sort(key=lambda x: x.timestamp, reverse=True)

    try:
        _save_to_disk(incoming)
    except Exception as e:
        logger.warning("Disk write failed: %s", e)

    return {"stored": len(stored_sessions)}

@router.get("/dates")
async def list_dates():
    """List all available scan dates."""
    try:
        _ensure_data_dir()
        dates = sorted(
            [f.name.replace(".json", "") for f in DATA_DIR.iterdir() if f.name.endswith(".json")],
            reverse=True,
        )
        return {"dates": dates}
    except Exception:
        return {"dates": []}

@router.get("")
async def get_scans(
    sort: str = Query("rsi"),
    dir: str = Query("desc"),
    hidePassive: bool = Query(False),
    date: Optional[str] = Query(None),
):
    """Get scan results with optional sort/filter/date."""
    try:
        if sort not in SORT_FIELDS:
            sort = "rsi"
        dir_val = 1 if dir == "asc" else -1

        if date:
            sessions = _load_from_disk(date)
        else:
            latest = _get_latest_date()
            if latest:
                sessions = _load_from_disk(latest)
            else:
                sessions = stored_sessions

        results = _process_results(sessions, sort, dir_val, hidePassive)
        return {
            "sessions": [s.model_dump() for s in sessions],
            "results": results,
        }
    except Exception as e:
        logger.error("GET scans error: %s", e)
        return {"sessions": [], "results": []}

@router.get("/{scan_id}")
async def get_scan_detail(scan_id: str):
    """Get a specific scan session by ID."""
    session = next((s for s in stored_sessions if s.scanId == scan_id), None)
    if not session:
        raise HTTPException(404, "Scan not found")
    return session.model_dump()

@router.post("/ai/query")
async def ai_query(req: AIQueryRequest):
    """Query the LLM with scan data context."""
    if not req.question:
        raise HTTPException(400, "question is required")

    system_prompt = (
        "You are an options trading analyst. Analyze the provided scan data "
        "and answer the user's question concisely with specific numbers."
    )

    user_content = (
        f"Current scan data:\n{json.dumps([m.model_dump() if hasattr(m, 'model_dump') else m for m in (req.metrics or [])], indent=2)}\n\n"
        f"Question: {req.question}"
    ) if req.metrics else req.question

    try:
        async with httpx.AsyncClient(timeout=30) as client:
            payload = {
                "model": LLM_MODEL,
                "messages": [
                    {"role": "system", "content": system_prompt},
                    {"role": "user", "content": user_content},
                ],
                "max_tokens": 2000,
                "temperature": 0.3,
            }
            resp = await client.post(
                f"{LLM_BASE_URL}/v1/chat/completions",
                json=payload,
            )
            if resp.status_code != 200:
                raise HTTPException(502, f"LLM returned {resp.status_code}")
            data = resp.json()
            answer = data.get("choices", [{}])[0].get("message", {}).get("content", "No response")
            return {"answer": answer}
    except httpx.TimeoutException:
        raise HTTPException(504, "LLM request timed out")
    except Exception as e:
        raise HTTPException(502, f"AI query failed: {str(e)[:200]}")

@router.get("/balance")
async def get_balance():
    """Get stored account balance."""
    if stored_balance:
        return stored_balance.model_dump()
    return {"netLiq": 0, "cashBalance": 0, "buyingPower": 0}

@router.post("/balance")
async def set_balance(balance: BalanceData):
    """Set account balance (posted by broker sync)."""
    global stored_balance
    stored_balance = balance
    return {"status": "ok"}


# ═════════════════════════════════════════════════════════════════════════════
#  TastyLive Transcripts
# ═════════════════════════════════════════════════════════════════════════════


@router.get("/transcripts")
async def list_transcripts():
    """List all cached transcripts."""
    if not TRANSCRIPTS_AVAILABLE:
        return {"available": False, "transcripts": {}, "library": []}
    return {
        "available": True,
        "transcripts": transcripts.get_transcripts(),
        "library": transcripts.get_video_library(),
    }


@router.get("/transcripts/search")
async def search_transcripts(q: str = Query("", description="Search query")):
    """Search transcript text for a keyword/phrase."""
    if not TRANSCRIPTS_AVAILABLE:
        return {"available": False, "results": []}

    all_transcripts = transcripts.get_transcripts()
    if not q.strip():
        return {"results": [], "total": 0}

    query = q.lower().strip()
    results = []
    for vid, data in all_transcripts.items():
        text = data.get("transcript", "").lower()
        if query in text:
            # Find surrounding context lines
            lines = data.get("transcript", "").split("\n")
            matching_lines = [l for l in lines if query in l.lower()]
            results.append({
                "id": vid,
                "title": data.get("title", ""),
                "matches": len(matching_lines),
                "snippets": matching_lines[:5],
                "chars": data.get("chars", 0),
            })

    results.sort(key=lambda r: r["matches"], reverse=True)
    return {"results": results, "total": len(results)}


@router.post("/transcripts/fetch")
async def trigger_fetch(video_ids: Optional[List[str]] = Query(None)):
    """Fetch transcripts for given video IDs (or all if none)."""
    if not TRANSCRIPTS_AVAILABLE:
        return {"status": "unavailable", "message": "Transcript fetcher not available"}

    # Run as background task to avoid timeout
    import asyncio
    loop = asyncio.get_event_loop()
    result = await loop.run_in_executor(None, transcripts.run_fetch, video_ids, True)
    return {"status": "completed", **result}

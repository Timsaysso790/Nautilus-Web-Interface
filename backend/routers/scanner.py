"""
Scanner relay router — reads scanner output and provides run control.
"""
import json
import logging
import os
import subprocess
from datetime import datetime, timezone
from pathlib import Path
from typing import Any, Dict, List, Optional

from fastapi import APIRouter, Depends, HTTPException

from auth_jwt import get_current_user

logger = logging.getLogger(__name__)
router = APIRouter(prefix="/api/scanner", tags=["scanner"])

SCANNER_OUTPUT = Path(os.getenv("SCANNER_OUTPUT_PATH", "/opt/data/.mcp_scanner_output.json"))


def _load_scanner_output() -> Dict[str, Any]:
    """Load the latest scanner output from the relay file."""
    if not SCANNER_OUTPUT.exists():
        return {"status": "no_data", "message": "No scanner output file found. Run a scan first."}
    try:
        data = json.loads(SCANNER_OUTPUT.read_text())
        return data
    except Exception as e:
        return {"status": "error", "message": f"Failed to parse scanner output: {e}"}


@router.get("/results")
async def get_scanner_results(user: dict = Depends(get_current_user)):
    """Get the latest scanner results."""
    data = _load_scanner_output()
    if "status" in data:
        return data

    # Enrich with metadata
    tier1 = data.get("tier1_universe", [])
    tier2 = data.get("tier2_signals", [])
    tier3 = data.get("tier3_spread_setups", [])
    phase4 = data.get("phase4_results", [])
    news = data.get("news_filter_summary", {})
    meta = data.get("metadata", {})

    return {
        "status": "ready",
        "scan_date": data.get("scan_date", ""),
        "timestamp": data.get("timestamp", ""),
        "metadata": {
            "total_screened": meta.get("total_screened", len(tier1)),
            "pass_rate": meta.get("pass_rate", 0),
            "phases_completed": meta.get("phases_completed", []),
            "execution_time_s": meta.get("execution_time_s", 0),
        },
        "tier1": {
            "label": "Baseline Universe",
            "description": "Liquid large-cap names with active options chains",
            "count": len(tier1) if isinstance(tier1, list) else tier1,
            "tickers": tier1 if isinstance(tier1, list) else [],
        },
        "tier2": {
            "label": "Technical Signals",
            "description": "Oversold conditions (BB + RSI) with radar/trigger classification",
            "count": len(tier2) if isinstance(tier2, list) else 0,
            "signals": tier2 if isinstance(tier2, list) else [],
        },
        "tier3": {
            "label": "Spread Setups",
            "description": "Constructed put credit spreads with pricing",
            "count": len(tier3) if isinstance(tier3, list) else 0,
            "setups": tier3 if isinstance(tier3, list) else [],
        },
        "phase4": {
            "label": "Tastytrade Priced Setups",
            "description": "Spreads with real-time prices from Tastytrade",
            "count": len(phase4) if isinstance(phase4, list) else 0,
            "results": phase4 if isinstance(phase4, list) else [],
        },
        "news_filter": {
            "summary": news,
        },
    }


@router.get("/results/tier3")
async def get_tier3_setups(user: dict = Depends(get_current_user)):
    """Get just the tier 3 spread setups — most actionable."""
    data = _load_scanner_output()
    setups = data.get("tier3_spread_setups", [])
    phase4 = data.get("phase4_results", [])
    return {
        "setups": setups if isinstance(setups, list) else [],
        "priced": phase4 if isinstance(phase4, list) else [],
        "count": len(setups) if isinstance(setups, list) else 0,
        "priced_count": len(phase4) if isinstance(phase4, list) else 0,
    }


@router.post("/run")
async def run_scanner(user: dict = Depends(get_current_user)):
    """Trigger a scanner run (background process)."""
    # Check for scanner script
    scanner_paths = [
        "/opt/data/put_credit_spread_scanner.py",
        "/workspace/put_credit_spread_scanner.py",
        "/opt/data/scanner/run.py",
    ]
    script = None
    for p in scanner_paths:
        if Path(p).exists():
            script = p
            break

    if not script:
        raise HTTPException(404, "Scanner script not found. Expected at one of: " + ", ".join(scanner_paths))

    try:
        result = subprocess.run(
            ["python3", script],
            capture_output=True, text=True, timeout=300,
        )
        return {
            "status": "completed" if result.returncode == 0 else "failed",
            "exit_code": result.returncode,
            "stdout": result.stdout[-500:],
            "stderr": result.stderr[-500:],
        }
    except subprocess.TimeoutExpired:
        return {"status": "timeout", "message": "Scanner timed out after 5 minutes"}
    except Exception as e:
        raise HTTPException(500, f"Failed to run scanner: {e}")

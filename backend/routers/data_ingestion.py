"""
Data Ingestion API router.
Self-service data pipeline: check availability, fetch from sources, convert to parquet.
"""
import asyncio
import json
import logging
import os
import time
import uuid
from datetime import datetime
from pathlib import Path
from typing import Any, Dict, List, Optional

from fastapi import APIRouter, HTTPException, WebSocket, WebSocketDisconnect
from pydantic import BaseModel

logger = logging.getLogger(__name__)
router = APIRouter(prefix="/api/data-ingestion", tags=["data-ingestion"])

# ── Paths ──────────────────────────────────────────────────────────────────────
OPTIONS_ARCHIVE = Path(os.getenv("OPTIONS_ARCHIVE_PATH", "/workspace/Archive/Nautilus_Archive5min"))
EQUITY_ARCHIVE = Path(os.getenv("EQUITY_ARCHIVE_PATH", "/workspace/Archive/Equity_Archive"))
JOBS_FILE = Path(os.getenv("DATA_JOBS_FILE", "/opt/data/.data_ingestion_jobs.json"))

# ── Data Sources ────────────────────────────────────────────────────────────────
THETADATA_AVAILABLE = False
try:
    from data_sources.theta_data import ThetaDataClient
    THETADATA_AVAILABLE = True
except ImportError:
    pass

# ── In-memory job tracker ──────────────────────────────────────────────────────
_active_jobs: Dict[str, Dict[str, Any]] = {}
_ws_clients: Dict[str, List[WebSocket]] = {}


def _load_job_history() -> Dict[str, Any]:
    if JOBS_FILE.exists():
        try:
            return json.loads(JOBS_FILE.read_text())
        except Exception:
            return {}
    return {}


def _save_job_history(jobs: Dict[str, Any]):
    JOBS_FILE.parent.mkdir(parents=True, exist_ok=True)
    JOBS_FILE.write_text(json.dumps(jobs, indent=2))


def _emit_progress(job_id: str, data: dict):
    """Push progress to WebSocket clients for this job."""
    import asyncio
    ws_list = _ws_clients.get(job_id, [])
    for ws in ws_list[:]:
        try:
            async def _send(ws, data):
                try:
                    await ws.send_json(data)
                except Exception:
                    pass
            asyncio.ensure_future(_send(ws, data))
        except Exception:
            pass


async def _run_ingest_job(job_id: str, ticker: str, data_type: str, start: str, end: str, source: str):
    """Background job: fetch data, convert to parquet, save to archive."""
    try:
        _active_jobs[job_id]["status"] = "running"
        _active_jobs[job_id]["progress"] = 0.0
        _active_jobs[job_id]["message"] = f"Starting {data_type} fetch for {ticker}..."

        # Determine target directory
        base_path = OPTIONS_ARCHIVE if data_type == "options" else EQUITY_ARCHIVE
        ticker_dir = base_path / ticker.upper()
        ticker_dir.mkdir(parents=True, exist_ok=True)

        start_year = int(start[:4])
        end_year = int(end[:4])
        total_years = max(end_year - start_year + 1, 1)

        # Simulate / actually progress through years
        for year in range(start_year, end_year + 1):
            progress = (year - start_year + 1) / total_years
            _active_jobs[job_id]["progress"] = round(progress, 2)
            _active_jobs[job_id]["message"] = f"Processing {ticker} {year}... ({int(progress*100)}%)"
            _emit_progress(job_id, {"job_id": job_id, "ticker": ticker, "progress": progress, "year": year})

            output_path = ticker_dir / f"{ticker}_{year}.parquet"
            if output_path.exists():
                logger.info(f"Skipping {ticker}_{year} — already exists")
                _active_jobs[job_id]["message"] = f"Skipping {ticker} {year} (exists)"
                continue

            try:
                if data_type == "options" and source == "thetadata" and THETADATA_AVAILABLE:
                    # Use ThetaData client
                    client = ThetaDataClient()
                    if hasattr(client, "get_option_chain") and callable(client.get_option_chain):
                        df = await client.get_option_chain(ticker, str(year), str(year))
                    else:
                        raise NotImplementedError("ThetaData option chain method not available")
                else:
                    # Fallback to yfinance for equities
                    import yfinance as yf
                    tk = yf.Ticker(ticker)
                    df = tk.history(start=f"{year}-01-01", end=f"{year+1 if year < end_year else end}-12-31", interval="1d")
                    if not df.empty:
                        df.reset_index(inplace=True)
                        df["ticker"] = ticker.upper()
                        # Convert to parquet via pyarrow
                        import pyarrow as pa
                        import pyarrow.parquet as pq
                        table = pa.Table.from_pandas(df)
                        pq.write_table(table, str(output_path))
                        logger.info(f"Wrote {output_path} ({len(df)} rows)")
                        _active_jobs[job_id]["files_created"] = _active_jobs[job_id].get("files_created", 0) + 1
            except Exception as e:
                logger.error(f"Failed to fetch {ticker} {year}: {e}")
                _active_jobs[job_id]["warnings"] = _active_jobs[job_id].get("warnings", [])
                _active_jobs[job_id]["warnings"].append(f"Year {year}: {str(e)[:100]}")

            await asyncio.sleep(0.5)  # Rate limiting

        _active_jobs[job_id]["status"] = "completed"
        _active_jobs[job_id]["progress"] = 1.0
        _active_jobs[job_id]["message"] = f"Completed: {ticker} ({data_type})"
        _active_jobs[job_id]["completed_at"] = datetime.utcnow().isoformat()
        _emit_progress(job_id, {"job_id": job_id, "ticker": ticker, "status": "completed"})

        # Persist
        history = _load_job_history()
        history[job_id] = dict(_active_jobs[job_id])
        _save_job_history(history)

    except Exception as e:
        _active_jobs[job_id]["status"] = "failed"
        _active_jobs[job_id]["message"] = str(e)
        _active_jobs[job_id]["error"] = str(e)
        _emit_progress(job_id, {"job_id": job_id, "status": "failed", "error": str(e)})
        logger.exception(f"Ingestion job {job_id} failed")


# ── Models ───────────────────────────────────────────────────────────────────────

class IngestRequest(BaseModel):
    ticker: str
    data_type: str = "equities"  # "options" or "equities"
    start_date: str = "2020-01-01"
    end_date: str = ""
    source: str = "yfinance"  # "thetadata" or "yfinance"


class CheckRequest(BaseModel):
    ticker: str


# ── Endpoints ────────────────────────────────────────────────────────────────────

@router.get("/catalog")
async def get_catalog():
    """Return what data exists in both archives."""
    result = {"options": {}, "equities": {}}

    if OPTIONS_ARCHIVE.exists():
        for d in sorted(OPTIONS_ARCHIVE.iterdir()):
            if d.is_dir():
                parquets = list(d.glob("*.parquet"))
                if parquets:
                    total_size = sum(f.stat().st_size for f in parquets)
                    years = sorted(set(f.stem.split("_")[-1] for f in parquets))
                    result["options"][d.name] = {
                        "files": len(parquets),
                        "size_mb": round(total_size / 1e6, 1),
                        "years": years,
                    }

    if EQUITY_ARCHIVE.exists():
        for d in sorted(EQUITY_ARCHIVE.iterdir()):
            if d.is_dir():
                parquets = list(d.glob("*.parquet"))
                if parquets:
                    total_size = sum(f.stat().st_size for f in parquets)
                    years = sorted(set(f.stem.split("_")[-1] for f in parquets))
                    result["equities"][d.name] = {
                        "files": len(parquets),
                        "size_mb": round(total_size / 1e6, 1),
                        "years": years,
                    }

    return {
        "options": result["options"],
        "equities": result["equities"],
        "options_count": len(result["options"]),
        "equities_count": len(result["equities"]),
        "options_archive_path": str(OPTIONS_ARCHIVE),
        "equity_archive_path": str(EQUITY_ARCHIVE),
    }


@router.post("/check")
async def check_ticker(req: CheckRequest):
    """Preview what data is available for a ticker before ingesting."""
    ticker = req.ticker.upper()
    result = {
        "ticker": ticker,
        "exists_in_options": False,
        "exists_in_equities": False,
        "theta_data_available": False,
        "yfinance_available": True,
        "estimated_options_years": [],
        "estimated_options_size_mb": 0,
    }

    # Check archives
    if (OPTIONS_ARCHIVE / ticker).exists():
        parquets = list((OPTIONS_ARCHIVE / ticker).glob("*.parquet"))
        if parquets:
            result["exists_in_options"] = True
            result["estimated_options_years"] = sorted(set(f.stem.split("_")[-1] for f in parquets))
            result["estimated_options_size_mb"] = round(sum(f.stat().st_size for f in parquets) / 1e6, 1)

    if (EQUITY_ARCHIVE / ticker).exists():
        parquets = list((EQUITY_ARCHIVE / ticker).glob("*.parquet"))
        if parquets:
            result["exists_in_equities"] = True

    # Check ThetaData availability
    if THETADATA_AVAILABLE:
        try:
            client = ThetaDataClient()
            if hasattr(client, "check_ticker") and callable(client.check_ticker):
                result["theta_data_available"] = await client.check_ticker(ticker)
            else:
                result["theta_data_available"] = True  # Assume available
        except Exception:
            pass

    return result


@router.post("/ingest")
async def start_ingestion(req: IngestRequest):
    """Start a background ingestion job."""
    ticker = req.ticker.upper()
    end = req.end_date or datetime.utcnow().strftime("%Y-%m-%d")

    job_id = str(uuid.uuid4())[:8]
    job = {
        "id": job_id,
        "ticker": ticker,
        "data_type": req.data_type,
        "start_date": req.start_date,
        "end_date": end,
        "source": req.source,
        "status": "queued",
        "progress": 0.0,
        "message": "Queued...",
        "files_created": 0,
        "warnings": [],
        "created_at": datetime.utcnow().isoformat(),
    }
    _active_jobs[job_id] = job

    # Launch background
    asyncio.create_task(_run_ingest_job(
        job_id, ticker, req.data_type, req.start_date, end, req.source
    ))

    return {"job_id": job_id, "status": "queued", "ticker": ticker}


@router.get("/jobs")
async def list_jobs():
    """Return all recent jobs (active + history)."""
    history = _load_job_history()
    combined = dict(history)
    for jid, job in _active_jobs.items():
        combined[jid] = job
    # Sort by created_at desc
    sorted_jobs = sorted(combined.values(), key=lambda j: j.get("created_at", ""), reverse=True)
    return {"jobs": sorted_jobs, "active_count": len([j for j in _active_jobs.values() if j.get("status") in ("queued", "running")])}


@router.get("/jobs/{job_id}")
async def get_job(job_id: str):
    if job_id in _active_jobs:
        return _active_jobs[job_id]
    history = _load_job_history()
    if job_id in history:
        return history[job_id]
    raise HTTPException(404, f"Job {job_id} not found")


@router.websocket("/ws/{job_id}")
async def job_websocket(ws: WebSocket, job_id: str):
    """WebSocket for live job progress."""
    await ws.accept()
    if job_id not in _ws_clients:
        _ws_clients[job_id] = []
    _ws_clients[job_id].append(ws)

    try:
        while True:
            await ws.receive_text()  # Keep alive
    except WebSocketDisconnect:
        pass
    finally:
        if job_id in _ws_clients:
            _ws_clients[job_id] = [w for w in _ws_clients[job_id] if w != ws]

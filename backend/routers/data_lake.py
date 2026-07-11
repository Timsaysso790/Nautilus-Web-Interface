import json
import logging
import os
import uuid
from datetime import datetime, timezone
from pathlib import Path
from typing import Any, Dict, List, Optional

from fastapi import APIRouter, BackgroundTasks, Depends, HTTPException, Query
from pydantic import BaseModel

import database
from auth_jwt import require_admin
from credential_utils import encrypt_credential, mask_credential, decrypt_credential
from data_sources.converter import convert_theta_data
from data_sources.ingester import scan_catalog, remove_from_catalog
from data_sources.manager import DataSourceManager
from data_sources.theta_downloader import (
    download_equity_bars,
    download_option_greeks,
    batch_download,
    list_symbols,
    scan_ticker_coverage,
    delete_ticker as delete_ticker_data,
)
from data_sources.archive_converter import convert_ticker, list_cache, clear_cache

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/api/data-lake", tags=["data-lake"])

# In-memory task progress (volatile — fine for background tasks)
_convert_tasks: Dict[str, Dict[str, Any]] = {}


async def _get_theta_api_key() -> Optional[str]:
    """Retrieve decrypted ThetaData API key from DB."""
    sources = await database.list_data_sources()
    for src in sources:
        if src["source_type"] == "thetadata":
            full = await database.get_data_source(src["id"])
            if full and full.get("api_key_encrypted"):
                return decrypt_credential(full["api_key_encrypted"])
    return os.getenv("THETADATA_API_KEY")


def _run_conversion(task_id: str, source_path: str, instrument_filter: Optional[str] = None):
    """Run conversion in background, updating _convert_tasks with progress."""
    try:
        src_path = Path(source_path)
        total = len(list(src_path.rglob("*.parquet")))
        _convert_tasks[task_id].update({"total_files": total, "status": "running"})

        def progress_callback(fpath: str, idx: int, converted: int, skipped: int, errors: int, total: int):
            _convert_tasks[task_id].update({
                "current_file": Path(fpath).name,
                "processed": idx + 1,
                "converted": converted,
                "skipped": skipped,
                "errors": errors,
                "total_files": total,
            })

        stats = convert_theta_data(
            source_path=source_path,
            instrument_filter=instrument_filter,
            progress_callback=progress_callback,
        )
        _convert_tasks[task_id].update({"status": "completed", **stats})
    except Exception as e:
        logging.exception("Background conversion failed: %s", e)
        _convert_tasks[task_id].update({"status": "error", "error_detail": str(e)})


# Load .env as a fallback (main load happens in nautilus_fastapi.py)
try:
    from dotenv import load_dotenv
    dotenv_path = Path(__file__).parent.parent.parent / ".env"
    if dotenv_path.exists():
        load_dotenv(dotenv_path)
except ImportError:
    pass


def _browse_base() -> Path:
    """Resolve the catalog root at call time (not import time)."""
    return Path(os.getenv("NAUTILUS_CATALOG_PATH", "./data_lake")).resolve()


# ── Models ────────────────────────────────────────────────────────────────────

class CreateSourceRequest(BaseModel):
    source_type: str
    api_key: str = ""
    label: str = ""
    config: Dict[str, Any] = {}


class UpdateSourceRequest(BaseModel):
    api_key: Optional[str] = None
    label: Optional[str] = None
    config: Optional[Dict[str, Any]] = None


class CreateJobRequest(BaseModel):
    source_id: Optional[str] = None
    source_type: str
    config: Dict[str, Any]


class ConvertRequest(BaseModel):
    source_path: str
    instrument_id_template: Optional[str] = None
    instrument_filter: Optional[str] = None


class BatchDownloadRequest(BaseModel):
    symbols: List[str]
    start_date: str
    end_date: str
    tier: str = "free"
    bars: bool = True
    greeks: bool = False


# ── Sources ───────────────────────────────────────────────────────────────────

@router.get("/sources")
async def list_sources():
    sources = await database.list_data_sources()
    masked = []
    for s in sources:
        full = await database.get_data_source(s["id"])
        masked.append({
            **s,
            "has_api_key": bool(full and full.get("api_key_encrypted")),
        })
    return {"sources": masked, "count": len(masked)}


@router.post("/sources", dependencies=[Depends(require_admin)])
async def create_source(req: CreateSourceRequest):
    encrypted = encrypt_credential(req.api_key) if req.api_key else ""
    source = await database.create_data_source(
        source_type=req.source_type,
        api_key_encrypted=encrypted,
        label=req.label or req.source_type,
        config=req.config,
    )
    return {"success": True, "source": source}


@router.get("/sources/{source_id}")
async def get_source(source_id: str):
    source = await database.get_data_source(source_id)
    if not source:
        raise HTTPException(status_code=404, detail="Source not found")
    return {
        "id": source["id"],
        "source_type": source["source_type"],
        "label": source["label"],
        "config": json.loads(source.get("config", "{}")),
        "api_key_masked": mask_credential(source.get("api_key_encrypted", "")),
        "created_at": source["created_at"],
    }


@router.put("/sources/{source_id}", dependencies=[Depends(require_admin)])
async def update_source(source_id: str, req: UpdateSourceRequest):
    updates = {}
    if req.api_key is not None:
        updates["api_key_encrypted"] = encrypt_credential(req.api_key)
    if req.label is not None:
        updates["label"] = req.label
    if req.config is not None:
        updates["config"] = req.config
    ok = await database.update_data_source(source_id, updates)
    if not ok:
        raise HTTPException(status_code=404, detail="Source not found")
    return {"success": True}


@router.delete("/sources/{source_id}", dependencies=[Depends(require_admin)])
async def delete_source(source_id: str):
    ok = await database.delete_data_source(source_id)
    if not ok:
        raise HTTPException(status_code=404, detail="Source not found")
    return {"success": True}


@router.post("/sources/{source_id}/test")
async def test_source(source_id: str):
    source = await database.get_data_source(source_id)
    if not source:
        raise HTTPException(status_code=404, detail="Source not found")

    from credential_utils import decrypt_credential
    api_key = decrypt_credential(source.get("api_key_encrypted", ""))

    mgr = DataSourceManager()
    try:
        src = mgr.get_source(source["source_type"])
        ok = await src.validate_connection(api_key)
        return {"success": ok, "connected": ok}
    except Exception as e:
        return {"success": False, "connected": False, "error": str(e)}


# ── Download Jobs ──────────────────────────────────────────────────────────────

@router.get("/jobs")
async def list_jobs():
    jobs = await database.list_download_jobs()
    return {"jobs": jobs, "count": len(jobs)}


@router.post("/jobs", dependencies=[Depends(require_admin)])
async def create_job(req: CreateJobRequest):
    job = await DataSourceManager.create_and_run_job(
        source_id=req.source_id,
        source_type=req.source_type,
        config=req.config,
    )
    return {"success": True, "job": job}


@router.get("/jobs/{job_id}")
async def get_job(job_id: str):
    job = await database.get_download_job(job_id)
    if not job:
        raise HTTPException(status_code=404, detail="Job not found")
    return {"job": job}


@router.delete("/jobs/{job_id}", dependencies=[Depends(require_admin)])
async def delete_job(job_id: str):
    ok = await database.delete_download_job(job_id)
    if not ok:
        raise HTTPException(status_code=404, detail="Job not found")
    return {"success": True}


# ── Conversion ─────────────────────────────────────────────────────────────────

@router.post("/convert", dependencies=[Depends(require_admin)])
async def convert_data(req: ConvertRequest, background_tasks: BackgroundTasks):
    try:
        base = _browse_base()
        full_path = (base / req.source_path).resolve()
        full_path.relative_to(base)

        task_id = str(uuid.uuid4())
        _convert_tasks[task_id] = {
            "status": "pending", "total_files": 0, "processed": 0,
            "current_file": "", "converted": 0, "skipped": 0, "errors": 0,
        }

        background_tasks.add_task(
            _run_conversion, task_id, str(full_path), req.instrument_filter
        )

        return {"task_id": task_id}
    except Exception as e:
        raise HTTPException(status_code=400, detail=str(e))


@router.get("/convert/status/{task_id}")
async def convert_task_status(task_id: str):
    task = _convert_tasks.get(task_id)
    if not task:
        raise HTTPException(status_code=404, detail="Task not found")
    return task


@router.post("/jobs/{job_id}/convert", dependencies=[Depends(require_admin)])
async def convert_job_data(job_id: str):
    job = await database.get_download_job(job_id)
    if not job:
        raise HTTPException(status_code=404, detail="Job not found")
    if job["status"] != "completed":
        raise HTTPException(status_code=400, detail="Job must be completed before converting")
    if not job.get("download_path"):
        raise HTTPException(status_code=400, detail="No download path for this job")

    await database.update_download_job(job_id, status="converting")
    try:
        stats = convert_theta_data(source_path=job["download_path"])
        await database.update_download_job(job_id, status="converted")
        return {"success": True, "stats": stats}
    except Exception as e:
        await database.update_download_job(job_id, status="error", error=str(e))
        raise HTTPException(status_code=500, detail=str(e))


# ── Catalog ────────────────────────────────────────────────────────────────────

@router.get("/catalog")
async def browse_catalog():
    return scan_catalog()


@router.delete("/catalog/{data_type}/{instrument_id}", dependencies=[Depends(require_admin)])
async def delete_catalog_entry(data_type: str, instrument_id: str):
    ok = remove_from_catalog(data_type, instrument_id)
    if not ok:
        raise HTTPException(status_code=404, detail="Not found in catalog")
    return {"success": True}


# ── Folder browse ──────────────────────────────────────────────────────────────

@router.get("/browse")
async def browse_folder(path: str = Query("", alias="path")):
    base = _browse_base()
    try:
        resolved = (base / path).resolve()
        resolved.relative_to(base)
    except (ValueError, RuntimeError):
        raise HTTPException(status_code=400, detail="Path outside allowed directory")

    if not resolved.is_dir():
        raise HTTPException(status_code=404, detail="Directory not found")

    subdirs: List[Dict[str, Any]] = []
    parquet_files: List[Dict[str, Any]] = []
    parquet_count = 0

    try:
        for entry in sorted(resolved.iterdir(), key=lambda e: (not e.is_dir(), e.name.lower())):
            if entry.is_dir():
                subdirs.append({"name": entry.name, "path": str(entry.relative_to(base))})
            elif entry.suffix.lower() == ".parquet":
                parquet_count += 1
                if len(parquet_files) < 50:
                    parquet_files.append({
                        "name": entry.name,
                        "size_bytes": entry.stat().st_size,
                    })
    except PermissionError:
        raise HTTPException(status_code=403, detail="Permission denied")

    parent_path = ""
    try:
        parent = resolved.parent
        if parent != base:
            parent_path = str(parent.relative_to(base))
    except ValueError:
        parent_path = ""

    total_parquet = sum(1 for _ in resolved.rglob("*.parquet"))

    return {
        "current_path": str(resolved.relative_to(base)) if resolved != base else "",
        "subdirectories": subdirs,
        "parquet_files": parquet_files,
        "parquet_count": parquet_count,
        "total_parquet_recursive": total_parquet,
        "parent_path": parent_path,
    }


@router.post("/import", dependencies=[Depends(require_admin)])
async def import_existing_data(req: ConvertRequest):
    try:
        base = _browse_base()
        full_path = (base / req.source_path).resolve()
        full_path.relative_to(base)
        stats = convert_theta_data(
            source_path=str(full_path),
            instrument_id_template=req.instrument_id_template,
            instrument_filter=req.instrument_filter,
        )
        return {"success": True, "stats": stats}
    except Exception as e:
        raise HTTPException(status_code=400, detail=str(e))


# ── ThetaData batch download ─────────────────────────────────────────────────────

def _run_batch_download(
    task_id: str,
    symbols: List[str],
    start_date: str,
    end_date: str,
    tier: str,
    bars: bool,
    greeks: bool,
    output_dir: str,
    api_key: str,
):
    def cb(msg, idx, converted, skipped, errors, total):
        _convert_tasks[task_id].update({
            "status": "running",
            "current_file": msg,
            "processed": idx,
            "converted": converted,
            "skipped": skipped,
            "errors": errors,
            "total_files": total,
        })

    try:
        from datetime import date
        sd = date.fromisoformat(start_date)
        ed = date.fromisoformat(end_date)

        _convert_tasks[task_id].update({"status": "running"})
        stats = batch_download(
            symbols=symbols,
            start_date=sd,
            end_date=ed,
            output_dir=output_dir,
            api_key=api_key,
            tier=tier,
            bars=bars,
            greeks=greeks,
            progress_callback=cb,
        )
        _convert_tasks[task_id].update({"status": "completed", **stats})
    except Exception as e:
        logger.exception("Batch download failed: %s", e)
        _convert_tasks[task_id].update({"status": "error", "error_detail": str(e)})


@router.post("/thetadata/batch-download", dependencies=[Depends(require_admin)])
async def start_batch_download(req: BatchDownloadRequest, background_tasks: BackgroundTasks):
    api_key = await _get_theta_api_key()
    if not api_key:
        raise HTTPException(status_code=400, detail="No ThetaData API key configured. Add one in Keys & Connections.")

    output_dir = str(_browse_base())

    task_id = str(uuid.uuid4())
    _convert_tasks[task_id] = {
        "status": "pending", "total_files": 0, "processed": 0,
        "current_file": "", "converted": 0, "skipped": 0, "errors": 0,
    }

    background_tasks.add_task(
        _run_batch_download,
        task_id, req.symbols, req.start_date, req.end_date,
        req.tier, req.bars, req.greeks, output_dir, api_key,
    )

    return {"task_id": task_id}


@router.get("/thetadata/symbols")
async def theta_symbols():
    try:
        api_key = await _get_theta_api_key()
        syms = list_symbols(api_key=api_key)
        return {"symbols": syms[:500]}
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


# ── Single-ticker download (legacy) ─────────────────────────────────────────────

class ThetaDataDownloadRequest(BaseModel):
    symbol: str
    start_date: str
    end_date: str


def _run_theta_download(task_id: str, symbol: str, start_date: str, end_date: str, output_dir: str, api_key: str):
    def cb(msg, idx, converted, skipped, errors, total):
        _convert_tasks[task_id].update({
            "status": "running",
            "current_file": msg,
            "processed": idx,
            "converted": converted,
            "skipped": skipped,
            "errors": errors,
            "total_files": total,
        })

    try:
        from datetime import date
        sd = date.fromisoformat(start_date)
        ed = date.fromisoformat(end_date)

        _convert_tasks[task_id].update({"status": "running"})
        stats = download_equity_bars(
            symbol=symbol,
            start_date=sd,
            end_date=ed,
            output_dir=output_dir,
            api_key=api_key,
            tier="free",
            progress_callback=cb,
        )
        _convert_tasks[task_id].update({"status": "completed", **stats})
    except Exception as e:
        logger.exception("Theta download failed: %s", e)
        _convert_tasks[task_id].update({"status": "error", "error_detail": str(e)})


@router.post("/thetadata/download", dependencies=[Depends(require_admin)])
async def start_theta_download(req: ThetaDataDownloadRequest, background_tasks: BackgroundTasks):
    api_key = await _get_theta_api_key()
    if not api_key:
        raise HTTPException(status_code=400, detail="No ThetaData API key configured.")

    output_dir = str(_browse_base())

    task_id = str(uuid.uuid4())
    _convert_tasks[task_id] = {
        "status": "pending", "total_files": 0, "processed": 0,
        "current_file": "", "converted": 0, "skipped": 0, "errors": 0,
    }

    background_tasks.add_task(
        _run_theta_download, task_id, req.symbol, req.start_date, req.end_date, output_dir, api_key,
    )

    return {"task_id": task_id}


# ── Ticker Management ─────────────────────────────────────────────────────────────

@router.get("/tickers")
async def ticker_coverage():
    base = _browse_base()
    tickers = scan_ticker_coverage(str(base))
    return {"tickers": tickers}


@router.delete("/tickers/{ticker}", dependencies=[Depends(require_admin)])
async def delete_ticker(ticker: str):
    base = _browse_base()
    removed = delete_ticker_data(str(base), ticker)
    return {"success": True, "removed": removed}


# ── NVMe Cache endpoints ─────────────────────────────────────────────────────────

def _run_cache_convert(task_id: str, ticker: str, archive_root: str, cache_root: str):
    def cb(msg, processed, converted, skipped, errors, total):
        _convert_tasks[task_id].update({
            "status": "running",
            "current_file": msg,
            "processed": processed,
            "converted": converted,
            "skipped": skipped,
            "errors": errors,
            "total_files": total,
        })

    try:
        _convert_tasks[task_id].update({"status": "running"})
        stats = convert_ticker(
            ticker=ticker,
            archive_root=archive_root,
            cache_root=cache_root,
            progress_callback=cb,
        )
        _convert_tasks[task_id].update({"status": "completed", **stats})
    except Exception as e:
        logger.exception("Cache convert failed for %s: %s", ticker, e)
        _convert_tasks[task_id].update({"status": "error", "error_detail": str(e)})


@router.post("/cache/convert/{ticker}", dependencies=[Depends(require_admin)])
async def convert_to_cache(ticker: str, background_tasks: BackgroundTasks):
    base = _browse_base()
    archive_root = str(base)
    cache_root = str(base)

    task_id = str(uuid.uuid4())
    _convert_tasks[task_id] = {
        "status": "pending", "total_files": 0, "processed": 0,
        "current_file": "", "converted": 0, "skipped": 0, "errors": 0,
    }

    background_tasks.add_task(
        _run_cache_convert, task_id, ticker.upper(), archive_root, cache_root,
    )

    return {"task_id": task_id}


@router.get("/cache")
async def list_cache_endpoint():
    base = _browse_base()
    entries = list_cache(str(base))
    total_size = sum(e["size_bytes"] for e in entries)
    return {"cache": entries, "total_size_bytes": total_size}


@router.delete("/cache/{ticker}", dependencies=[Depends(require_admin)])
async def clear_cache_ticker(ticker: str):
    base = _browse_base()
    ok = clear_cache(str(base), ticker)
    if not ok:
        raise HTTPException(status_code=404, detail="Ticker not found in cache")
    return {"success": True}


@router.delete("/cache", dependencies=[Depends(require_admin)])
async def clear_all_cache():
    base = _browse_base()
    entries = list_cache(str(base))
    for e in entries:
        clear_cache(str(base), e["ticker"])
    return {"success": True}

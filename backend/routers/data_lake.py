import json
import logging
import os
from datetime import datetime, timezone
from pathlib import Path
from typing import Any, Dict, List, Optional

from fastapi import APIRouter, Depends, HTTPException, Query
from pydantic import BaseModel

import database
from auth_jwt import require_admin
from credential_utils import encrypt_credential, mask_credential
from data_sources.converter import convert_theta_data
from data_sources.ingester import scan_catalog, remove_from_catalog
from data_sources.manager import DataSourceManager

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/api/data-lake", tags=["data-lake"])


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
    job = await DataSourceManager.get_job_status(job_id)
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
async def convert_data(req: ConvertRequest):
    try:
        full_path = (_BROWSE_BASE / req.source_path).resolve()
        full_path.relative_to(_BROWSE_BASE)  # safety check
        stats = convert_theta_data(
            source_path=str(full_path),
            instrument_id_template=req.instrument_id_template,
            instrument_filter=req.instrument_filter,
        )
        return {"success": True, "stats": stats}
    except Exception as e:
        raise HTTPException(status_code=400, detail=str(e))


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

_BROWSE_BASE = Path(os.getenv("NAUTILUS_CATALOG_PATH", "./data_lake")).resolve()


@router.get("/browse")
async def browse_folder(path: str = Query("", alias="path")):
    """
    List subdirectories and parquet files at the given path relative to the
    catalog root.  Returns the directory tree for the folder browser UI.
    """

    # Resolve the requested path, ensuring it stays within the base
    try:
        resolved = (_BROWSE_BASE / path).resolve()
        resolved.relative_to(_BROWSE_BASE)
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
                subdirs.append({"name": entry.name, "path": str(entry.relative_to(_BROWSE_BASE))})
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
        if parent != _BROWSE_BASE:
            parent_path = str(parent.relative_to(_BROWSE_BASE))
    except ValueError:
        parent_path = ""

    # Count total parquet files recursively in this directory
    total_parquet = sum(1 for _ in resolved.rglob("*.parquet"))

    return {
        "current_path": str(resolved.relative_to(_BROWSE_BASE)) if resolved != _BROWSE_BASE else "",
        "subdirectories": subdirs,
        "parquet_files": parquet_files,
        "parquet_count": parquet_count,
        "total_parquet_recursive": total_parquet,
        "parent_path": parent_path,
    }

@router.post("/import", dependencies=[Depends(require_admin)])
async def import_existing_data(req: ConvertRequest):
    try:
        full_path = (_BROWSE_BASE / req.source_path).resolve()
        full_path.relative_to(_BROWSE_BASE)
        stats = convert_theta_data(
            source_path=str(full_path),
            instrument_id_template=req.instrument_id_template,
            instrument_filter=req.instrument_filter,
        )
        return {"success": True, "stats": stats}
    except Exception as e:
        raise HTTPException(status_code=400, detail=str(e))

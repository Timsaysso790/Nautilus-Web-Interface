"""
Router for the Backtest Station project/template management and Options Station execution.
"""

import json
import logging
import uuid
from datetime import datetime, timezone
from typing import Any, Dict, List, Optional

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel, Field

import database as db
import backtest_project_service as bps
import backtest_engine as engine
from auth_jwt import get_current_user

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/api/backtest", tags=["backtest-projects"])

_backtest_lock = False


# ── Pydantic schemas ──────────────────────────────────────────────────────────

class CreateProjectRequest(BaseModel):
    name: str = Field(..., min_length=1, max_length=200)


class SaveTemplateRequest(BaseModel):
    name: str = Field(..., min_length=1, max_length=200)
    config: Dict[str, Any]


# ── Project CRUD ──────────────────────────────────────────────────────────────

@router.get("/projects")
async def list_projects(_user: dict = Depends(get_current_user)):
    async with db._execute_async("SELECT id, name, created_at, updated_at, config_count FROM backtest_projects ORDER BY updated_at DESC") as cur:
        rows = cur.fetchall()
    return {
        "projects": [
            {
                "id": r[0],
                "name": r[1],
                "created_at": r[2],
                "updated_at": r[3],
                "config_count": r[4],
            }
            for r in rows
        ]
    }


@router.post("/projects")
async def create_project(request: CreateProjectRequest, _user: dict = Depends(get_current_user)):
    project_id = f"PRJ-{uuid.uuid4().hex[:8].upper()}"
    now = datetime.now(timezone.utc).isoformat()
    try:
        async with db._execute_async(
            "INSERT INTO backtest_projects (id, name, created_at, updated_at) VALUES (?, ?, ?, ?)",
            (project_id, request.name, now, now),
            commit=True,
        ):
            pass
    except Exception as e:
        raise HTTPException(status_code=409, detail=f"Project creation failed: {str(e)}")

    bps.create_project_folder(project_id)

    return {
        "project": {
            "id": project_id,
            "name": request.name,
            "created_at": now,
            "updated_at": now,
            "config_count": 0,
        }
    }


@router.delete("/projects/{project_id}")
async def delete_project(project_id: str, _user: dict = Depends(get_current_user)):
    async with db._execute_async(
        "DELETE FROM backtest_projects WHERE id = ?", (project_id,), commit=True
    ) as cur:
        deleted = cur.rowcount > 0
    if not deleted:
        raise HTTPException(status_code=404, detail="Project not found")
    bps.delete_project_folder(project_id)
    return {"success": True}


# ── Template CRUD ─────────────────────────────────────────────────────────────

@router.get("/templates")
async def list_templates(_user: dict = Depends(get_current_user)):
    async with db._execute_async(
        "SELECT id, name, config, created_at FROM backtest_templates ORDER BY created_at DESC"
    ) as cur:
        rows = cur.fetchall()
    return {
        "templates": [
            {
                "id": r[0],
                "name": r[1],
                "config": json.loads(r[2]) if isinstance(r[2], str) else r[2],
                "created_at": r[3],
            }
            for r in rows
        ]
    }


@router.post("/templates")
async def save_template(request: SaveTemplateRequest, _user: dict = Depends(get_current_user)):
    template_id = f"TPL-{uuid.uuid4().hex[:8].upper()}"
    now = datetime.now(timezone.utc).isoformat()
    async with db._execute_async(
        "INSERT INTO backtest_templates (id, name, config, created_at) VALUES (?, ?, ?, ?)",
        (template_id, request.name, json.dumps(request.config), now),
        commit=True,
    ):
        pass
    return {
        "template": {
            "id": template_id,
            "name": request.name,
            "config": request.config,
            "created_at": now,
        }
    }


@router.delete("/templates/{template_id}")
async def delete_template(template_id: str, _user: dict = Depends(get_current_user)):
    async with db._execute_async(
        "DELETE FROM backtest_templates WHERE id = ?", (template_id,), commit=True
    ) as cur:
        deleted = cur.rowcount > 0
    if not deleted:
        raise HTTPException(status_code=404, detail="Template not found")
    return {"success": True}


# ── Project File Management ────────────────────────────────────────────────────

@router.get("/projects/{project_id}")
async def get_project(project_id: str, _user: dict = Depends(get_current_user)):
    async with db._execute_async(
        "SELECT id, name, created_at, updated_at, config_count FROM backtest_projects WHERE id = ?",
        (project_id,),
    ) as cur:
        row = cur.fetchone()
    if not row:
        raise HTTPException(status_code=404, detail="Project not found")
    files = bps.list_project_files(project_id)
    return {
        "project": {
            "id": row[0],
            "name": row[1],
            "created_at": row[2],
            "updated_at": row[3],
            "config_count": row[4],
            "files": files,
        }
    }


@router.get("/projects/{project_id}/files")
async def list_project_files(project_id: str, _user: dict = Depends(get_current_user)):
    files = bps.list_project_files(project_id)
    return {"files": files}


@router.get("/projects/{project_id}/files/{file_id}")
async def get_project_file(project_id: str, file_id: str, _user: dict = Depends(get_current_user)):
    data = bps.load_project_file(project_id, file_id)
    if data is None:
        raise HTTPException(status_code=404, detail="File not found")
    return data


@router.delete("/projects/{project_id}/files/{file_id}")
async def delete_project_file(project_id: str, file_id: str, _user: dict = Depends(get_current_user)):
    deleted = bps.delete_project_file(project_id, file_id)
    if not deleted:
        raise HTTPException(status_code=404, detail="File not found")
    return {"success": True}


# ── Options Station Execution ─────────────────────────────────────────────────

@router.post("/options-station/run")
async def run_options_station(config: Dict[str, Any], _user: dict = Depends(get_current_user)):
    global _backtest_lock
    if _backtest_lock:
        raise HTTPException(status_code=409, detail="A backtest is already running. Please wait.")
    _backtest_lock = True
    try:
        result = await engine.run_options_station(config)
        if not result.get("success"):
            raise HTTPException(status_code=400, detail=result.get("error", "Backtest failed"))

        # Save result to project folder if projectId is present
        project_id = config.get("projectId", "")
        if project_id:
            try:
                bps.save_project_result(project_id, f"result-{uuid.uuid4().hex[:8]}", result)
            except Exception as e:
                logger.warning(f"Failed to save result for project {project_id}: {e}")

        return result
    except HTTPException:
        raise
    except Exception as e:
        logger.exception("Options Station backtest error")
        raise HTTPException(status_code=500, detail=str(e))
    finally:
        _backtest_lock = False

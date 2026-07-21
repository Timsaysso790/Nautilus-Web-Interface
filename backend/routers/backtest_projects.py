"""
Router for the Backtest Station project/template management and Options Station execution.
"""

import asyncio
import json
import logging
import uuid
from datetime import datetime, timezone
from typing import Any, Dict, Optional

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel, Field

import database as db
import backtest_project_service as bps
import backtest_engine as engine
from auth_jwt import get_current_user

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/api/backtest", tags=["backtest-projects"])

_backtest_lock = asyncio.Lock()


# ── Pydantic schemas ──────────────────────────────────────────────────────────

class CreateProjectRequest(BaseModel):
    name: str = Field(..., min_length=1, max_length=200)
    type: str = Field("options", pattern=r"^(options|portfolio)$")


class SaveTemplateRequest(BaseModel):
    name: str = Field(..., min_length=1, max_length=200)
    config: Dict[str, Any]


class ProjectConfigRequest(BaseModel):
    config_id: str = Field(..., min_length=1, max_length=200, pattern=r"^[a-zA-Z0-9_-]+$")
    config: Dict[str, Any]


# ── Helpers ───────────────────────────────────────────────────────────────────

async def _project_exists(project_id: str) -> bool:
    async with db._execute_async(
        "SELECT 1 FROM backtest_projects WHERE id = ?", (project_id,)
    ) as cur:
        return await cur.fetchone() is not None


async def _require_project(project_id: str) -> None:
    if not await _project_exists(project_id):
        raise HTTPException(status_code=404, detail="Project not found")


async def _get_project_slug(project_id: str) -> str:
    async with db._execute_async(
        "SELECT project_slug FROM backtest_projects WHERE id = ?", (project_id,)
    ) as cur:
        row = await cur.fetchone()
    if not row:
        raise HTTPException(status_code=404, detail="Project not found")
    return row[0] or project_id  # fallback to project_id for legacy rows


async def _generate_unique_slug(name: str) -> str:
    base = bps.slugify(name)
    slug = base
    counter = 2
    while True:
        try:
            async with db._execute_async(
                "SELECT 1 FROM backtest_projects WHERE project_slug = ?", (slug,)
            ) as cur:
                exists = await cur.fetchone() is not None
        except Exception:
            exists = False
        if not exists:
            return slug
        slug = f"{base}-{counter}"
        counter += 1


# ── Project CRUD ──────────────────────────────────────────────────────────────

@router.get("/projects")
async def list_projects(_user: dict = Depends(get_current_user)):
    async with db._execute_async(
        "SELECT id, name, project_type, project_slug, created_at, updated_at, config_count FROM backtest_projects ORDER BY updated_at DESC"
    ) as cur:
        rows = await cur.fetchall()
    return {
        "projects": [
            {
                "id": r[0],
                "name": r[1],
                "project_type": r[2],
                "project_slug": r[3],
                "created_at": r[4],
                "updated_at": r[5],
                "config_count": r[6],
            }
            for r in rows
        ]
    }


@router.post("/projects")
async def create_project(request: CreateProjectRequest, _user: dict = Depends(get_current_user)):
    project_id = f"PRJ-{uuid.uuid4().hex[:8].upper()}"
    slug = await _generate_unique_slug(request.name)
    now = datetime.now(timezone.utc).isoformat()
    try:
        async with db._execute_async(
            "INSERT INTO backtest_projects (id, name, project_type, project_slug, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?)",
            (project_id, request.name, request.type, slug, now, now),
            commit=True,
        ):
            pass
    except Exception as e:
        raise HTTPException(status_code=409, detail=f"Project creation failed: {str(e)}")

    bps.create_project_folder(slug)

    initial_config = {"type": request.type, "name": request.name, "slug": slug, "created_at": now}
    try:
        bps.save_primary_config(slug, initial_config)
    except Exception as e:
        logger.warning(f"Failed to save initial config for project {project_id}: {e}")

    async with db._execute_async(
        "UPDATE backtest_projects SET config_count = config_count + 1, updated_at = ? WHERE id = ?",
        (now, project_id),
        commit=True,
    ):
        pass

    return {
        "project": {
            "id": project_id,
            "name": request.name,
            "project_type": request.type,
            "project_slug": slug,
            "created_at": now,
            "updated_at": now,
            "config_count": 1,
        }
    }


@router.delete("/projects/{project_id}")
async def delete_project(project_id: str, _user: dict = Depends(get_current_user)):
    slug = await _get_project_slug(project_id)
    async with db._execute_async(
        "DELETE FROM backtest_projects WHERE id = ?", (project_id,), commit=True
    ) as cur:
        await cur.execute("SELECT changes()")
        deleted = (await cur.fetchone())[0] > 0
    if not deleted:
        raise HTTPException(status_code=404, detail="Project not found")
    bps.delete_project_folder(slug)
    return {"success": True}


# ── Template CRUD ─────────────────────────────────────────────────────────────

@router.get("/templates")
async def list_templates(_user: dict = Depends(get_current_user)):
    async with db._execute_async(
        "SELECT id, name, config, created_at FROM backtest_templates ORDER BY created_at DESC"
    ) as cur:
        rows = await cur.fetchall()
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
        await cur.execute("SELECT changes()")
        deleted = (await cur.fetchone())[0] > 0
    if not deleted:
        raise HTTPException(status_code=404, detail="Template not found")
    return {"success": True}


# ── Project File Management ────────────────────────────────────────────────────

@router.get("/projects/{project_id}")
async def get_project(project_id: str, _user: dict = Depends(get_current_user)):
    await _require_project(project_id)
    slug = await _get_project_slug(project_id)
    async with db._execute_async(
        "SELECT id, name, project_type, project_slug, created_at, updated_at, config_count FROM backtest_projects WHERE id = ?",
        (project_id,),
    ) as cur:
        row = await cur.fetchone()
    files = bps.list_project_files(slug)
    return {
        "project": {
            "id": row[0],
            "name": row[1],
            "project_type": row[2],
            "project_slug": row[3],
            "created_at": row[4],
            "updated_at": row[5],
            "config_count": row[6],
            "files": files,
        }
    }


@router.get("/projects/{project_id}/files")
async def list_project_files(project_id: str, _user: dict = Depends(get_current_user)):
    await _require_project(project_id)
    slug = await _get_project_slug(project_id)
    files = bps.list_project_files(slug)
    return {"files": files}


@router.get("/projects/{project_id}/files/{file_id}")
async def get_project_file(project_id: str, file_id: str, _user: dict = Depends(get_current_user)):
    await _require_project(project_id)
    slug = await _get_project_slug(project_id)
    data = bps.load_project_file(slug, file_id)
    if data is None:
        raise HTTPException(status_code=404, detail="File not found")
    return data


@router.delete("/projects/{project_id}/files/{file_id}")
async def delete_project_file(project_id: str, file_id: str, _user: dict = Depends(get_current_user)):
    await _require_project(project_id)
    slug = await _get_project_slug(project_id)
    deleted = bps.delete_project_file(slug, file_id)
    if not deleted:
        raise HTTPException(status_code=404, detail="File not found")
    now = datetime.now(timezone.utc).isoformat()
    async with db._execute_async(
        "UPDATE backtest_projects SET config_count = MAX(0, config_count - 1), updated_at = ? WHERE id = ?",
        (now, project_id),
        commit=True,
    ):
        pass
    return {"success": True}


@router.post("/projects/{project_id}/config")
async def save_project_config(
    project_id: str,
    request: ProjectConfigRequest,
    _user: dict = Depends(get_current_user),
):
    """Save a configuration to a project's filesystem folder."""
    await _require_project(project_id)
    slug = await _get_project_slug(project_id)
    try:
        bps.save_project_config(slug, request.config_id, request.config)
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Failed to save config: {str(e)}")
    now = datetime.now(timezone.utc).isoformat()
    async with db._execute_async(
        "UPDATE backtest_projects SET config_count = config_count + 1, updated_at = ? WHERE id = ?",
        (now, project_id),
        commit=True,
    ):
        pass
    return {"success": True, "config_id": request.config_id}


@router.post("/projects/{project_id}/config/primary")
async def save_primary_config(
    project_id: str,
    config: Dict[str, Any],
    _user: dict = Depends(get_current_user),
):
    """Save the primary config.json for a project."""
    await _require_project(project_id)
    slug = await _get_project_slug(project_id)
    try:
        bps.save_primary_config(slug, config)
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Failed to save primary config: {str(e)}")
    now = datetime.now(timezone.utc).isoformat()
    async with db._execute_async(
        "UPDATE backtest_projects SET config_count = config_count + 1, updated_at = ? WHERE id = ?",
        (now, project_id),
        commit=True,
    ):
        pass
    return {"success": True}


@router.get("/projects/{project_id}/config/{config_id}")
async def load_project_config(
    project_id: str,
    config_id: str,
    _user: dict = Depends(get_current_user),
):
    """Load a configuration from a project's filesystem folder."""
    await _require_project(project_id)
    slug = await _get_project_slug(project_id)
    data = bps.load_project_config(slug, config_id)
    if data is None:
        raise HTTPException(status_code=404, detail="Config not found")
    return {"config": data, "config_id": config_id}


# ── Options Station Execution ─────────────────────────────────────────────────

@router.post("/options-station/run")
async def run_options_station(config: Dict[str, Any], _user: dict = Depends(get_current_user)):
    async with _backtest_lock:
        try:
            result = await engine.run_options_station(config)
            if not result.get("success"):
                raise HTTPException(status_code=400, detail=result.get("error", "Backtest failed"))

            project_id = config.get("projectId", "")
            if project_id:
                try:
                    slug = await _get_project_slug(project_id)
                    bps.save_result(slug, result)
                except Exception as e:
                    logger.warning(f"Failed to save result for project {project_id}: {e}")

            return result
        except HTTPException:
            raise
        except Exception as e:
            logger.exception("Options Station backtest error")
            raise HTTPException(status_code=500, detail=str(e))

"""
NVMe filesystem management for backtest project workspaces.
Each project gets its own subdirectory under the projects root.
"""

import json
import logging
import re
import shutil
from pathlib import Path
from typing import Any, Dict, Optional

logger = logging.getLogger(__name__)

PROJECTS_ROOT = Path(__file__).parent / "data" / "backtest_projects"

_ID_PATTERN = re.compile(r"^[a-zA-Z0-9_-]+$")


def _sanitize_id(name: str, label: str) -> str:
    """Validate and sanitize a project/config/file ID. Raises ValueError if invalid."""
    if not name:
        raise ValueError(f"{label} must not be empty")
    if not _ID_PATTERN.match(name):
        raise ValueError(
            f"{label} '{name}' contains invalid characters. "
            f"Only letters, digits, hyphens, and underscores are allowed."
        )
    return name


def _ensure_project_dir(project_id: str) -> Path:
    """Create the project directory if it doesn't exist. project_id must be pre-sanitized."""
    PROJECTS_ROOT.mkdir(parents=True, exist_ok=True)
    pdir = PROJECTS_ROOT / project_id
    pdir.mkdir(parents=True, exist_ok=True)
    return pdir


def create_project_folder(project_id: str) -> Path:
    _sanitize_id(project_id, "project_id")
    return _ensure_project_dir(project_id)


def delete_project_folder(project_id: str) -> None:
    _sanitize_id(project_id, "project_id")
    pdir = PROJECTS_ROOT / project_id
    if pdir.exists():
        shutil.rmtree(pdir)


def save_project_config(project_id: str, config_id: str, config: Dict[str, Any]) -> Path:
    _sanitize_id(project_id, "project_id")
    _sanitize_id(config_id, "config_id")
    pdir = _ensure_project_dir(project_id)
    fpath = pdir / f"{config_id}.json"
    try:
        with open(fpath, "w") as f:
            json.dump(config, f, indent=2)
    except OSError as e:
        logger.error(f"Failed to write config {config_id} for project {project_id}: {e}")
        raise
    return fpath


def load_project_config(project_id: str, config_id: str) -> Optional[Dict[str, Any]]:
    _sanitize_id(project_id, "project_id")
    _sanitize_id(config_id, "config_id")
    fpath = PROJECTS_ROOT / project_id / f"{config_id}.json"
    if not fpath.exists():
        return None
    try:
        with open(fpath) as f:
            return json.load(f)
    except (json.JSONDecodeError, OSError) as e:
        logger.warning(f"Failed to read config {config_id} for project {project_id}: {e}")
        return None


def list_project_configs(project_id: str) -> list[Dict[str, Any]]:
    _sanitize_id(project_id, "project_id")
    pdir = PROJECTS_ROOT / project_id
    if not pdir.exists():
        return []
    configs = []
    for f in pdir.glob("*.json"):
        try:
            with open(f) as fh:
                data = json.load(fh)
            data["_file"] = f.name
            configs.append(data)
        except (json.JSONDecodeError, OSError):
            continue
    return configs


def save_project_result(project_id: str, result_id: str, result: Dict[str, Any]) -> Path:
    _sanitize_id(project_id, "project_id")
    _sanitize_id(result_id, "result_id")
    pdir = _ensure_project_dir(project_id)
    fpath = pdir / f"{result_id}.json"
    try:
        with open(fpath, "w") as f:
            json.dump(result, f, indent=2)
    except OSError as e:
        logger.error(f"Failed to write result {result_id} for project {project_id}: {e}")
        raise
    return fpath


def load_project_file(project_id: str, file_id: str) -> Optional[Dict[str, Any]]:
    _sanitize_id(project_id, "project_id")
    _sanitize_id(file_id, "file_id")
    fpath = PROJECTS_ROOT / project_id / f"{file_id}.json"
    if not fpath.exists():
        return None
    try:
        with open(fpath) as f:
            return json.load(f)
    except (json.JSONDecodeError, OSError) as e:
        logger.warning(f"Failed to read file {file_id} for project {project_id}: {e}")
        return None


def list_project_files(project_id: str) -> list[Dict[str, Any]]:
    """List all JSON files in a project folder with type info."""
    _sanitize_id(project_id, "project_id")
    pdir = PROJECTS_ROOT / project_id
    if not pdir.exists():
        return []
    files = []
    for f in sorted(pdir.glob("*.json"), reverse=True):
        try:
            with open(f) as fh:
                data = json.load(fh)
            key = f.stem
            data["_file"] = f.name
            data["_file_type"] = "result" if key.startswith("result-") else "config"
            files.append(data)
        except (json.JSONDecodeError, OSError):
            continue
    return files


def delete_project_file(project_id: str, file_id: str) -> bool:
    _sanitize_id(project_id, "project_id")
    _sanitize_id(file_id, "file_id")
    fpath = PROJECTS_ROOT / project_id / f"{file_id}.json"
    if not fpath.exists():
        return False
    try:
        fpath.unlink()
    except OSError as e:
        logger.error(f"Failed to delete file {file_id} for project {project_id}: {e}")
        return False
    return True

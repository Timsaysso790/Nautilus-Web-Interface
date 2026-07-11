"""
NVMe filesystem management for backtest project workspaces.
Each project gets its own subdirectory under the projects root.
"""

import json
import os
import shutil
from datetime import datetime, timezone
from pathlib import Path
from typing import Any, Dict, Optional

PROJECTS_ROOT = Path(__file__).parent / "data" / "backtest_projects"


def _ensure_project_dir(project_id: str) -> Path:
    """Create the NVMe directory for a project if it doesn't exist."""
    PROJECTS_ROOT.mkdir(parents=True, exist_ok=True)
    pdir = PROJECTS_ROOT / project_id
    pdir.mkdir(parents=True, exist_ok=True)
    return pdir


def create_project_folder(project_id: str) -> Path:
    return _ensure_project_dir(project_id)


def delete_project_folder(project_id: str) -> None:
    pdir = PROJECTS_ROOT / project_id
    if pdir.exists():
        shutil.rmtree(pdir)


def save_project_config(project_id: str, config_id: str, config: Dict[str, Any]) -> Path:
    pdir = _ensure_project_dir(project_id)
    fpath = pdir / f"{config_id}.json"
    with open(fpath, "w") as f:
        json.dump(config, f, indent=2)
    return fpath


def load_project_config(project_id: str, config_id: str) -> Optional[Dict[str, Any]]:
    fpath = PROJECTS_ROOT / project_id / f"{config_id}.json"
    if not fpath.exists():
        return None
    with open(fpath) as f:
        return json.load(f)


def list_project_configs(project_id: str) -> list[Dict[str, Any]]:
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
        except (json.JSONDecodeError, IOError):
            continue
    return configs


def save_project_result(project_id: str, result_id: str, result: Dict[str, Any]) -> Path:
    pdir = _ensure_project_dir(project_id)
    fpath = pdir / f"{result_id}.json"
    with open(fpath, "w") as f:
        json.dump(result, f, indent=2)
    return fpath


def load_project_file(project_id: str, file_id: str) -> Optional[Dict[str, Any]]:
    fpath = PROJECTS_ROOT / project_id / f"{file_id}.json"
    if not fpath.exists():
        return None
    with open(fpath) as f:
        return json.load(f)


def list_project_files(project_id: str) -> list[Dict[str, Any]]:
    """List all JSON files in a project folder with type info."""
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
        except (json.JSONDecodeError, IOError):
            continue
    return files


def delete_project_file(project_id: str, file_id: str) -> bool:
    fpath = PROJECTS_ROOT / project_id / f"{file_id}.json"
    if not fpath.exists():
        return False
    fpath.unlink()
    return True

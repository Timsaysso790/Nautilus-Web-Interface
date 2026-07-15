"""
NVMe filesystem management for backtest project workspaces.
Each project gets a slug-named subdirectory under PROJECTS_ROOT (default: /app/data/projects).
"""

import json
import logging
import re
import shutil
import uuid
from pathlib import Path
from typing import Any, Dict, Optional

logger = logging.getLogger(__name__)

PROJECTS_ROOT = Path(os.getenv("PROJECTS_ROOT", "/app/data/projects"))

_SLUG_PATTERN = re.compile(r"^[a-zA-Z0-9_-]+$")


def slugify(name: str) -> str:
    """Convert a project name to a clean URL-safe slug."""
    slug = name.lower().strip()
    slug = re.sub(r"[^a-z0-9\s-]", "", slug)
    slug = re.sub(r"[\s-]+", "-", slug)
    slug = slug.strip("-")
    return slug or "untitled"


def _sanitize_slug(slug: str, label: str) -> str:
    """Validate a slug. Raises ValueError if invalid."""
    if not slug:
        raise ValueError(f"{label} must not be empty")
    if not _SLUG_PATTERN.match(slug):
        raise ValueError(
            f"{label} '{slug}' contains invalid characters. "
            f"Only letters, digits, hyphens, and underscores are allowed."
        )
    return slug


def _ensure_project_dir(slug: str) -> Path:
    """Create the project directory and results/ subdir if they don't exist."""
    PROJECTS_ROOT.mkdir(parents=True, exist_ok=True)
    pdir = PROJECTS_ROOT / slug
    pdir.mkdir(parents=True, exist_ok=True)
    (pdir / "results").mkdir(parents=True, exist_ok=True)
    return pdir


def create_project_folder(slug: str) -> Path:
    _sanitize_slug(slug, "project_slug")
    return _ensure_project_dir(slug)


def delete_project_folder(slug: str) -> None:
    _sanitize_slug(slug, "project_slug")
    pdir = PROJECTS_ROOT / slug
    if pdir.exists():
        shutil.rmtree(pdir)


# ── Primary config (config.json) ───────────────────────────────────────────────

def save_primary_config(slug: str, config: Dict[str, Any]) -> Path:
    """Save the primary project config as config.json."""
    _sanitize_slug(slug, "project_slug")
    pdir = _ensure_project_dir(slug)
    fpath = pdir / "config.json"
    try:
        with open(fpath, "w") as f:
            json.dump(config, f, indent=2)
    except OSError as e:
        logger.error(f"Failed to write config.json for project {slug}: {e}")
        raise
    return fpath


def load_primary_config(slug: str) -> Optional[Dict[str, Any]]:
    """Load the primary project config from config.json."""
    _sanitize_slug(slug, "project_slug")
    fpath = PROJECTS_ROOT / slug / "config.json"
    if not fpath.exists():
        return None
    try:
        with open(fpath) as f:
            return json.load(f)
    except (json.JSONDecodeError, OSError) as e:
        logger.warning(f"Failed to read config.json for project {slug}: {e}")
        return None


# ── Named configs (snapshots, templates) ───────────────────────────────────────

def save_project_config(slug: str, config_id: str, config: Dict[str, Any]) -> Path:
    """Save a named config file within the project folder."""
    _sanitize_slug(slug, "project_slug")
    _sanitize_slug(config_id, "config_id")
    pdir = _ensure_project_dir(slug)
    fpath = pdir / f"{config_id}.json"
    try:
        with open(fpath, "w") as f:
            json.dump(config, f, indent=2)
    except OSError as e:
        logger.error(f"Failed to write config {config_id} for project {slug}: {e}")
        raise
    return fpath


def load_project_config(slug: str, config_id: str) -> Optional[Dict[str, Any]]:
    _sanitize_slug(slug, "project_slug")
    _sanitize_slug(config_id, "config_id")
    fpath = PROJECTS_ROOT / slug / f"{config_id}.json"
    if not fpath.exists():
        return None
    try:
        with open(fpath) as f:
            return json.load(f)
    except (json.JSONDecodeError, OSError) as e:
        logger.warning(f"Failed to read config {config_id} for project {slug}: {e}")
        return None


def list_project_configs(slug: str) -> list[Dict[str, Any]]:
    _sanitize_slug(slug, "project_slug")
    pdir = PROJECTS_ROOT / slug
    if not pdir.exists():
        return []
    configs = []
    for f in pdir.glob("*.json"):
        if f.name.startswith("result-") or f.parent.name == "results":
            continue
        try:
            with open(f) as fh:
                data = json.load(fh)
            data["_file"] = f.name
            configs.append(data)
        except (json.JSONDecodeError, OSError):
            continue
    return configs


# ── Results ────────────────────────────────────────────────────────────────────

def save_result(slug: str, result: Dict[str, Any]) -> Path:
    """Save a backtest result into the results/ sub-directory as a sequenced JSON file."""
    _sanitize_slug(slug, "project_slug")
    pdir = _ensure_project_dir(slug)
    results_dir = pdir / "results"

    # Determine next sequence number
    existing = sorted(results_dir.glob("result-*.json"))
    seq = 1
    if existing:
        last_seq = 0
        for f in existing:
            try:
                num = int(f.stem.split("-")[-1])
                if num > last_seq:
                    last_seq = num
            except (ValueError, IndexError):
                continue
        seq = last_seq + 1

    fpath = results_dir / f"result-{seq:04d}.json"
    try:
        with open(fpath, "w") as f:
            json.dump(result, f, indent=2)
    except OSError as e:
        logger.error(f"Failed to write result for project {slug}: {e}")
        raise
    return fpath


def load_result(slug: str, seq: int) -> Optional[Dict[str, Any]]:
    _sanitize_slug(slug, "project_slug")
    fpath = PROJECTS_ROOT / slug / "results" / f"result-{seq:04d}.json"
    if not fpath.exists():
        return None
    try:
        with open(fpath) as f:
            return json.load(f)
    except (json.JSONDecodeError, OSError) as e:
        logger.warning(f"Failed to read result-{seq} for project {slug}: {e}")
        return None


# ── Generic file operations ────────────────────────────────────────────────────

def load_project_file(slug: str, file_id: str) -> Optional[Dict[str, Any]]:
    """Load a file by its stem — checks root then results/."""
    _sanitize_slug(slug, "project_slug")
    _sanitize_slug(file_id, "file_id")
    # Try root
    fpath = PROJECTS_ROOT / slug / f"{file_id}.json"
    if fpath.exists():
        try:
            with open(fpath) as f:
                return json.load(f)
        except (json.JSONDecodeError, OSError) as e:
            logger.warning(f"Failed to read file {file_id} for project {slug}: {e}")
            return None
    # Try results/
    fpath = PROJECTS_ROOT / slug / "results" / f"{file_id}.json"
    if fpath.exists():
        try:
            with open(fpath) as f:
                return json.load(f)
        except (json.JSONDecodeError, OSError) as e:
            logger.warning(f"Failed to read result file {file_id} for project {slug}: {e}")
            return None
    return None


def list_project_files(slug: str) -> list[Dict[str, Any]]:
    """List all JSON files in a project folder with type info."""
    _sanitize_slug(slug, "project_slug")
    pdir = PROJECTS_ROOT / slug
    if not pdir.exists():
        return []
    files = []

    # Root-level JSONs
    for f in sorted(pdir.glob("*.json"), reverse=True):
        try:
            with open(f) as fh:
                data = json.load(fh)
            key = f.stem
            data["_file"] = f.name
            data["_file_type"] = "config" if not key.startswith("result-") else "result"
            files.append(data)
        except (json.JSONDecodeError, OSError):
            continue

    # Results subfolder
    results_dir = pdir / "results"
    if results_dir.exists():
        for f in sorted(results_dir.glob("*.json"), reverse=True):
            try:
                with open(f) as fh:
                    data = json.load(fh)
                data["_file"] = f.name
                data["_file_type"] = "result"
                files.append(data)
            except (json.JSONDecodeError, OSError):
                continue

    return files


def delete_project_file(slug: str, file_id: str) -> bool:
    """Delete a file by its stem — checks root then results/."""
    _sanitize_slug(slug, "project_slug")
    _sanitize_slug(file_id, "file_id")
    # Try root
    fpath = PROJECTS_ROOT / slug / f"{file_id}.json"
    if fpath.exists():
        try:
            fpath.unlink()
            return True
        except OSError as e:
            logger.error(f"Failed to delete file {file_id} for project {slug}: {e}")
            return False
    # Try results/
    fpath = PROJECTS_ROOT / slug / "results" / f"{file_id}.json"
    if fpath.exists():
        try:
            fpath.unlink()
            return True
        except OSError as e:
            logger.error(f"Failed to delete result file {file_id} for project {slug}: {e}")
            return False
    return False

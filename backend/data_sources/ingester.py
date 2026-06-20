import logging
import os
from pathlib import Path
from typing import Any, Dict, List, Optional

logger = logging.getLogger(__name__)

NAUTILUS_CATALOG_PATH = Path(os.getenv("NAUTILUS_CATALOG_PATH", "./data_lake"))


def scan_catalog() -> Dict[str, Any]:
    """
    Walk the ParquetDataCatalog directory and return a summary of contents.

    Returns:
      {
        "instruments": [
          {"type": "bar", "id": "SPY...OPRA", "files": [...], "total_rows": N, "size_bytes": N}
        ],
        "total_size_bytes": N,
        "total_instruments": N,
      }
    """
    data_dir = NAUTILUS_CATALOG_PATH / "data"
    if not data_dir.exists():
        return {"instruments": [], "total_size_bytes": 0, "total_instruments": 0}

    instruments = []
    total_size = 0

    for data_type_dir in sorted(data_dir.iterdir()):
        if not data_type_dir.is_dir():
            continue
        data_type = data_type_dir.name

        for instr_dir in sorted(data_type_dir.iterdir()):
            if not instr_dir.is_dir():
                continue

            files = []
            for f in sorted(instr_dir.glob("*.parquet")):
                files.append({
                    "name": f.name,
                    "size_bytes": f.stat().st_size,
                })
                total_size += f.stat().st_size

            if files:
                instruments.append({
                    "type": data_type,
                    "id": instr_dir.name,
                    "files": files,
                    "total_files": len(files),
                    "total_size_bytes": sum(f["size_bytes"] for f in files),
                })

    return {
        "instruments": instruments,
        "total_size_bytes": total_size,
        "total_instruments": len(instruments),
    }


def remove_from_catalog(data_type: str, instrument_id: str) -> bool:
    """
    Remove all parquet files for a given instrument from the catalog.
    Returns True if anything was removed.
    """
    instr_dir = NAUTILUS_CATALOG_PATH / "data" / data_type / instrument_id
    if not instr_dir.exists():
        return False

    import shutil
    shutil.rmtree(instr_dir)
    logger.info("Removed %s/%s from catalog", data_type, instrument_id)
    return True

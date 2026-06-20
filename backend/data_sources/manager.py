import asyncio
import json
import logging
import os
import uuid
from datetime import datetime, timezone
from pathlib import Path
from typing import Any, Dict, List, Optional

import database
from data_sources.base import DataSource
from data_sources.theta_data import ThetaDataSource
from data_sources.yahoo_finance import YahooFinanceSource
from data_sources.fred import FREDSource

logger = logging.getLogger(__name__)

RAW_DOWNLOAD_DIR = Path(os.getenv("NAUTILUS_CATALOG_PATH", "./data_lake")) / "raw"


class DataSourceManager:
    _instances: Dict[str, DataSource] = {}

    @classmethod
    def get_source(cls, source_type: str) -> DataSource:
        if source_type not in cls._instances:
            if source_type == "thetadata":
                cls._instances[source_type] = ThetaDataSource()
            elif source_type == "yahoo_finance":
                cls._instances[source_type] = YahooFinanceSource()
            elif source_type == "fred":
                cls._instances[source_type] = FREDSource()
            else:
                raise ValueError(f"Unknown source type: {source_type}")
        return cls._instances[source_type]

    @classmethod
    async def get_decrypted_api_key(cls, source_id: str) -> Optional[str]:
        from credential_utils import decrypt_credential
        source = await database.get_data_source(source_id)
        if not source or not source.get("api_key_encrypted"):
            return None
        return decrypt_credential(source["api_key_encrypted"])

    @classmethod
    async def start_download_job(cls, job_id: str) -> None:
        job = await database.get_download_job(job_id)
        if not job:
            logger.error("Job %s not found", job_id)
            return

        try:
            await database.update_download_job(job_id, status="downloading", progress=0.0)

            source_type = job["source_type"]
            source = cls.get_source(source_type)
            config = json.loads(job["config"])

            api_key = None
            if job.get("source_id"):
                api_key = await cls.get_decrypted_api_key(job["source_id"])
                if api_key:
                    config["api_key"] = api_key

            raw_dir = RAW_DOWNLOAD_DIR / job_id
            raw_dir.mkdir(parents=True, exist_ok=True)
            config["output_dir"] = str(raw_dir)

            async def report(progress: float, message: str):
                await database.update_download_job(job_id, progress=progress)
                logger.info("[%s] %.0f%% – %s", job_id, progress * 100, message)

            result_path = await source.download(config, progress=report)

            await database.update_download_job(
                job_id,
                status="completed",
                progress=1.0,
                download_path=result_path,
            )
            logger.info("Job %s completed: %s", job_id, result_path)

        except Exception as e:
            logger.exception("Job %s failed", job_id)
            await database.update_download_job(
                job_id,
                status="failed",
                error=str(e),
            )

    @classmethod
    async def create_and_run_job(
        cls,
        source_id: Optional[str],
        source_type: str,
        config: dict,
    ) -> Dict[str, Any]:
        job_id = f"DL-{uuid.uuid4().hex[:8].upper()}"
        job = await database.create_download_job(
            id=job_id,
            source_id=source_id,
            source_type=source_type,
            config=config,
        )
        asyncio.create_task(cls.start_download_job(job_id))
        return job

    @classmethod
    async def get_job_status(cls, job_id: str) -> Optional[Dict[str, Any]]:
        return await database.get_download_job(job_id)

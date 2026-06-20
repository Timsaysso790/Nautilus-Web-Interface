import logging
import os
from datetime import datetime, timezone
from typing import Any, Callable, Coroutine, Dict, List, Optional

import pandas as pd

from data_sources.base import DataSource

logger = logging.getLogger(__name__)


class FREDSource(DataSource):
    @property
    def source_type(self) -> str:
        return "fred"

    async def validate_connection(self, api_key: str, **kwargs) -> bool:
        if not api_key:
            return False
        try:
            from fredapi import Fred
            Fred(api_key=api_key)
            return True
        except Exception:
            return False

    async def list_symbols(self, query: str, **kwargs) -> List[str]:
        return []

    async def download(
        self,
        config: dict,
        progress: Callable[[float, str], Coroutine],
        **kwargs,
    ) -> str:
        from fredapi import Fred

        api_key = config.get("api_key") or os.getenv("FRED_API_KEY", "")
        if not api_key:
            raise ValueError("FRED API key not configured")

        series_ids: List[str] = config.get("symbols", ["DFF", "DGS10", "DGS2", "SP500"])
        start_date = config.get("start_date", "2010-01-01")
        end_date = config.get("end_date", datetime.now(timezone.utc).strftime("%Y-%m-%d"))
        output_dir = config.get("output_dir", "/tmp/fred_download")

        os.makedirs(output_dir, exist_ok=True)

        fred = Fred(api_key=api_key)
        total = len(series_ids)

        for i, sid in enumerate(series_ids):
            pct = i / total if total > 0 else 0
            await progress(pct, f"Downloading FRED series {sid}...")

            series = fred.get_series(sid, observation_start=start_date, observation_end=end_date)
            if series is not None and not series.empty:
                df = pd.DataFrame({
                    "date": series.index,
                    "value": series.values,
                    "series_id": sid,
                })
                out_path = os.path.join(output_dir, f"{sid}.parquet")
                df.to_parquet(out_path, index=False)
                logger.info("Saved %s – %d rows", out_path, len(df))

        await progress(1.0, "FRED download complete")
        return output_dir

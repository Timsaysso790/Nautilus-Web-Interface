import logging
import os
from datetime import datetime, timezone
from typing import Any, Callable, Coroutine, Dict, List, Optional

from data_sources.base import DataSource

logger = logging.getLogger(__name__)

THETA_TIERS = {
    "free": {
        "max_resolution": "day",
        "max_history": "2023-06-01",
        "max_concurrent": 1,
        "has_greeks": False,
        "delay": "1d",
    },
    "value": {
        "max_resolution": "1_minute",
        "max_history": "2020-01-01",
        "max_concurrent": 2,
        "has_greeks": True,
        "delay": "15min",
    },
    "standard": {
        "max_resolution": "5_minute",
        "max_history": "2016-01-01",
        "max_concurrent": 4,
        "has_greeks": True,
        "delay": "realtime",
    },
    "pro": {
        "max_resolution": "tick",
        "max_history": "2012-06-01",
        "max_concurrent": 8,
        "has_greeks": True,
        "delay": "realtime",
    },
}


class ThetaDataSource(DataSource):
    @property
    def source_type(self) -> str:
        return "thetadata"

    async def validate_connection(self, api_key: str, **kwargs) -> bool:
        if not api_key:
            return False
        try:
            from thetadata import ThetaClient
            client = ThetaClient(api_key=api_key)
            async with client:
                return True
        except Exception:
            return False

    async def list_symbols(self, query: str, **kwargs) -> List[str]:
        return []

    def _get_tier_config(self, config: dict) -> dict:
        tier = config.get("tier", "free").lower()
        return THETA_TIERS.get(tier, THETA_TIERS["free"])

    async def download(
        self,
        config: dict,
        progress: Callable[[float, str], Coroutine],
        **kwargs,
    ) -> str:
        import pandas as pd
        from thetadata import ThetaClient, SecType, DateRange, OptionRight, DataType

        api_key = config.get("api_key") or os.getenv("THETADATA_API_KEY", "")
        if not api_key:
            raise ValueError("ThetaData API key not configured")

        tier_cfg = self._get_tier_config(config)
        symbols: List[str] = config.get("symbols", [])
        start_date = config.get("start_date", tier_cfg["max_history"])
        end_date = config.get("end_date", datetime.now(timezone.utc).strftime("%Y-%m-%d"))
        resolution = config.get("resolution", "day")
        output_dir = config.get("output_dir", "/tmp/theta_download")

        os.makedirs(output_dir, exist_ok=True)

        client = ThetaClient(api_key=api_key)
        async with client:
            total = len(symbols)
            for i, symbol in enumerate(symbols):
                pct = i / total if total > 0 else 0
                await progress(pct, f"Downloading {symbol}...")

                df = await client.get_hist_option(
                    root=symbol,
                    date_range=DateRange(start_date, end_date),
                    sec_type=SecType.OPTION,
                )

                if df is not None and not df.empty:
                    out_path = os.path.join(output_dir, f"{symbol}.parquet")
                    df.to_parquet(out_path, index=False)
                    logger.info("Saved %s – %d rows", out_path, len(df))

            await progress(1.0, "ThetaData download complete")

        return output_dir

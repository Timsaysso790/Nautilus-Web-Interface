import logging
import os
from datetime import datetime, timezone
from typing import Any, Callable, Coroutine, Dict, List, Optional

from data_sources.base import DataSource

logger = logging.getLogger(__name__)


class YahooFinanceSource(DataSource):
    @property
    def source_type(self) -> str:
        return "yahoo_finance"

    async def validate_connection(self, api_key: str, **kwargs) -> bool:
        return True

    async def list_symbols(self, query: str, **kwargs) -> List[str]:
        return []

    async def download(
        self,
        config: dict,
        progress: Callable[[float, str], Coroutine],
        **kwargs,
    ) -> str:
        import yfinance as yf
        import pandas as pd

        symbols: List[str] = config.get("symbols", [])
        start_date = config.get("start_date", "2020-01-01")
        end_date = config.get("end_date", datetime.now(timezone.utc).strftime("%Y-%m-%d"))
        resolution = config.get("resolution", "1d")
        output_dir = config.get("output_dir", "/tmp/yahoo_download")

        os.makedirs(output_dir, exist_ok=True)

        interval_map = {"day": "1d", "1_minute": "1m", "5_minute": "5m"}
        interval = interval_map.get(resolution, "1d")

        total = len(symbols)
        for i, symbol in enumerate(symbols):
            pct = i / total if total > 0 else 0
            await progress(pct, f"Downloading {symbol}...")

            ticker = yf.Ticker(symbol)
            df = ticker.history(start=start_date, end=end_date, interval=interval)

            if df is not None and not df.empty:
                df.reset_index(inplace=True)
                out_path = os.path.join(output_dir, f"{symbol}.parquet")
                df.to_parquet(out_path, index=False)
                logger.info("Saved %s – %d rows", out_path, len(df))

        await progress(1.0, "Yahoo Finance download complete")
        return output_dir

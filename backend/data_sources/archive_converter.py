"""
archive_converter.py — reads float64+zstd parquet archive (theta/{TICKER}/)
and writes Nautilus-compatible catalog under nautilus_cache/{TICKER}/data/
via ParquetDataCatalog.write_data().
"""

import logging
from datetime import datetime, timezone
from pathlib import Path
from typing import Any, Callable, Dict, List, Optional

import pandas as pd
import pyarrow.parquet as pq

logger = logging.getLogger(__name__)


def _ts_nanos(dt) -> int:
    if isinstance(dt, (int, float)):
        return int(dt * 1_000_000_000)
    return int(dt.timestamp() * 1_000_000_000)


def _instrument_id(symbol: str, expiration: str = "", strike: float = 0.0, right: str = "") -> str:
    if expiration and strike and right:
        raw = f"{symbol}{expiration.replace('-', '')}{right}{int(strike * 1000):08d}"
        return f"{raw}.OPRA"
    return f"{symbol}.XNAS"


def convert_ticker(
    ticker: str,
    archive_root: str,
    cache_root: str,
    progress_callback: Optional[Callable] = None,
) -> Dict[str, Any]:
    """
    Convert one ticker from the float64 archive (theta/{TICKER}) into
    the Nautilus cache (nautilus_cache/{TICKER}/data/).

    Returns stats dict.
    """
    stats: Dict[str, Any] = {"converted": 0, "skipped": 0, "errors": 0}
    archive = Path(archive_root) / "theta" / ticker.upper()
    if not archive.exists():
        stats["errors"] = 1
        return stats

    try:
        from nautilus_trader.persistence.catalog import ParquetDataCatalog
    except ImportError:
        logger.error("nautilus_trader not available — cannot convert")
        stats["errors"] = 1
        return stats

    cache_path = Path(cache_root) / "nautilus_cache" / ticker.upper()
    cache_path.mkdir(parents=True, exist_ok=True)
    catalog = ParquetDataCatalog(str(cache_path))

    # Convert 5-min bars
    bars_dir = archive / "5min"
    if bars_dir.exists():
        bar_files = sorted(bars_dir.rglob("*.parquet"))
        for fpath in bar_files:
            try:
                df = pd.read_parquet(fpath)
                if df.empty:
                    stats["skipped"] += 1
                    continue

                bars = []
                for _, row in df.iterrows():
                    from nautilus_trader.model.data import Bar
                    from nautilus_trader.model.identifiers import InstrumentId, Venue
                    from nautilus_trader.model.objects import Price, Quantity
                    from nautilus_trader.model.enums import BarAggregation, PriceType

                    iid = InstrumentId.from_str(f"{row['symbol']}.XNAS")
                    ts = _ts_nanos(row.get("ts_event", 0))
                    bar = Bar(
                        instrument_id=iid,
                        open=Price.from_str(str(row["open"])),
                        high=Price.from_str(str(row["high"])),
                        low=Price.from_str(str(row["low"])),
                        close=Price.from_str(str(row["close"])),
                        volume=Quantity.from_str(str(row["volume"])),
                        ts_event=ts,
                        ts_init=ts,
                        bar_spec=Bar.BarSpec(
                            step=5,
                            aggregation=BarAggregation.MINUTE,
                            price_type=PriceType.LAST,
                        ),
                    )
                    bars.append(bar)

                if bars:
                    catalog.write_data(bars)
                    stats["converted"] += len(bars)
            except Exception as e:
                logger.exception("Error converting bars %s: %s", fpath, e)
                stats["errors"] += 1

        if progress_callback:
            progress_callback(f"Converted bars for {ticker}", stats["converted"], stats["converted"], stats["skipped"], stats["errors"], len(bar_files))

    # Convert option Greeks EOD
    greeks_dir = archive / "option_greeks_eod"
    if greeks_dir.exists():
        greek_files = sorted(greeks_dir.rglob("*.parquet"))
        for fpath in greek_files:
            try:
                df = pd.read_parquet(fpath)
                if df.empty:
                    stats["skipped"] += 1
                    continue

                records = []
                for _, row in df.iterrows():
                    from nautilus_trader.model.data import OptionGreeks, OptionContract
                    from nautilus_trader.model.identifiers import InstrumentId, Venue
                    from nautilus_trader.model.objects import Price
                    from nautilus_trader.model.enums import OptionKind, OptionActivation

                    iid = InstrumentId.from_str(_instrument_id(
                        row.get("symbol", ticker),
                        row.get("expiration", ""),
                        float(row.get("strike", 0)),
                        row.get("right", ""),
                    ))
                    ts = _ts_nanos(row.get("ts_event", 0))

                    option_kind = OptionKind.CALL if str(row.get("right", "")).upper() == "C" else OptionKind.PUT

                    greeks = OptionGreeks(
                        instrument_id=iid,
                        convention=OptionActivation.NORMAL,  # approximate
                        delta=float(row.get("delta", 0)),
                        gamma=float(row.get("gamma", 0)),
                        theta=float(row.get("theta", 0)),
                        vega=float(row.get("vega", 0)),
                        rho=float(row.get("rho", 0)),
                        mark_iv=float(row.get("implied_vol", 0)),
                        underlying_price=Price.from_str(str(row.get("underlying_price", 0))),
                        ts_event=ts,
                        ts_init=ts,
                        kind=option_kind,
                    )
                    records.append(greeks)

                if records:
                    catalog.write_data(records)
                    stats["converted"] += len(records)
            except Exception as e:
                logger.exception("Error converting Greeks %s: %s", fpath, e)
                stats["errors"] += 1

        if progress_callback:
            progress_callback(f"Converted Greeks for {ticker}", stats["converted"], stats["converted"], stats["skipped"], stats["errors"], len(greek_files))

    return stats


def list_cache(cache_root: str) -> List[Dict[str, Any]]:
    cache = Path(cache_root) / "nautilus_cache"
    if not cache.exists():
        return []
    entries = []
    for d in sorted(cache.iterdir()):
        if not d.is_dir():
            continue
        total_size = sum(f.stat().st_size for f in d.rglob("*") if f.is_file())
        entries.append({
            "ticker": d.name,
            "size_bytes": total_size,
        })
    return entries


def clear_cache(cache_root: str, ticker: str) -> bool:
    cache = Path(cache_root) / "nautilus_cache" / ticker.upper()
    if cache.exists():
        import shutil
        shutil.rmtree(cache)
        return True
    return False

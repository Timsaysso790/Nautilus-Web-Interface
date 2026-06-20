import logging
import os
from datetime import datetime, timezone
from decimal import Decimal
from pathlib import Path
from typing import Any, Callable, Dict, List, Optional

import pandas as pd
import pyarrow as pa
import pyarrow.parquet as pq

logger = logging.getLogger(__name__)

NAUTILUS_CATALOG_PATH = Path(os.getenv("NAUTILUS_CATALOG_PATH", "./data_lake"))


def _price_to_bytes(price: float, precision: int = 9) -> bytes:
    scaled = int(round(price * (10 ** precision)))
    return scaled.to_bytes(16, "little", signed=True)


def _ts_to_nanos(dt) -> int:
    if isinstance(dt, (int, float)):
        return int(dt * 1_000_000_000)
    return int(dt.timestamp() * 1_000_000_000)


def _urisafe(iid: str) -> str:
    return iid.replace("/", "-")


def _timestamp_to_filename(ts_ns: int) -> str:
    dt = datetime.fromtimestamp(ts_ns / 1e9, tz=timezone.utc)
    s = dt.isoformat().replace("+00:00", "Z")
    return s.replace(":", "-").replace(".", "-")


def convert_theta_data(
    source_path: str,
    target_type: str = "bar",
    instrument_id_template: Optional[str] = None,
    instrument_filter: Optional[str] = None,
    progress_callback: Optional[Callable[[str, int, int, int, int, int], None]] = None,
) -> Dict[str, Any]:
    """
    Convert ThetaData-format parquet files (38-col with OHLCV + greeks) into
    Nautilus-compatible catalog format.

    For each symbol file in source_path, writes:
      data/bar/{instrument_id}/{ts_range}.parquet
      data/option_greeks/{instrument_id}/{ts_range}.parquet
      data/quote_tick/{instrument_id}/{ts_range}.parquet

    If instrument_filter is set (e.g. "SPY"), only files whose symbol matches
    are processed.
    """
    src = Path(source_path)
    if not src.is_dir():
        raise NotADirectoryError(f"Source path must be a directory: {source_path}")

    bar_dir = NAUTILUS_CATALOG_PATH / "data" / "bar"
    greeks_dir = NAUTILUS_CATALOG_PATH / "data" / "option_greeks"
    quote_dir = NAUTILUS_CATALOG_PATH / "data" / "quote_tick"

    stats = {"converted": 0, "skipped": 0, "errors": 0}
    all_files = sorted(src.rglob("*.parquet"))

    for idx, fpath in enumerate(all_files):
        try:
            df = pd.read_parquet(fpath)
            if df.empty:
                stats["skipped"] += 1
                continue

            if "root" in df.columns:
                symbol = str(df["root"].iloc[0])
            elif "symbol" in df.columns:
                symbol = str(df["symbol"].iloc[0])
            else:
                symbol = src.name
            expiry = str(df["expiration"].iloc[0]) if "expiration" in df.columns else ""
            strike = df["strike_price"].iloc[0] if "strike_price" in df.columns else 0.0
            right = df["right"].iloc[0] if "right" in df.columns else ""

            # Skip if instrument filter is set and symbol doesn't match
            if instrument_filter and instrument_filter.upper() != str(symbol).upper():
                stats["skipped"] += 1
                continue

            if expiry and strike and right:
                raw_sym = f"{symbol}{expiry}{right}{int(strike*1000):08d}"
                iid = f"{raw_sym}.OPRA"
            else:
                iid = f"{symbol}.XNAS"

            df["datetime"] = pd.to_datetime(df["date"].astype(str), format="%Y%m%d") + \
                pd.to_timedelta(df.get("ms_cst", 0), unit="ms")

            # ---- Bar data ----
            if all(c in df.columns for c in ["open", "high", "low", "close", "volume"]):
                bar_df = df[["datetime", "open", "high", "low", "close", "volume"]].copy()
                bar_df = bar_df[bar_df["close"] > 0]
                if not bar_df.empty:
                    _write_bars(bar_dir, iid, bar_df)

            # ---- Greeks ----
            greek_cols = [
                "datetime", "implied_volatility", "delta", "gamma", "theta", "vega",
                "rho", "vanna", "charm", "vomma", "veta", "speed", "zomma", "color",
                "ultima", "d1", "d2", "dual_delta", "dual_gamma", "epsilon", "lambda",
                "underlying_price",
            ]
            existing_greeks = [c for c in greek_cols if c in df.columns]
            if len(existing_greeks) > 2:
                greeks_df = df[existing_greeks].copy()
                if not greeks_df.empty:
                    _write_greeks(greeks_dir, iid, greeks_df)

            # ---- Quote data ----
            if all(c in df.columns for c in ["bid", "ask"]):
                quote_df = df[["datetime", "bid", "ask"]].copy()
                quote_df = quote_df[(quote_df["bid"] > 0) & (quote_df["ask"] > 0)]
                if not quote_df.empty:
                    _write_quotes(quote_dir, iid, quote_df)

            stats["converted"] += 1
            logger.info("Converted %s -> %s (%d rows)", fpath.name, iid, len(df))

        except Exception as e:
            logger.exception("Error converting %s: %s", fpath, e)
            stats["errors"] += 1

        if progress_callback:
            progress_callback(str(fpath), idx, stats["converted"], stats["skipped"], stats["errors"], len(all_files))

    return stats


def _write_bars(base_dir: Path, iid: str, df: pd.DataFrame):
    subdir = base_dir / _urisafe(iid)
    subdir.mkdir(parents=True, exist_ok=True)

    ts = df["datetime"].apply(lambda x: _ts_to_nanos(x))
    ts_min, ts_max = ts.min(), ts.max()

    schema = pa.schema([
        ("open", pa.binary(16)), ("high", pa.binary(16)), ("low", pa.binary(16)),
        ("close", pa.binary(16)), ("volume", pa.binary(16)),
        ("ts_event", pa.uint64()), ("ts_init", pa.uint64()),
    ])

    arrays = [
        pa.array(df["open"].apply(lambda x: _price_to_bytes(x)).tolist(), type=pa.binary(16)),
        pa.array(df["high"].apply(lambda x: _price_to_bytes(x)).tolist(), type=pa.binary(16)),
        pa.array(df["low"].apply(lambda x: _price_to_bytes(x)).tolist(), type=pa.binary(16)),
        pa.array(df["close"].apply(lambda x: _price_to_bytes(x)).tolist(), type=pa.binary(16)),
        pa.array(df["volume"].apply(lambda x: _price_to_bytes(float(x), 0)).tolist(), type=pa.binary(16)),
        pa.array(ts.tolist(), type=pa.uint64()),
        pa.array(ts.tolist(), type=pa.uint64()),
    ]

    table = pa.Table.from_arrays(arrays, schema=schema)
    meta = {"bar_type": f"{iid}-5-MINUTE-LAST-EXTERNAL", "price_precision": "9", "size_precision": "0"}
    table = table.replace_schema_metadata(meta)

    fname = f"{_timestamp_to_filename(ts_min)}_{_timestamp_to_filename(ts_max)}.parquet"
    pq.write_table(table, subdir / fname)


def _write_greeks(base_dir: Path, iid: str, df: pd.DataFrame):
    subdir = base_dir / _urisafe(iid)
    subdir.mkdir(parents=True, exist_ok=True)

    ts = df["datetime"].apply(lambda x: _ts_to_nanos(x))
    ts_min, ts_max = ts.min(), ts.max()

    fields = []
    arrays_list = []
    for col in df.columns:
        if col == "datetime":
            continue
        fields.append(pa.field(col, pa.float64()))
        arrays_list.append(pa.array(df[col].fillna(0.0).tolist(), type=pa.float64()))

    fields.append(pa.field("ts_event", pa.uint64()))
    fields.append(pa.field("ts_init", pa.uint64()))
    arrays_list.append(pa.array(ts.tolist(), type=pa.uint64()))
    arrays_list.append(pa.array(ts.tolist(), type=pa.uint64()))

    schema = pa.schema(fields)
    table = pa.Table.from_arrays(arrays_list, schema=schema)

    fname = f"{_timestamp_to_filename(ts_min)}_{_timestamp_to_filename(ts_max)}.parquet"
    pq.write_table(table, subdir / fname)


def _write_quotes(base_dir: Path, iid: str, df: pd.DataFrame):
    subdir = base_dir / _urisafe(iid)
    subdir.mkdir(parents=True, exist_ok=True)

    ts = df["datetime"].apply(lambda x: _ts_to_nanos(x))
    ts_min, ts_max = ts.min(), ts.max()

    schema = pa.schema([
        ("bid_price", pa.binary(16)), ("ask_price", pa.binary(16)),
        ("bid_size", pa.binary(16)), ("ask_size", pa.binary(16)),
        ("ts_event", pa.uint64()), ("ts_init", pa.uint64()),
    ])

    arrays = [
        pa.array(df["bid"].apply(lambda x: _price_to_bytes(x)).tolist(), type=pa.binary(16)),
        pa.array(df["ask"].apply(lambda x: _price_to_bytes(x)).tolist(), type=pa.binary(16)),
        pa.array([_price_to_bytes(100, 0)] * len(df), type=pa.binary(16)),
        pa.array([_price_to_bytes(100, 0)] * len(df), type=pa.binary(16)),
        pa.array(ts.tolist(), type=pa.uint64()),
        pa.array(ts.tolist(), type=pa.uint64()),
    ]

    table = pa.Table.from_arrays(arrays, schema=schema)
    meta = {"instrument_id": iid, "price_precision": "9", "size_precision": "0"}
    table = table.replace_schema_metadata(meta)

    fname = f"{_timestamp_to_filename(ts_min)}_{_timestamp_to_filename(ts_max)}.parquet"
    pq.write_table(table, subdir / fname)

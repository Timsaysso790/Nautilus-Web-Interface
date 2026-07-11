"""
Valuation Clearance — BB/RSI macro dip detection + Time-Machine forward value formula.
"""

import logging
from datetime import datetime, timedelta
from typing import Any, Dict, List, Optional

import pandas as pd

import data_loader

logger = logging.getLogger(__name__)

MACRO_SYMBOLS = ["QQQ", "IWM"]


def compute_rsi(prices: pd.Series, period: int = 14) -> float:
    if len(prices) < period + 1:
        return 50.0
    deltas = prices.diff().iloc[1:]
    gains = deltas.clip(lower=0)
    losses = -deltas.clip(upper=0)
    avg_gain = gains.rolling(period).mean().iloc[-1]
    avg_loss = losses.rolling(period).mean().iloc[-1]
    if avg_loss == 0:
        return 100.0
    rs = avg_gain / avg_loss
    return 100.0 - (100.0 / (1.0 + rs))


def compute_bb(
    prices: pd.Series,
    period: int = 20,
    std_dev: float = 2.0,
) -> dict:
    """Return (upper, middle, lower) BB values and position 0..1."""
    if len(prices) < period:
        sma = float(prices.iloc[-1])
        std = 0.0
    else:
        sma = float(prices.rolling(period).mean().iloc[-1])
        std = float(prices.rolling(period).std().iloc[-1])
    current = float(prices.iloc[-1])
    upper = sma + std_dev * std
    lower = sma - std_dev * std
    spread = upper - lower
    position = (current - lower) / spread if spread > 0 else 0.5
    return {
        "upper": round(upper, 2),
        "middle": round(sma, 2),
        "lower": round(lower, 2),
        "position": round(position, 3),
        "pierced_lower": current <= lower,
    }


def compute_macro_indicators(
    qqq_prices: pd.Series,
    iwm_prices: pd.Series,
    bb_period: int = 20,
    bb_std: float = 2.0,
    rsi_period: int = 14,
    rsi_threshold: float = 40.0,
) -> dict:
    """
    Returns clearance state and indicator values for QQQ and IWM.
    Clearance = True if EITHER symbol pierces lower BB OR RSI <= threshold.
    """
    qqq_bb = compute_bb(qqq_prices, bb_period, bb_std)
    iwm_bb = compute_bb(iwm_prices, bb_period, bb_std)
    qqq_rsi = compute_rsi(qqq_prices, rsi_period)
    iwm_rsi = compute_rsi(iwm_prices, rsi_period)

    qqq_clear = qqq_bb["pierced_lower"] or qqq_rsi <= rsi_threshold
    iwm_clear = iwm_bb["pierced_lower"] or iwm_rsi <= rsi_threshold

    return {
        "clearance_active": qqq_clear or iwm_clear,
        "qqq": {
            "close": round(float(qqq_prices.iloc[-1]), 2),
            "rsi": round(qqq_rsi, 2),
            "bb": qqq_bb,
        },
        "iwm": {
            "close": round(float(iwm_prices.iloc[-1]), 2),
            "rsi": round(iwm_rsi, 2),
            "bb": iwm_bb,
        },
    }


def compute_time_machine(
    current_nav: float,
    projected_dividends_3m: float,
    projected_paychecks_3m: float,
) -> dict:
    """
    Time-Machine formula: FutureNAV = NAV + projectedDividends3m + projectedPaychecks3m.
    """
    future_nav = current_nav + projected_dividends_3m + projected_paychecks_3m
    front_load_capacity = max(0.0, future_nav - current_nav)
    return {
        "current_nav": round(current_nav, 2),
        "future_nav": round(future_nav, 2),
        "projected_dividends_3m": round(projected_dividends_3m, 2),
        "projected_paychecks_3m": round(projected_paychecks_3m, 2),
        "front_load_capacity": round(front_load_capacity, 2),
    }


async def load_macro_data(
    start: str,
    end: str,
    symbols: Optional[List[str]] = None,
) -> Dict[str, pd.DataFrame]:
    """Load daily OHLCV data for macro symbols from the theta archive."""
    if symbols is None:
        symbols = MACRO_SYMBOLS
    result: Dict[str, pd.DataFrame] = {}
    for sym in symbols:
        try:
            result[sym] = data_loader.load_daily_prices(sym, start, end)
        except FileNotFoundError:
            logger.warning("No archive data for macro symbol %s", sym)
            result[sym] = pd.DataFrame()
    return result

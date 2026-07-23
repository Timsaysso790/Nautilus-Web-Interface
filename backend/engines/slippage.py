"""
Slippage models for options backtesting.
"""
import random
from typing import Tuple


def apply_slippage(
    mid_price: float,
    model: str = "mid",
    slippage_pct: float = 0.1,
    bid: float = 0,
    ask: float = 0,
    is_entry: bool = True,
) -> float:
    """
    Apply a slippage model to a fill price.

    Models:
    - "mid": No slippage, use mid price (baseline).
    - "spread_pct": Penalize by `slippage_pct`% of estimated spread.
    - "aggressive": Fill at the less favorable side of the spread.
    - "random": Random fill within [bid, ask] (for Monte Carlo style runs).

    Returns the adjusted fill price.
    """
    if model == "mid" or mid_price <= 0:
        return mid_price

    spread = abs(ask - bid) if ask > 0 and bid > 0 else mid_price * 0.02  # est 2% spread if unknown

    if model == "spread_pct":
        penalty = spread * (slippage_pct / 100)
        if is_entry:
            # Pay more to enter
            return mid_price + penalty
        else:
            # Receive less to exit
            return mid_price - penalty

    elif model == "aggressive":
        if ask > 0 and bid > 0:
            return ask if is_entry else bid
        return mid_price * (1 + (0.01 * slippage_pct)) if is_entry else mid_price * (1 - (0.01 * slippage_pct))

    elif model == "random":
        if ask > 0 and bid > 0:
            return random.uniform(bid, ask)
        return mid_price

    return mid_price


def estimate_spread(mid_price: float, iv: float, days_to_expiry: int) -> float:
    """
    Rough bid-ask spread estimator based on volatility and time.
    Higher IV and shorter DTE → wider spreads.
    """
    if mid_price <= 0:
        return 0.0
    base_spread = mid_price * 0.02  # 2% minimum
    vol_factor = min(iv * 10, 0.5)  # up to 50% for high IV
    dte_factor = max(1, min(30 / max(days_to_expiry, 1), 3))  # 1x-3x for short DTE
    return round(mid_price * (base_spread + vol_factor) * dte_factor, 2)

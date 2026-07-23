"""
Margin interest calculation engine for portfolio backtesting.
Supports daily accrual with 360-day year, interest-free buffers, and tiered rates.
"""
from typing import List, Optional, Tuple


def daily_margin_interest(
    margin_balance: float,
    annual_rate: float = 0.065,
    interest_free_buffer: float = 1000.0,
    day_count_convention: int = 360,
) -> float:
    """
    Calculate daily margin interest accrual.

    Parameters:
    - margin_balance: Current outstanding margin debt.
    - annual_rate: Annual margin interest rate (e.g., 0.065 = 6.5%).
    - interest_free_buffer: First $X of borrowed capital is interest-free.
    - day_count_convention: 360 (standard brokerage) or 365.

    Returns:
    - Daily interest charge (positive = cost).
    """
    if margin_balance <= 0:
        return 0.0

    net_balance = max(0.0, margin_balance - interest_free_buffer)
    if net_balance <= 0:
        return 0.0

    return net_balance * (annual_rate / day_count_convention)


def tiered_margin_interest(
    margin_balance: float,
    tiers: List[Tuple[float, float]],
    interest_free_buffer: float = 1000.0,
    day_count_convention: int = 360,
) -> float:
    """
    Calculate daily margin interest with tiered rates.

    tiers: List of (balance_threshold, annual_rate) sorted ascending.
    E.g., [(25000, 0.08), (100000, 0.065), (float('inf'), 0.055)]
    means:
      - First $25k borrowed at 8%
      - $25k-$100k at 6.5%
      - Over $100k at 5.5%

    Returns total daily interest.
    """
    if margin_balance <= 0:
        return 0.0

    net_balance = max(0.0, margin_balance - interest_free_buffer)
    if net_balance <= 0:
        return 0.0

    total_interest = 0.0
    remaining = net_balance
    prev_threshold = 0.0

    for threshold, rate in tiers:
        if remaining <= 0:
            break
        bracket = min(remaining, threshold - prev_threshold)
        if bracket > 0:
            total_interest += bracket * (rate / day_count_convention)
            remaining -= bracket
        prev_threshold = threshold

    return total_interest


def maintenance_margin_requirement(
    portfolio_long_value: float,
    equity_value: float,
    requirement_pct: float = 0.25,
) -> Tuple[float, bool]:
    """
    Calculate maintenance margin requirement and check for margin call.

    Parameters:
    - portfolio_long_value: Total market value of long positions.
    - equity_value: Net equity (portfolio value - margin debt).
    - requirement_pct: Maintenance requirement % (0.25 = 25% for most equities).

    Returns:
    - (mmr, margin_call) — MMR in dollars and whether equity falls below it.
    """
    mmr = portfolio_long_value * requirement_pct
    margin_call = equity_value < mmr
    return mmr, margin_call


def distance_to_margin_call(
    equity_value: float,
    portfolio_long_value: float,
    requirement_pct: float = 0.25,
) -> float:
    """
    Calculate the distance to a margin call as a percentage.
    Positive = safe, 0 = at threshold, negative = in call.
    """
    if portfolio_long_value <= 0:
        return 100.0  # no positions, can't have a margin call
    mmr = portfolio_long_value * requirement_pct
    if mmr <= 0:
        return 100.0
    return ((equity_value - mmr) / mmr) * 100

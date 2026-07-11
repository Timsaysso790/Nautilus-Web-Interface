"""
Margin Bridge — utilization calculator, freeze/thaw state machine, debt absorption loop.
"""

import logging
from dataclasses import dataclass, field
from datetime import date, datetime
from typing import Dict, List, Optional

logger = logging.getLogger(__name__)


@dataclass
class MarginState:
    utilization: float = 0.0
    is_frozen: bool = False
    freeze_start: Optional[str] = None
    thaw_days: int = 60
    total_assets: float = 0.0
    total_debt: float = 0.0
    extended_thaw: int = 0


@dataclass
class MarginHistoryEntry:
    date: str
    utilization: float
    is_frozen: bool
    debt: float


def compute_utilization(total_debt: float, total_asset_value: float) -> float:
    """Return utilization as a decimal (0..1)."""
    if total_asset_value <= 0:
        return 0.0
    return total_debt / total_asset_value


def compute_front_load_capacity(
    current_nav: float,
    projected_dividends_3m: float,
    projected_paychecks_3m: float,
    current_debt: float,
    debt_governor_pct: float,
    total_asset_value: float,
) -> float:
    """
    Time-Machine formula: FutureNAV = NAV + projectedDividends3m + projectedPaychecks3m.
    Front-load capacity = FutureNAV - NAV, capped by debt governor.
    Returns the maximum additional debt we can take on.
    """
    future_nav = current_nav + projected_dividends_3m + projected_paychecks_3m
    gross_capacity = future_nav - current_nav

    # Ensure new total debt doesn't exceed governor
    max_debt_allowed = total_asset_value * (debt_governor_pct / 100.0)
    governor_capacity = max(0.0, max_debt_allowed - current_debt)

    return max(0.0, min(gross_capacity, governor_capacity))


def process_debt_absorption(
    cash_inflow: float,
    margin_debt: float,
    is_frozen: bool,
) -> tuple[float, float]:
    """
    When frozen, cash inflow goes entirely to debt reduction first.
    Returns (new_margin_debt, remaining_cash).
    """
    if not is_frozen or cash_inflow <= 0:
        return margin_debt, cash_inflow

    if cash_inflow >= margin_debt:
        remaining = cash_inflow - margin_debt
        return 0.0, remaining
    else:
        return margin_debt - cash_inflow, 0.0


class MarginBridge:
    """Stateful margin bridge manager for one backtest run."""

    def __init__(
        self,
        debt_governor_pct: float = 20.0,
        freeze_days: int = 60,
        borrow_rate: float = 0.06,
    ):
        self.debt_governor_pct = debt_governor_pct
        self.freeze_days = freeze_days
        self.borrow_rate = borrow_rate
        self.state = MarginState()
        self.history: List[MarginHistoryEntry] = []

    def record_snapshot(self, bar_date: str) -> None:
        self.history.append(MarginHistoryEntry(
            date=bar_date,
            utilization=self.state.utilization,
            is_frozen=self.state.is_frozen,
            debt=self.state.total_debt,
        ))

    def get_summary_stats(self) -> dict:
        if not self.history:
            return {"max_utilization": 0.0, "avg_utilization": 0.0, "total_interest_paid": 0.0}
        utils = [h.utilization for h in self.history]
        return {
            "max_utilization": round(max(utils) * 100, 2),
            "avg_utilization": round((sum(utils) / len(utils)) * 100, 2),
            "total_interest_paid": 0.0,  # Computed externally per-bar
        }

    def check_and_update(
        self,
        total_asset_value: float,
        total_debt: float,
        cash: float,
        bar_date: str,
    ) -> dict:
        """
        Main per-bar tick. Updates utilization, checks freeze/thaw, processes debt absorption.
        Returns action log entries.
        """
        self.state.total_assets = total_asset_value
        self.state.total_debt = total_debt
        self.state.utilization = compute_utilization(total_debt, total_asset_value)

        actions: list = []
        util_pct = self.state.utilization * 100

        # ── Freeze check: exceeded governor? ──
        if not self.state.is_frozen and util_pct > self.debt_governor_pct:
            self.state.is_frozen = True
            self.state.freeze_start = bar_date
            self.state.thaw_days = self.freeze_days
            # Extend to 90 days if utilization > 30%
            if util_pct > 30.0:
                self.state.thaw_days = 90
            self.state.extended_thaw = 0
            actions.append({
                "date": bar_date,
                "type": "margin_freeze",
                "detail": f"Utilization {util_pct:.1f}% exceeded {self.debt_governor_pct}%. Frozen for {self.state.thaw_days} days.",
            })

        # ── Thaw check ──
        if self.state.is_frozen and self.state.freeze_start:
            freeze_start = datetime.strptime(self.state.freeze_start, "%Y-%m-%d").date()
            current = datetime.strptime(bar_date, "%Y-%m-%d").date()
            elapsed = (current - freeze_start).days
            if elapsed >= self.state.thaw_days and util_pct <= self.debt_governor_pct:
                self.state.is_frozen = False
                self.state.freeze_start = None
                actions.append({
                    "date": bar_date,
                    "type": "margin_thaw",
                    "detail": f"Utilization {util_pct:.1f}% below {self.debt_governor_pct}% after {elapsed} days.",
                })

        self.record_snapshot(bar_date)
        return {"actions": actions, "can_borrow": not self.state.is_frozen}

    def can_borrow_amount(self, amount: float, total_asset_value: float, current_debt: float) -> bool:
        """Check if borrowing `amount` would exceed the debt governor."""
        if self.state.is_frozen:
            return False
        new_debt = current_debt + amount
        new_util = compute_utilization(new_debt, total_asset_value + amount)
        return new_util <= (self.debt_governor_pct / 100.0)

    def compute_interest(self, debt: float, days: int) -> float:
        """Compute simple interest on margin debt over `days`."""
        return debt * (self.borrow_rate / 365.0) * days

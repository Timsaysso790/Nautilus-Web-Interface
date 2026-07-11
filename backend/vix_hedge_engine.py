"""
VIX Hedge Engine — Dual-ladder VIX ratio backspread framework
with systematic/opportunistic rolling and spike harvest capital routing.
"""

import logging
import math
from dataclasses import dataclass, field
from datetime import date, datetime
from typing import Any, Dict, List, Optional

import pandas as pd
import yfinance as yf

from option_service import calculate_bsm

logger = logging.getLogger(__name__)

VIX_DEFAULT = "^VIX"


@dataclass
class VixLadderState:
    """State for one ladder (45 DTE or 90 DTE)."""
    horizon_days: int
    entry_date: Optional[str] = None
    entry_vix: Optional[float] = None
    current_dte: int = 0
    status: str = "IDLE"  # IDLE | ACTIVE | ROLLING | HARVESTED
    pnl: float = 0.0
    position_value: float = 0.0
    last_roll_date: Optional[str] = None


@dataclass
class VixHistoryEntry:
    date: str
    ladder_dte: int
    status: str
    pnl: float


async def _vix_option_price(
    vix_price: float,
    strike: float,
    dte: int,
    right: str,
    iv: float = 0.80,
) -> float:
    """BSM price for a VIX option (uses high default IV for VIX)."""
    t = max(dte, 1) / 365.0
    result = await calculate_bsm(
        underlying_price=vix_price,
        strike=strike,
        time_to_expiry=t,
        risk_free_rate=0.05,
        volatility=iv,
        right=right,
    )
    return result["price"]


async def load_vix_data(start: str, end: str) -> pd.DataFrame:
    """Load ^VIX daily data via yfinance."""
    tk = yf.Ticker(VIX_DEFAULT)
    df = tk.history(start=start, end=end, interval="1d")
    if df.empty:
        return df
    df.reset_index(inplace=True)
    date_col = "Datetime" if "Datetime" in df.columns else "Date"
    df[date_col] = pd.to_datetime(df[date_col])
    df.rename(columns={date_col: "Date"}, inplace=True)
    return df


def compute_vix_ma(vix_prices: pd.Series, period: int = 20) -> float:
    """Simple moving average of VIX close prices."""
    if len(vix_prices) < period:
        return float(vix_prices.iloc[-1])
    return float(vix_prices.rolling(period).mean().iloc[-1])


class VixLadderManager:
    """Manages a single VIX ladder (one DTE horizon)."""

    def __init__(
        self,
        horizon_days: int,
        legs_config: List[dict],
        systematic_roll_threshold: int = 10,
        opportunistic_roll_vix_min: float = 18.0,
    ):
        self.horizon_days = horizon_days
        self.legs_config = legs_config
        self.systematic_roll_threshold = systematic_roll_threshold
        self.opportunistic_roll_vix_min = opportunistic_roll_vix_min
        self.state = VixLadderState(horizon_days=horizon_days)
        self.history: List[VixHistoryEntry] = []

    def _compute_position_value(self, vix_price: float, iv: float) -> float:
        """Compute net market value of all legs in this ladder."""
        total = 0.0
        dte = max(self.state.current_dte, 1)
        for leg in self.legs_config:
            price = 0.0
            # ATM strike: round to nearest 2.5
            if leg.get("strikeModel") == "atm":
                strike = round(vix_price / 2.5) * 2.5
            else:
                strike = leg.get("strikeValue", vix_price)
            # Price will be computed properly with async call later
            # For now use a simplified price
            intrinsic = max(0.0, (vix_price - strike) if leg.get("right") == "call" else (strike - vix_price))
            time_val = vix_price * iv * math.sqrt(dte / 365.0) * 0.3
            price = intrinsic + time_val
            mult = -1 if leg.get("action") == "buy" else 1
            total += price * abs(leg.get("quantity", 1)) * 100 * mult
        return total

    def check_roll(self, current_dte: int, vix_price: float, vix_ma: float) -> bool:
        """Decide whether to roll this ladder."""
        # Systematic: DTE fell below threshold
        if current_dte <= self.systematic_roll_threshold:
            return True
        # Opportunistic: VIX is low (below opportunistic threshold)
        if vix_price <= self.opportunistic_roll_vix_min:
            return True
        return False

    def check_spike_harvest(
        self,
        vix_price: float,
        vix_ma20: float,
        spike_multiplier: float,
    ) -> bool:
        """Check if VIX has spiked enough to harvest this ladder."""
        if vix_ma20 <= 0:
            return False
        return vix_price >= vix_ma20 * spike_multiplier

    async def roll(self, bar_date: str, vix_price: float, iv: float) -> dict:
        """Execute a roll: lock PnL, reset to fresh DTE."""
        old_pnl = self._compute_position_value(vix_price, iv)
        self.state.pnl += old_pnl
        self.state.entry_date = bar_date
        self.state.entry_vix = vix_price
        self.state.current_dte = self.horizon_days
        self.state.status = "ACTIVE"
        self.state.last_roll_date = bar_date
        self.state.position_value = 0.0  # Reset after roll

        entry = VixHistoryEntry(
            date=bar_date,
            ladder_dte=self.horizon_days,
            status="ROLLED",
            pnl=round(old_pnl, 2),
        )
        self.history.append(entry)

        return {
            "type": "vix_roll",
            "ladder_dte": self.horizon_days,
            "pnl_realized": round(old_pnl, 2),
            "new_entry_vix": vix_price,
            "date": bar_date,
        }

    async def harvest(self, bar_date: str, vix_price: float, iv: float) -> dict:
        """Close the ladder for a spike harvest."""
        old_pnl = self._compute_position_value(vix_price, iv)
        self.state.pnl += old_pnl
        self.state.status = "HARVESTED"
        self.state.position_value = 0.0

        entry = VixHistoryEntry(
            date=bar_date,
            ladder_dte=self.horizon_days,
            status="HARVESTED",
            pnl=round(old_pnl, 2),
        )
        self.history.append(entry)

        return {
            "type": "vix_harvest",
            "ladder_dte": self.horizon_days,
            "pnl_realized": round(old_pnl, 2),
            "cash_released": round(abs(old_pnl), 2),
            "date": bar_date,
        }

    def reenter(self, bar_date: str, vix_price: float) -> dict:
        """Re-enter after harvest when VIX has normalized."""
        self.state.status = "ACTIVE"
        self.state.entry_date = bar_date
        self.state.entry_vix = vix_price
        self.state.current_dte = self.horizon_days

        entry = VixHistoryEntry(
            date=bar_date,
            ladder_dte=self.horizon_days,
            status="REENTERED",
            pnl=0.0,
        )
        self.history.append(entry)

        return {
            "type": "vix_reentry",
            "ladder_dte": self.horizon_days,
            "date": bar_date,
        }


class VixHedgeOrchestrator:
    """Manages dual VIX ladders (45 DTE and 90 DTE)."""

    def __init__(
        self,
        ladder45_config: List[dict],
        ladder90_config: List[dict],
        systematic_roll_threshold: int = 10,
        opportunistic_roll_vix_min: float = 18.0,
        spike_multiplier: float = 3.0,
        vix_ma_period: int = 20,
        reentry_vix_threshold: float = 20.0,
    ):
        self.ladder45 = VixLadderManager(
            horizon_days=45,
            legs_config=ladder45_config,
            systematic_roll_threshold=systematic_roll_threshold,
            opportunistic_roll_vix_min=opportunistic_roll_vix_min,
        )
        self.ladder90 = VixLadderManager(
            horizon_days=90,
            legs_config=ladder90_config,
            systematic_roll_threshold=systematic_roll_threshold,
            opportunistic_roll_vix_min=opportunistic_roll_vix_min,
        )
        self.spike_multiplier = spike_multiplier
        self.vix_ma_period = vix_ma_period
        self.reentry_vix_threshold = reentry_vix_threshold
        self.total_harvested_cash = 0.0
        self.harvest_count = 0
        self.all_actions: List[dict] = []

    def get_history(self) -> list:
        entries = []
        for e in self.ladder45.history:
            entries.append({"date": e.date, "ladderDte": e.ladder_dte, "status": e.status, "pnl": e.pnl})
        for e in self.ladder90.history:
            entries.append({"date": e.date, "ladderDte": e.ladder_dte, "status": e.status, "pnl": e.pnl})
        entries.sort(key=lambda x: x["date"])
        return entries

    async def tick(
        self,
        bar_date: str,
        vix_price: float,
        vix_prices: pd.Series,
        iv: float = 0.80,
    ) -> dict:
        """
        Per-bar tick for both ladders.
        Returns {actions: [...], harvested_cash: float, reentry_cash_cost: float}.
        """
        vix_ma20 = compute_vix_ma(vix_prices, self.vix_ma_period)
        harvested_cash = 0.0
        reentry_cost = 0.0
        actions: list = []

        for ladder in [self.ladder45, self.ladder90]:
            # Decrement DTE
            if ladder.state.status == "ACTIVE" and ladder.state.entry_date:
                entry = datetime.strptime(ladder.state.entry_date, "%Y-%m-%d").date()
                current = datetime.strptime(bar_date, "%Y-%m-%d").date()
                ladder.state.current_dte = max(0, ladder.horizon_days - (current - entry).days)

            # ── Spike harvest check (only ACTIVE ladders) ──
            if ladder.state.status == "ACTIVE":
                if ladder.check_spike_harvest(vix_price, vix_ma20, self.spike_multiplier):
                    harvest = await ladder.harvest(bar_date, vix_price, iv)
                    harvested_cash += abs(harvest["cash_released"])
                    actions.append(harvest)
                    self.harvest_count += 1
                    continue

                # ── Roll check ──
                if ladder.check_roll(ladder.state.current_dte, vix_price, vix_ma20):
                    roll = await ladder.roll(bar_date, vix_price, iv)
                    actions.append(roll)

            # ── Re-entry check (HARVESTED ladders) ──
            if ladder.state.status == "HARVESTED" and vix_price <= self.reentry_vix_threshold:
                reentry = ladder.reenter(bar_date, vix_price)
                reentry_cost += abs(ladder._compute_position_value(vix_price, iv))
                actions.append(reentry)

        self.total_harvested_cash += harvested_cash
        self.all_actions.extend(actions)

        return {
            "actions": actions,
            "harvested_cash": harvested_cash,
            "reentry_cost": reentry_cost,
        }

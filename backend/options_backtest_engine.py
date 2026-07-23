"""
Institutional-grade options backtest engine powered by local parquet archive.
Supports concurrent overlapping positions, delta filtering, slippage models,
greeks capture, and advanced exit triggers (profit target / stop loss).
"""
import logging
import math
import os
from datetime import datetime, timezone
from pathlib import Path
from typing import Any, Dict, List, Optional, Tuple

import numpy as np
import pandas as pd

from engines.metrics import compute_all_metrics
from engines.slippage import apply_slippage

logger = logging.getLogger(__name__)

ARCHIVE_PATH = Path(os.getenv("OPTIONS_ARCHIVE_PATH", "/workspace/Archive/Nautilus_Archive5min"))
COMMISSION = 0.65  # Per contract
CONTRACT_MULTIPLIER = 100


def load_archive_data(ticker: str, start_year: int = 2018, end_year: int = 2026) -> pd.DataFrame:
    """Load all parquet data for a ticker across specified years."""
    ticker_dir = ARCHIVE_PATH / ticker.upper()
    if not ticker_dir.exists():
        raise FileNotFoundError(f"{ticker} not found in archive at {ticker_dir}")

    dfs = []
    for year in range(start_year, end_year + 1):
        f = ticker_dir / f"{ticker.upper()}_{year}.parquet"
        if f.exists():
            df = pd.read_parquet(f)
            dfs.append(df)

    if not dfs:
        raise ValueError(f"No data for {ticker} in years {start_year}-{end_year}")

    return pd.concat(dfs, ignore_index=True)


def calculate_dte(df: pd.DataFrame) -> pd.DataFrame:
    """Add DTE column from expiration and date using proper datetime arithmetic."""
    df["exp_date"] = pd.to_datetime(df["expiration"].astype(str), format="%Y%m%d", errors="coerce")
    df["trade_date"] = pd.to_datetime(df["date"].astype(str), format="%Y%m%d", errors="coerce")
    df["dte"] = (df["exp_date"] - df["trade_date"]).dt.days
    return df


class OptionLeg:
    def __init__(self, strike: float, right: str, action: str, quantity: int = 1):
        self.strike = strike
        self.right = right.upper()
        self.action = action.lower()
        self.quantity = quantity

    def intrinsic_value(self, underlying: float) -> float:
        if self.right == "C":
            return max(0, underlying - self.strike)
        return max(0, self.strike - underlying)


class OptionStrategy:
    def __init__(self, legs: List[OptionLeg]):
        self.legs = legs

    @property
    def description(self) -> str:
        return " + ".join(f"{l.action.upper()} {l.quantity}x {l.right} ${l.strike}" for l in self.legs)

    @property
    def is_credit(self) -> bool:
        """Estimate if this is a credit or debit strategy."""
        sell_premium = sum(l.strike * l.quantity for l in self.legs if l.action == "sell")
        buy_premium = sum(l.strike * l.quantity for l in self.legs if l.action == "buy")
        return sell_premium > buy_premium

    @property
    def total_contracts(self) -> int:
        return sum(l.quantity for l in self.legs)

    def max_spread_width(self) -> float:
        """Max distance between any short and any long strike."""
        shorts = [l.strike for l in self.legs if l.action == "sell"]
        longs = [l.strike for l in self.legs if l.action == "buy"]
        if not shorts or not longs:
            return 0.0
        return max(abs(min(shorts) - max(longs)), abs(max(shorts) - min(longs)))

    def margin_requirement(self, underlying_price: float, credit: float) -> float:
        """Estimate Reg-T margin for the strategy."""
        width = self.max_spread_width()
        if width > 0:
            return width * CONTRACT_MULTIPLIER * max(l.quantity for l in self.legs) + abs(credit)
        # Naked option margin
        naked_qty = sum(l.quantity for l in self.legs if l.action == "sell")
        return max(0, underlying_price * CONTRACT_MULTIPLIER * naked_qty * 0.20)


class OptionsBacktestEngine:
    """Bar-by-bar options backtest engine with concurrent position support."""

    def __init__(
        self,
        ticker: str,
        strategy: OptionStrategy,
        entry_dte_range: Tuple[int, int] = (30, 60),
        hold_until_dte: int = 21,
        entry_frequency_days: int = 7,
        start_year: int = 2018,
        end_year: int = 2026,
        # New params
        delta_min: float = 0.0,
        delta_max: float = 1.0,
        allow_overlapping: bool = False,
        slippage_model: str = "mid",
        slippage_pct: float = 0.1,
        profit_target_pct: Optional[float] = None,
        stop_loss_pct: Optional[float] = None,
        max_days_in_trade: int = 60,
    ):
        self.ticker = ticker.upper()
        self.strategy = strategy
        self.entry_dte_min, self.entry_dte_max = entry_dte_range
        self.hold_until_dte = hold_until_dte
        self.entry_frequency = entry_frequency_days
        self.start_year = start_year
        self.end_year = end_year
        self.delta_min = delta_min
        self.delta_max = delta_max
        self.allow_overlapping = allow_overlapping
        self.slippage_model = slippage_model
        self.slippage_pct = slippage_pct
        self.profit_target_pct = profit_target_pct
        self.stop_loss_pct = stop_loss_pct
        self.max_days_in_trade = max_days_in_trade

    def run(self) -> Dict[str, Any]:
        """Run the backtest with full institutional features."""
        logger.info(f"Loading {self.ticker} archive data ({self.start_year}-{self.end_year})...")
        df = load_archive_data(self.ticker, self.start_year, self.end_year)
        df = calculate_dte(df)
        logger.info(f"Loaded {len(df):,} rows, {df['expiration'].nunique()} expirations")

        trade_dates = sorted(df["date"].unique())
        trades = []
        equity_curve = []
        cash = 0.0
        open_positions: List[Dict] = []
        entry_countdown = 0
        trade_id = 0

        # Pre-group data by date for fast lookup
        date_groups = {d: g for d, g in df.groupby("date")}

        for trade_date in trade_dates:
            day_data = date_groups.get(trade_date)
            if day_data is None or day_data.empty:
                continue

            underlying = float(day_data["underlying_price"].iloc[0]) if "underlying_price" in day_data.columns else 0

            # ── Process existing positions ──
            still_open = []
            for pos in open_positions:
                result = self._process_position(pos, day_data, trade_date, underlying)
                if result is None:
                    still_open.append(pos)
                else:
                    trade_id += 1
                    result["id"] = trade_id
                    cash += result["pnl"]
                    trades.append(result)
                    entry_countdown = self.entry_frequency

            open_positions = still_open

            # ── Entry logic ──
            if self.allow_overlapping or (not open_positions and entry_countdown <= 0):
                if entry_countdown > 0:
                    entry_countdown -= 1
                else:
                    entry = self._find_entry(day_data, trade_date, underlying)
                    if entry:
                        open_positions.append(entry)
                        entry_countdown = self.entry_frequency

            # ── Equity curve ──
            position_margin = sum(p.get("margin", 0) for p in open_positions)
            equity_curve.append({
                "date": str(trade_date),
                "equity": round(cash, 2),
                "underlying": round(underlying, 2),
                "open_positions": len(open_positions),
                "margin_used": round(position_margin, 2),
            })

        # ── Calculate metrics ──
        years = (self.end_year - self.start_year) or 1
        metrics = compute_all_metrics(
            trades=trades,
            equity_curve=equity_curve,
            start_equity=0,
            end_equity=cash,
            years=years,
        )

        return {
            "ticker": self.ticker,
            "strategy": self.strategy.description,
            "trades": trades,
            "equity_curve": equity_curve,
            "metrics": metrics,
        }

    def _process_position(
        self,
        pos: Dict,
        day_data: pd.DataFrame,
        trade_date: int,
        underlying: float,
    ) -> Optional[Dict]:
        """Check if a position should exit. Returns trade record if closed, None if still open."""
        exp_date = pos["expiration"]
        entry_date_str = str(pos["entry_date"])
        dte_at_entry = pos["dte_at_entry"]

        trade_day_data = day_data[day_data["expiration"] == exp_date]
        if trade_day_data.empty:
            return None

        remaining_dte = (pd.to_datetime(str(exp_date), format="%Y%m%d") -
                         pd.to_datetime(str(trade_date), format="%Y%m%d")).days
        days_held = int(trade_date) - int(entry_date_str)

        # Check exit conditions
        exit_trade = False
        exit_reason = ""

        # DTE exit
        if remaining_dte <= self.hold_until_dte:
            exit_reason = "dte_exit"
            exit_trade = True
        # Max hold
        elif self.max_days_in_trade and days_held >= self.max_days_in_trade:
            exit_reason = "max_hold"
            exit_trade = True

        # Check P&L-based exits if we have current position value
        if not exit_trade:
            current_cost = self._calc_entry_cost(trade_day_data, is_entry=False)
            entry_cost = pos["entry_cost"]
            is_credit = pos["is_credit"]

            if is_credit:
                unrealized_pnl = entry_cost - current_cost
                pnl_pct = ((entry_cost - current_cost) / entry_cost * 100) if entry_cost > 0 else 0
            else:
                unrealized_pnl = current_cost - entry_cost
                pnl_pct = ((current_cost - entry_cost) / abs(entry_cost) * 100) if entry_cost != 0 else 0

            if self.profit_target_pct and pnl_pct >= self.profit_target_pct:
                exit_reason = "profit_target"
                exit_trade = True
            elif self.stop_loss_pct and pnl_pct <= -abs(self.stop_loss_pct):
                exit_reason = "stop_loss"
                exit_trade = True

        if not exit_trade:
            return None

        # Calculate exit P&L
        exit_cost = self._calc_entry_cost(trade_day_data, is_entry=False, use_slippage=True)
        pnl = self._compute_pnl(pos, exit_cost)
        commission_total = self.strategy.total_contracts * COMMISSION * 2
        pnl -= commission_total

        greeks = self._capture_greeks(trade_day_data)

        return {
            "entry_date": str(pos["entry_date"]),
            "exit_date": str(trade_date),
            "expiration": str(exp_date),
            "dte_at_entry": dte_at_entry,
            "dte_at_exit": remaining_dte,
            "days_held": days_held,
            "entry_cost": round(pos["entry_cost"], 2),
            "exit_cost": round(exit_cost, 2),
            "underlying_entry": round(pos.get("underlying_at_entry", 0), 2),
            "underlying_exit": round(underlying, 2),
            "net_credit": round(pos.get("entry_credit", 0), 2),
            "pnl": round(pnl, 2),
            "margin_required": round(pos.get("margin", 0), 2),
            "commission": round(commission_total, 2),
            "exit_reason": exit_reason,
            "greeks": greeks,
        }

    def _find_entry(self, day_data: pd.DataFrame, trade_date: int, underlying: float) -> Optional[Dict]:
        """Find and return an entry position if conditions are met."""
        # Filter by DTE and right
        eligible = day_data[
            (day_data["dte"] >= self.entry_dte_min) &
            (day_data["dte"] <= self.entry_dte_max) &
            (day_data["right"].isin([l.right for l in self.strategy.legs]))
        ]

        if eligible.empty:
            return None

        # Filter by delta if columns exist
        if "delta" in eligible.columns and (self.delta_min > 0 or self.delta_max < 1.0):
            delta_col = eligible["delta"].abs()
            eligible = eligible[(delta_col >= self.delta_min) & (delta_col <= self.delta_max)]

        if eligible.empty:
            return None

        # Find optimal expiration
        target_exp = eligible.groupby("expiration").size().idxmax() if len(eligible) > 0 else None
        if target_exp is None:
            return None

        exp_data = eligible[eligible["expiration"] == target_exp]
        entry_cost = self._calc_entry_cost(exp_data, is_entry=True, use_slippage=True)
        is_credit = entry_cost > 0

        margin = self.strategy.margin_requirement(
            underlying, abs(entry_cost)
        )

        return {
            "entry_date": trade_date,
            "expiration": target_exp,
            "dte_at_entry": int(exp_data["dte"].iloc[0]),
            "entry_cost": entry_cost,
            "entry_credit": abs(entry_cost) if entry_cost > 0 else 0,
            "entry_debit": abs(entry_cost) if entry_cost < 0 else 0,
            "is_credit": is_credit,
            "underlying_at_entry": underlying,
            "margin": margin,
        }

    def _calc_entry_cost(
        self, day_data: pd.DataFrame, is_entry: bool = True, use_slippage: bool = False
    ) -> float:
        """Calculate net cost/credit for the strategy on a given day's data."""
        total = 0.0
        for leg in self.strategy.legs:
            matching = day_data[
                (day_data["strike_price"] == leg.strike) &
                (day_data["right"] == leg.right)
            ]
            if matching.empty:
                continue
            row = matching.iloc[0]
            bid = float(row.get("bid", 0) or 0)
            ask = float(row.get("ask", 0) or 0)
            mid = (bid + ask) / 2 if (bid + ask) > 0 else float(row.get("close", 0) or 0)

            if use_slippage:
                mid = apply_slippage(
                    mid_price=mid,
                    model=self.slippage_model,
                    slippage_pct=self.slippage_pct,
                    bid=bid,
                    ask=ask,
                    is_entry=is_entry,
                )

            leg_value = mid * CONTRACT_MULTIPLIER * leg.quantity
            if leg.action == "sell":
                total += leg_value
            else:
                total -= leg_value

        return total

    def _compute_pnl(self, pos: Dict, exit_cost: float) -> float:
        """Compute P&L for a position at exit."""
        if pos["is_credit"]:
            return pos["entry_credit"] - exit_cost
        else:
            return exit_cost - pos["entry_debit"]

    def _capture_greeks(self, day_data: pd.DataFrame) -> Dict[str, float]:
        """Capture real greeks from parquet data for each leg."""
        greeks = {"delta": 0.0, "gamma": 0.0, "theta": 0.0, "vega": 0.0, "rho": 0.0}
        for leg in self.strategy.legs:
            matching = day_data[
                (day_data["strike_price"] == leg.strike) &
                (day_data["right"] == leg.right)
            ]
            if matching.empty:
                continue
            row = matching.iloc[0]
            sign = -1 if leg.action == "sell" else 1
            for g in ["delta", "gamma", "theta", "vega", "rho"]:
                val = float(row.get(g, 0) or 0) * sign * leg.quantity
                if g in ("delta",):
                    val *= 100  # delta in dollars per $1 move
                greeks[g] = round(greeks.get(g, 0) + val, 4)
        return greeks

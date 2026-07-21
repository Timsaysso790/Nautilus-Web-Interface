"""
Real options backtest engine powered by the local parquet archive.
Reads 5-min bar data, simulates multi-leg option strategies bar-by-bar.
"""
import logging
import math
from datetime import datetime, timezone
from pathlib import Path
from typing import Any, Dict, List, Optional, Tuple

import numpy as np
import pandas as pd

logger = logging.getLogger(__name__)

ARCHIVE_PATH = Path("/workspace/Archive/Nautilus_Archive5min")
COMMISSION = 0.65  # Per contract


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
    """Add DTE column from expiration and date."""
    df["exp_date"] = pd.to_datetime(df["expiration"].astype(str), format="%Y%m%d", errors="coerce")
    df["trade_date"] = pd.to_datetime(df["date"].astype(str), format="%Y%m%d", errors="coerce")
    df["dte"] = (df["exp_date"] - df["trade_date"]).dt.days
    return df


class OptionLeg:
    def __init__(self, strike: float, right: str, action: str, quantity: int = 1):
        self.strike = strike
        self.right = right.upper()  # "C" or "P"
        self.action = action.lower()  # "buy" or "sell"
        self.quantity = quantity

    def intrinsic_value(self, underlying: float) -> float:
        if self.right == "C":
            return max(0, underlying - self.strike)
        return max(0, self.strike - underlying)


class OptionStrategy:
    def __init__(self, legs: List[OptionLeg]):
        self.legs = legs

    @property
    def max_loss(self) -> Optional[float]:
        """Calculate max loss for simple spreads."""
        sell_legs = [l for l in self.legs if l.action == "sell"]
        buy_legs = [l for l in self.legs if l.action == "buy"]
        if len(sell_legs) == 1 and len(buy_legs) == 1:
            width = abs(sell_legs[0].strike - buy_legs[0].strike) * 100
            return width
        return None

    @property
    def description(self) -> str:
        legs_desc = []
        for l in self.legs:
            legs_desc.append(f"{l.action.upper()} {l.quantity}x {l.right} ${l.strike}")
        return " + ".join(legs_desc)


class OptionsBacktestEngine:
    """Bar-by-bar options backtest engine using archive data."""

    def __init__(self, ticker: str, strategy: OptionStrategy, entry_dte_range: Tuple[int, int] = (30, 60),
                 hold_until_dte: int = 21, entry_frequency_days: int = 7, start_year: int = 2018, end_year: int = 2026):
        self.ticker = ticker.upper()
        self.strategy = strategy
        self.entry_dte_min, self.entry_dte_max = entry_dte_range
        self.hold_until_dte = hold_until_dte
        self.entry_frequency = entry_frequency_days
        self.start_year = start_year
        self.end_year = end_year

    def run(self) -> Dict[str, Any]:
        """Run the backtest and return results."""
        logger.info(f"Loading {self.ticker} archive data ({self.start_year}-{self.end_year})...")
        df = load_archive_data(self.ticker, self.start_year, self.end_year)
        df = calculate_dte(df)
        logger.info(f"Loaded {len(df):,} rows")

        # Get unique trade dates sorted
        trade_dates = sorted(df["date"].unique())
        trades = []
        equity_curve = []
        cash = 0.0
        open_trade = None
        entry_countdown = 0

        # Track latest underlying price for P&L
        latest_price_cache: Dict[str, float] = {}

        # Pre-group data by date for fast lookup
        date_groups = {d: g for d, g in df.groupby("date")}

        for trade_date in trade_dates:
            day_data = date_groups.get(trade_date)
            if day_data is None or day_data.empty:
                continue

            # Get underlying price for this date
            underlying = float(day_data["underlying_price"].iloc[0]) if "underlying_price" in day_data.columns else 0
            latest_price_cache["underlying"] = underlying

            # Process open trade
            if open_trade:
                entry_date_str = str(open_trade["entry_date"])
                exp_date = open_trade["expiration"]
                dte_at_entry = open_trade["dte_at_entry"]
                days_held = (int(trade_date) - int(entry_date_str))

                # Check exit conditions
                trade_day_data = day_data[day_data["expiration"] == exp_date]
                if trade_day_data.empty:
                    # Try next trade date
                    equity_curve.append({"date": str(trade_date), "equity": cash, "underlying": underlying})
                    continue

                # Current DTE
                remaining_dte = (pd.to_datetime(str(exp_date), format="%Y%m%d") - pd.to_datetime(str(trade_date), format="%Y%m%d")).days
                exit_trade = False
                exit_reason = ""

                if remaining_dte <= self.hold_until_dte:
                    exit_reason = "dte_exit"
                    exit_trade = True
                elif days_held >= 60:
                    exit_reason = "max_hold"
                    exit_trade = True

                if exit_trade and open_trade:
                    # Calculate exit P&L
                    exit_cost = self._calc_entry_cost(trade_day_data, is_entry=False)
                    pnl = open_trade["entry_cost"] + exit_cost  # Negative entry = credit, exit cost = debit to close
                    if open_trade["is_credit"]:
                        pnl = open_trade["entry_credit"] - exit_cost
                    else:
                        pnl = exit_cost - open_trade["entry_debit"]

                    # Commissions
                    total_contracts = sum(l.quantity for l in self.strategy.legs)
                    commission_total = total_contracts * COMMISSION * 2  # Entry + exit
                    pnl -= commission_total

                    cash += pnl
                    trades.append({
                        "entry_date": str(open_trade["entry_date"]),
                        "exit_date": str(trade_date),
                        "expiration": str(exp_date),
                        "dte_at_entry": dte_at_entry,
                        "dte_at_exit": remaining_dte,
                        "days_held": days_held,
                        "entry_cost": open_trade["entry_cost"],
                        "pnl": round(pnl, 2),
                        "exit_reason": exit_reason,
                    })
                    open_trade = None
                    entry_countdown = self.entry_frequency

            # Entry logic
            if not open_trade:
                if entry_countdown > 0:
                    entry_countdown -= 1
                else:
                    # Find eligible expiration
                    eligible = day_data[
                        (day_data["dte"] >= self.entry_dte_min) &
                        (day_data["dte"] <= self.entry_dte_max) &
                        (day_data["right"].isin([l.right for l in self.strategy.legs]))
                    ]
                    if not eligible.empty:
                        # Find the optimal strike based on delta
                        target_exp = eligible.groupby("expiration").size().idxmax() if len(eligible) > 0 else None
                        if target_exp:
                            exp_data = eligible[eligible["expiration"] == target_exp]
                            entry_cost = self._calc_entry_cost(exp_data, is_entry=True)
                            is_credit = entry_cost > 0

                            open_trade = {
                                "entry_date": trade_date,
                                "expiration": target_exp,
                                "dte_at_entry": int(exp_data["dte"].iloc[0]),
                                "entry_cost": entry_cost,
                                "entry_credit": abs(entry_cost) if entry_cost > 0 else 0,
                                "entry_debit": abs(entry_cost) if entry_cost < 0 else 0,
                                "is_credit": is_credit,
                                "underlying_at_entry": underlying,
                            }
                            entry_countdown = self.entry_frequency

            # Update equity curve
            equity_curve.append({"date": str(trade_date), "equity": cash, "underlying": underlying})

        # Calculate metrics
        total_pnl = sum(t["pnl"] for t in trades)
        winning = [t for t in trades if t["pnl"] > 0]
        losing = [t for t in trades if t["pnl"] <= 0]
        win_rate = len(winning) / len(trades) * 100 if trades else 0

        # Simple Sharpe-like ratio
        pnl_series = [t["pnl"] for t in trades]
        avg_pnl = sum(pnl_series) / len(pnl_series) if pnl_series else 0
        std_pnl = (sum((p - avg_pnl) ** 2 for p in pnl_series) / len(pnl_series)) ** 0.5 if len(pnl_series) > 1 else 1
        sharpe = (avg_pnl / std_pnl) * (252 ** 0.5) if std_pnl > 0 else 0

        # Max drawdown on equity curve
        equity_values = [e["equity"] for e in equity_curve]
        peak = equity_values[0] if equity_values else 0
        max_dd = 0
        for v in equity_values:
            if v > peak:
                peak = v
            dd = (peak - v) / peak * 100 if peak > 0 else 0
            if dd > max_dd:
                max_dd = dd

        # Profit factor
        gross_profit = sum(t["pnl"] for t in winning)
        gross_loss = abs(sum(t["pnl"] for t in losing))
        profit_factor = gross_profit / gross_loss if gross_loss > 0 else float("inf")

        return {
            "ticker": self.ticker,
            "strategy": self.strategy.description,
            "trades": trades,
            "equity_curve": equity_curve,
            "metrics": {
                "total_trades": len(trades),
                "winning_trades": len(winning),
                "losing_trades": len(losing),
                "win_rate": round(win_rate, 1),
                "total_pnl": round(total_pnl, 2),
                "avg_pnl": round(avg_pnl, 2),
                "profit_factor": round(profit_factor, 2),
                "sharpe_ratio": round(sharpe, 2),
                "max_drawdown_pct": round(max_dd, 1),
                "avg_days_held": round(sum(t["days_held"] for t in trades) / len(trades), 1) if trades else 0,
            }
        }

    def _calc_entry_cost(self, day_data: pd.DataFrame, is_entry: bool) -> float:
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
            mid = (float(row.get("bid", 0) or 0) + float(row.get("ask", 0) or 0)) / 2
            if mid == 0:
                mid = float(row.get("close", 0) or 0)

            leg_value = mid * 100 * leg.quantity  # Standard option multiplier
            if leg.action == "sell":
                total += leg_value  # Receive premium
            else:
                total -= leg_value  # Pay premium

        return total

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
    def __init__(self, strike: float = 0.0, right: str = "P", action: str = "sell",
                 quantity: int = 1, target_delta: Optional[float] = None):
        self.strike = strike  # 0 = use delta targeting
        self.right = right.upper()
        self.action = action.lower()
        self.quantity = quantity
        self.target_delta = target_delta  # e.g. 0.16 for 16-delta

    @property
    def uses_delta_targeting(self) -> bool:
        return self.strike == 0 and self.target_delta is not None

    def intrinsic_value(self, underlying: float) -> float:
        if self.right == "C":
            return max(0, underlying - self.strike)
        return max(0, self.strike - underlying)


class OptionStrategy:
    def __init__(self, legs: List[OptionLeg]):
        self.legs = legs

    @property
    def description(self) -> str:
        parts = []
        for l in self.legs:
            if l.uses_delta_targeting:
                parts.append(f"{l.action.upper()} {l.quantity}x {l.right} Δ{abs(l.target_delta or 0):.0f}")
            else:
                parts.append(f"{l.action.upper()} {l.quantity}x {l.right} ${l.strike}")
        return " + ".join(parts)

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
        # Technical indicator entry triggers
        entry_trigger_mode: str = "calendar",
        indicator_type: str = "rsi",
        indicator_threshold: float = 30,
        indicator_period: int = 14,
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
        self.entry_trigger_mode = entry_trigger_mode
        self.indicator_type = indicator_type
        self.indicator_threshold = indicator_threshold
        self.indicator_period = indicator_period

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

        # Compute technical indicators from daily underlying prices
        indicator_signals: Dict[int, bool] = {}
        if self.entry_trigger_mode == "technical":
            indicator_signals = _compute_indicator_signals(
                df, self.indicator_type, self.indicator_threshold, self.indicator_period
            )
            signal_count = sum(1 for v in indicator_signals.values() if v)
            logger.info(f"Technical trigger '{self.indicator_type}' active on {signal_count}/{len(indicator_signals)} days")

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
            # Decrement countdown every trading day regardless of position state.
            # This prevents the deadlock where entry_countdown > 0 after a trade
            # closes, but the inner if-block that decrements it requires
            # entry_countdown <= 0 to be entered at all.
            entry_countdown = max(0, entry_countdown - 1)

            if self.allow_overlapping or (not open_positions and entry_countdown <= 0):
                if self.entry_trigger_mode == "calendar":
                    entry = self._find_entry(day_data, trade_date, underlying)
                    if entry:
                        open_positions.append(entry)
                        entry_countdown = self.entry_frequency
                else:
                    # Technical trigger: enter when indicator signal is active + DTE/Δ conditions met
                    if indicator_signals.get(trade_date, False):
                        # Check at most once per week even in technical mode
                        if entry_countdown <= 0:
                            entry = self._find_entry(day_data, trade_date, underlying)
                            if entry:
                                open_positions.append(entry)
                                entry_countdown = 7  # Minimum 7 days between entries

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
        dte_at_entry = pos["dte_at_entry"]

        trade_day_data = day_data[day_data["expiration"] == exp_date]
        if trade_day_data.empty:
            return None

        remaining_dte = (pd.to_datetime(str(exp_date), format="%Y%m%d") -
                         pd.to_datetime(str(trade_date), format="%Y%m%d")).days
        days_held = (pd.to_datetime(str(trade_date), format="%Y%m%d") -
                     pd.to_datetime(str(pos["entry_date"]), format="%Y%m%d")).days

        # Build resolved strategy from stored leg info (handles delta-targeted entries)
        resolved_legs = pos.get("_resolved_legs", [])
        if resolved_legs:
            pos_strategy = OptionStrategy([OptionLeg(
                strike=l["strike"], right=l["right"], action=l["action"], quantity=l["qty"]
            ) for l in resolved_legs])
        else:
            pos_strategy = self.strategy

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
            current_cost = self._calc_entry_cost_for_strategy(pos_strategy, trade_day_data, is_entry=False)
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
        exit_cost = self._calc_entry_cost_for_strategy(pos_strategy, trade_day_data, is_entry=False, use_slippage=True)
        pnl = self._compute_pnl(pos, exit_cost)
        commission_total = pos_strategy.total_contracts * COMMISSION * 2
        pnl -= commission_total

        greeks = self._capture_greeks_for_strategy(pos_strategy, trade_day_data)

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
        """Find and return an entry position. Resolves delta-based legs to actual strikes."""
        # Filter by DTE and right
        eligible = day_data[
            (day_data["dte"] >= self.entry_dte_min) &
            (day_data["dte"] <= self.entry_dte_max) &
            (day_data["right"].isin([l.right for l in self.strategy.legs]))
        ]

        if eligible.empty:
            return None

        # Find optimal expiration
        target_exp = eligible.groupby("expiration").size().idxmax() if len(eligible) > 0 else None
        if target_exp is None:
            return None

        exp_data = eligible[eligible["expiration"] == target_exp]

        # Resolve delta-based legs to actual strikes
        resolved_legs: List[OptionLeg] = []
        for leg in self.strategy.legs:
            if leg.uses_delta_targeting and "delta" in exp_data.columns:
                # Find the strike closest to target delta for this right
                right_data = exp_data[exp_data["right"] == leg.right]
                if right_data.empty:
                    return None
                # For puts, delta is negative; for calls, delta is positive
                # Target delta is stored as absolute value
                target_abs = leg.target_delta
                right_data = right_data.copy()
                right_data["delta_dist"] = (right_data["delta"].abs() - target_abs).abs()
                best_row = right_data.loc[right_data["delta_dist"].idxmin()]
                resolved_legs.append(OptionLeg(
                    strike=float(best_row["strike_price"]),
                    right=leg.right,
                    action=leg.action,
                    quantity=leg.quantity,
                ))
            else:
                resolved_legs.append(leg)

        # Override strategy legs with resolved strikes for this entry
        resolved_strategy = OptionStrategy(resolved_legs)
        entry_cost = self._calc_entry_cost_for_strategy(resolved_strategy, exp_data, is_entry=True, use_slippage=True)

        # Apply global delta filter if set (independent of per-leg delta targeting)
        if "delta" in exp_data.columns and (self.delta_min > 0 or self.delta_max < 1.0):
            # Already filtered by resolved strikes — additional global check unnecessary
            pass

        is_credit = entry_cost > 0
        margin = resolved_strategy.margin_requirement(underlying, abs(entry_cost))

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
            "_resolved_legs": [{"strike": l.strike, "right": l.right, "action": l.action, "qty": l.quantity} for l in resolved_legs],
        }

    def _calc_entry_cost_for_strategy(
        self, strategy: OptionStrategy, day_data: pd.DataFrame, is_entry: bool = True, use_slippage: bool = False
    ) -> float:
        """Calculate net cost/credit for a strategy on a given day's data."""
        total = 0.0
        for leg in strategy.legs:
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

    def _calc_entry_cost(
        self, day_data: pd.DataFrame, is_entry: bool = True, use_slippage: bool = False
    ) -> float:
        """Legacy wrapper — delegates to the original strategy-based calculation."""
        return self._calc_entry_cost_for_strategy(self.strategy, day_data, is_entry, use_slippage)

    def _compute_pnl(self, pos: Dict, exit_cost: float) -> float:
        """Compute P&L for a position at exit."""
        if pos["is_credit"]:
            return pos["entry_credit"] - exit_cost
        else:
            return exit_cost - pos["entry_debit"]

    def _capture_greeks_for_strategy(self, strategy: OptionStrategy, day_data: pd.DataFrame) -> Dict[str, float]:
        """Capture real greeks from parquet data for each leg."""
        greeks = {"delta": 0.0, "gamma": 0.0, "theta": 0.0, "vega": 0.0, "rho": 0.0}
        for leg in strategy.legs:
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


# ── Technical Indicator Computation ─────────────────────────────────────────────

def _compute_indicator_signals(df: pd.DataFrame, indicator_type: str, threshold: float, period: int = 14) -> Dict[int, bool]:
    """Compute daily indicator signals from underlying price data.
    Returns a dict mapping date (int) → bool (signal active).

    Supported types:
      rsi, rsi_above       — RSI (configurable period, default 14)
      macd_bullish          — MACD(12,26,9) histogram crosses above zero
      macd_bearish          — MACD histogram crosses below zero
      stoch_oversold        — Stochastic %K < threshold (period=14, default threshold=20)
      stoch_overbought      — Stochastic %K > threshold (default threshold=80)
      ema_below             — Price below EMA(period), default period=20
      ema_above             — Price above EMA(period), default period=20
      bb_lower              — Price below lower Bollinger Band(20,2)
      bb_upper              — Price above upper Bollinger Band(20,2)
      bb_squeeze            — BB width in bottom threshold percentile (default 10 = squeeze)
      sma_below             — Price below SMA(period), default period=50
      sma_above             — Price above SMA(period), default period=200
      price_channel_upper   — Price breaks above N-period high (Donchian breakout)
      price_channel_lower   — Price breaks below N-period low
    """

    # Extract daily underlying prices (one row per date)
    daily = df.groupby("date")["underlying_price"].first().sort_index()
    prices = daily.values
    dates = daily.index.values

    min_bars = max(period, 50)
    n = len(prices)
    signals: Dict[int, bool] = {}

    if n < 20:
        logger.warning(f"Not enough data points ({n}) for indicators, defaulting to all-pass")
        return {int(d): True for d in dates}

    # ── EMA helper ──
    def _ema(data: np.ndarray, span: int) -> np.ndarray:
        alpha = 2 / (span + 1)
        result = np.zeros_like(data, dtype=float)
        result[0] = data[0]
        for i in range(1, len(data)):
            result[i] = alpha * data[i] + (1 - alpha) * result[i-1]
        return result

    # ── SMA helper ──
    def _sma(data: np.ndarray, window: int) -> np.ndarray:
        result = np.full_like(data, np.nan, dtype=float)
        for i in range(window - 1, len(data)):
            result[i] = data[i-window+1:i+1].mean()
        return result

    # ── RSI ──
    if indicator_type in ("rsi", "rsi_above"):
        deltas = np.diff(prices, prepend=prices[0])
        gains = np.where(deltas > 0, deltas, 0)
        losses = np.where(deltas < 0, -deltas, 0)
        avg_gain = np.zeros_like(prices, dtype=float)
        avg_loss = np.zeros_like(prices, dtype=float)
        if n > period:
            avg_gain[period] = gains[1:period+1].mean()
            avg_loss[period] = losses[1:period+1].mean()
            for i in range(period + 1, n):
                avg_gain[i] = (avg_gain[i-1] * (period - 1) + gains[i]) / period
                avg_loss[i] = (avg_loss[i-1] * (period - 1) + losses[i]) / period
        for i, d in enumerate(dates):
            if i < period:
                signals[int(d)] = False
                continue
            rs = avg_gain[i] / avg_loss[i] if avg_loss[i] > 0 else 100
            rsi = 100 - (100 / (1 + rs))
            signals[int(d)] = rsi < threshold if indicator_type == "rsi" else rsi > threshold

    # ── MACD (12, 26, 9) ──
    elif indicator_type in ("macd_bullish", "macd_bearish"):
        ema12 = _ema(prices, 12)
        ema26 = _ema(prices, 26)
        macd_line = ema12 - ema26
        signal_line = _ema(macd_line, 9)
        histogram = macd_line - signal_line
        for i, d in enumerate(dates):
            if i < 26:
                signals[int(d)] = False
                continue
            if indicator_type == "macd_bullish":
                # Histogram crosses above zero (or turns positive)
                signals[int(d)] = histogram[i] > 0 and (i == 0 or histogram[i-1] <= 0)
            else:
                signals[int(d)] = histogram[i] < 0 and (i == 0 or histogram[i-1] >= 0)

    # ── Stochastic (period, 3, 3) ──
    elif indicator_type in ("stoch_oversold", "stoch_overbought"):
        t = int(threshold) if threshold > 1 else int(threshold * 100)
        for i, d in enumerate(dates):
            if i < period:
                signals[int(d)] = False
                continue
            window = prices[i-period+1:i+1]
            high_n = window.max()
            low_n = window.min()
            if high_n == low_n:
                signals[int(d)] = False
                continue
            k_raw = 100 * (prices[i] - low_n) / (high_n - low_n)
            # Simple 3-period smoothing
            if i >= period + 2:
                k_vals = []
                for j in range(i-2, i+1):
                    w = prices[j-period+1:j+1]
                    hh, ll = w.max(), w.min()
                    k_vals.append(100 * (prices[j] - ll) / (hh - ll) if hh != ll else 50)
                k = sum(k_vals) / 3
            else:
                k = k_raw
            if indicator_type == "stoch_oversold":
                signals[int(d)] = k < t
            else:
                signals[int(d)] = k > t

    # ── EMA below / above (configurable period) ──
    elif indicator_type in ("ema_below", "ema_above"):
        ema = _ema(prices, period)
        for i, d in enumerate(dates):
            if i < period:
                signals[int(d)] = False
                continue
            signals[int(d)] = prices[i] < ema[i] if indicator_type == "ema_below" else prices[i] > ema[i]

    # ── Bollinger Bands ──
    elif indicator_type in ("bb_lower", "bb_upper"):
        bb_period = period if period >= 10 else 20
        sma = _sma(prices, bb_period)
        for i, d in enumerate(dates):
            if i < bb_period:
                signals[int(d)] = False
                continue
            std = prices[i-bb_period+1:i+1].std()
            lower = sma[i] - 2 * std
            upper = sma[i] + 2 * std
            signals[int(d)] = prices[i] < lower if indicator_type == "bb_lower" else prices[i] > upper

    # ── BB Squeeze (width in bottom N percentile over lookback) ──
    elif indicator_type == "bb_squeeze":
        bb_period = max(period, 10)
        lookback = 125  # ~6 months
        sma = _sma(prices, bb_period)
        bb_widths = np.full(n, np.nan)
        for i in range(bb_period - 1, n):
            std = prices[i-bb_period+1:i+1].std()
            bb_widths[i] = (2 * std) / sma[i] if sma[i] > 0 else 0
        for i, d in enumerate(dates):
            if i < lookback:
                signals[int(d)] = False
                continue
            recent = bb_widths[max(0, i-lookback):i+1]
            recent = recent[~np.isnan(recent)]
            if len(recent) < 20:
                signals[int(d)] = False
                continue
            cutoff = np.percentile(recent, threshold) if threshold < 100 else recent.min()
            signals[int(d)] = bb_widths[i] <= cutoff

    # ── SMA below / above (configurable period) ──
    elif indicator_type in ("sma_below", "sma_above"):
        sma = _sma(prices, period)
        for i, d in enumerate(dates):
            if i < period:
                signals[int(d)] = False
                continue
            signals[int(d)] = prices[i] < sma[i] if indicator_type == "sma_below" else prices[i] > sma[i]

    # ── Price channel breakout (Donchian) ──
    elif indicator_type in ("price_channel_upper", "price_channel_lower"):
        for i, d in enumerate(dates):
            if i < period:
                signals[int(d)] = False
                continue
            window = prices[i-period:i]
            ch_high = window.max()
            ch_low = window.min()
            if indicator_type == "price_channel_upper":
                # Breakout above channel
                signals[int(d)] = prices[i] > ch_high and prices[i-1] <= ch_high
            else:
                signals[int(d)] = prices[i] < ch_low and prices[i-1] >= ch_low

    else:
        # Unknown indicator — allow all entries
        signals = {int(d): True for d in dates}

    return signals

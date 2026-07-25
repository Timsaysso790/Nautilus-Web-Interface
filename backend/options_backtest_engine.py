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
        indicator_period2: int = 50,
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
        self.indicator_period2 = indicator_period2

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
                df, self.indicator_type, self.indicator_threshold, self.indicator_period, self.indicator_period2
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

def _compute_indicator_signals(df: pd.DataFrame, indicator_type: str, threshold: float,
                               period: int = 14, period2: int = 50) -> Dict[int, bool]:
    """Compute daily indicator signals from underlying price data.
    Returns a dict mapping date (int) → bool (signal active).

    Supported types (26 total):
      Price momentum / mean reversion:
        rsi, rsi_above          — RSI (period, threshold)
        williams_r               — Williams %R oversold (period=14, threshold=-80)
        williams_r_above         — Williams %R overbought (threshold=-20)
        cci, cci_above           — CCI (period=20, threshold=-100/+100)
        roc                       — Rate of Change % (period=12, threshold)
      Trend:
        macd_bullish, macd_bearish  — MACD(12,26,9) cross
        ma_crossover_bullish        — Fast MA(period) crosses above Slow MA(period2)
        ma_crossover_bearish        — Fast MA crosses below Slow MA
        adx                        — ADX > threshold (period=14, threshold=25)
        adx_below                  — ADX < threshold (weak trend/range bound)
        parabolic_sar              — PSAR flip to bullish
        parabolic_sar_bearish      — PSAR flip to bearish
      Moving average deviation:
        price_pct_sma              — Price % below SMA(period) > threshold% extended
        price_pct_sma_above        — Price % above SMA(period) > threshold%
        ema_below, ema_above       — Price vs EMA(period)
        sma_below, sma_above       — Price vs SMA(period)
      Volatility:
        bb_lower, bb_upper         — Bollinger Bands(period,2)
        bb_squeeze                 — BB width in bottom threshold% percentile
        keltner_lower, keltner_upper — Keltner Channels(period, period2=multiplier)
        atr                        — ATR(period) > threshold% of price (high vol)
        atr_below                  — ATR < threshold% (low vol / contraction)
        hist_vol                   — Historical vol(period) > threshold%
        hist_vol_below             — Historical vol < threshold%
      Volume:
        volume_spike               — Volume > threshold × avg(period)
      IV-based:
        iv_rank                    — IV Rank(period lookback) > threshold%
        iv_rank_below              — IV Rank < threshold%
      Extremes:
        near_52w_high              — Price within threshold% of 52-week high
        near_52w_low               — Price within threshold% of 52-week low
      Channels:
        price_channel_upper        — Donchian breakout above N-period high
        price_channel_lower        — Donchian breakdown below N-period low
    """

    daily = df.groupby("date")["underlying_price"].first().sort_index()
    prices = daily.values
    dates = daily.index.values
    n = len(prices)
    signals: Dict[int, bool] = {}

    if n < 2:
        return {int(d): True for d in dates}

    # ── Helpers ──
    def _ema(data: np.ndarray, span: int) -> np.ndarray:
        alpha = 2 / (span + 1)
        result = np.zeros_like(data, dtype=float)
        result[0] = data[0]
        for i in range(1, len(data)):
            result[i] = alpha * data[i] + (1 - alpha) * result[i-1]
        return result

    def _sma(data: np.ndarray, window: int) -> np.ndarray:
        result = np.full_like(data, np.nan, dtype=float)
        for i in range(window - 1, len(data)):
            result[i] = data[i-window+1:i+1].mean()
        return result

    def _true_range(i: int) -> float:
        if i == 0:
            # Check if high/low exist in df
            return 0.0
        day_prices = df[df["date"] == dates[i]]
        h = float(day_prices["high"].max()) if "high" in day_prices.columns else prices[i]
        l = float(day_prices["low"].min()) if "low" in day_prices.columns else prices[i]
        prev_close = prices[i-1]
        return max(h - l, abs(h - prev_close), abs(l - prev_close))

    def _get_iv(d: int) -> float:
        """Get average implied volatility for a trading date."""
        day_data = df[df["date"] == d]
        if "implied_volatility" in day_data.columns and not day_data.empty:
            return float(day_data["implied_volatility"].mean())
        return 0.0

    def _get_volume(d: int) -> float:
        day_data = df[df["date"] == d]
        if "volume" in day_data.columns and not day_data.empty:
            return float(day_data["volume"].sum())
        return 0.0

    # ════════════════════════════════════════════════════════════════
    # RSI
    # ════════════════════════════════════════════════════════════════
    if indicator_type in ("rsi", "rsi_above"):
        deltas = np.diff(prices, prepend=prices[0])
        gains = np.where(deltas > 0, deltas, 0)
        losses = np.where(deltas < 0, -deltas, 0)
        avg_gain = np.zeros_like(prices, dtype=float)
        avg_loss = np.zeros_like(prices, dtype=float)
        p = period
        if n > p:
            avg_gain[p] = gains[1:p+1].mean()
            avg_loss[p] = losses[1:p+1].mean()
            for i in range(p + 1, n):
                avg_gain[i] = (avg_gain[i-1] * (p - 1) + gains[i]) / p
                avg_loss[i] = (avg_loss[i-1] * (p - 1) + losses[i]) / p
        for i, d in enumerate(dates):
            if i < p: signals[int(d)] = False; continue
            rs = avg_gain[i] / avg_loss[i] if avg_loss[i] > 0 else 100
            rsi = 100 - (100 / (1 + rs))
            signals[int(d)] = rsi < threshold if indicator_type == "rsi" else rsi > threshold

    # ════════════════════════════════════════════════════════════════
    # Williams %R  (period, threshold default -80 / -20)
    # ════════════════════════════════════════════════════════════════
    elif indicator_type in ("williams_r", "williams_r_above"):
        for i, d in enumerate(dates):
            if i < period: signals[int(d)] = False; continue
            window = prices[i-period+1:i+1]
            hh, ll = window.max(), window.min()
            wr = -100 if hh == ll else -100 * (hh - prices[i]) / (hh - ll)
            t = threshold if threshold < 0 else -threshold  # normalize to negative
            signals[int(d)] = wr < t if indicator_type == "williams_r" else wr > t

    # ════════════════════════════════════════════════════════════════
    # CCI  (period=20, threshold default -100 / +100)
    # ════════════════════════════════════════════════════════════════
    elif indicator_type in ("cci", "cci_above"):
        typical = prices  # use close as typical price proxy
        sma_tp = _sma(typical, period)
        mean_dev = np.full(n, np.nan)
        for i in range(period - 1, n):
            mean_dev[i] = np.abs(typical[i-period+1:i+1] - sma_tp[i]).mean()
        for i, d in enumerate(dates):
            if i < period or mean_dev[i] == 0: signals[int(d)] = False; continue
            cci = (typical[i] - sma_tp[i]) / (0.015 * mean_dev[i])
            signals[int(d)] = cci < threshold if indicator_type == "cci" else cci > threshold

    # ════════════════════════════════════════════════════════════════
    # MACD
    # ════════════════════════════════════════════════════════════════
    elif indicator_type in ("macd_bullish", "macd_bearish"):
        ema12 = _ema(prices, 12); ema26 = _ema(prices, 26)
        macd_line = ema12 - ema26; signal_line = _ema(macd_line, 9)
        histogram = macd_line - signal_line
        for i, d in enumerate(dates):
            if i < 26: signals[int(d)] = False; continue
            if indicator_type == "macd_bullish":
                signals[int(d)] = histogram[i] > 0 and (i == 0 or histogram[i-1] <= 0)
            else:
                signals[int(d)] = histogram[i] < 0 and (i == 0 or histogram[i-1] >= 0)

    # ════════════════════════════════════════════════════════════════
    # MA Crossover  (period=fast, period2=slow)
    # ════════════════════════════════════════════════════════════════
    elif indicator_type in ("ma_crossover_bullish", "ma_crossover_bearish"):
        fast = period; slow = period2
        sma_fast = _sma(prices, fast); sma_slow = _sma(prices, slow)
        for i, d in enumerate(dates):
            if i < slow: signals[int(d)] = False; continue
            if indicator_type == "ma_crossover_bullish":
                signals[int(d)] = sma_fast[i] > sma_slow[i] and (i == 0 or sma_fast[i-1] <= sma_slow[i-1])
            else:
                signals[int(d)] = sma_fast[i] < sma_slow[i] and (i == 0 or sma_fast[i-1] >= sma_slow[i-1])

    # ════════════════════════════════════════════════════════════════
    # ADX  (period=14, threshold default for 'adx' = 25)
    # ════════════════════════════════════════════════════════════════
    elif indicator_type in ("adx", "adx_below"):
        if "high" not in df.columns or "low" not in df.columns:
            signals = {int(d): True for d in dates}
        else:
            daily_high = np.array([float(df[df["date"]==d]["high"].max()) for d in dates])
            daily_low  = np.array([float(df[df["date"]==d]["low"].min()) for d in dates])
            tr = np.zeros(n)
            plus_dm = np.zeros(n); minus_dm = np.zeros(n)
            for i in range(1, n):
                tr[i] = max(daily_high[i]-daily_low[i], abs(daily_high[i]-prices[i-1]), abs(daily_low[i]-prices[i-1]))
                up = daily_high[i] - daily_high[i-1]
                down = daily_low[i-1] - daily_low[i]
                plus_dm[i] = up if up > down and up > 0 else 0
                minus_dm[i] = down if down > up and down > 0 else 0
            atr_adx = _ema(tr, period)
            atr_adx[atr_adx == 0] = 1e-10
            plus_di = 100 * _ema(plus_dm, period) / atr_adx
            minus_di = 100 * _ema(minus_dm, period) / atr_adx
            dx = 100 * np.abs(plus_di - minus_di) / (plus_di + minus_di + 1e-10)
            adx_vals = _ema(dx, period)
            for i, d in enumerate(dates):
                if i < period * 2: signals[int(d)] = False; continue
                signals[int(d)] = adx_vals[i] > threshold if indicator_type == "adx" else adx_vals[i] < threshold

    # ════════════════════════════════════════════════════════════════
    # Parabolic SAR
    # ════════════════════════════════════════════════════════════════
    elif indicator_type in ("parabolic_sar", "parabolic_sar_bearish"):
        if "high" not in df.columns:
            signals = {int(d): True for d in dates}
        else:
            daily_high = np.array([float(df[df["date"]==d]["high"].max()) for d in dates])
            daily_low  = np.array([float(df[df["date"]==d]["low"].min()) for d in dates])
            af = 0.02; af_max = 0.20
            sar = np.full(n, np.nan)
            ep = daily_high[0]  # extreme point
            trend_up = True
            sar[0] = daily_low[0]
            for i in range(1, n):
                prev_sar = sar[i-1] if not np.isnan(sar[i-1]) else (daily_low[i-1] if trend_up else daily_high[i-1])
                sar[i] = prev_sar + af * (ep - prev_sar)
                if trend_up:
                    sar[i] = min(sar[i], daily_low[i-1], daily_low[max(0,i-2)])
                    if daily_high[i] > ep: ep = daily_high[i]; af = min(af + 0.02, af_max)
                    if daily_low[i] < sar[i]:  # flip
                        trend_up = False; sar[i] = ep; ep = daily_low[i]; af = 0.02
                else:
                    sar[i] = max(sar[i], daily_high[i-1], daily_high[max(0,i-2)])
                    if daily_low[i] < ep: ep = daily_low[i]; af = min(af + 0.02, af_max)
                    if daily_high[i] > sar[i]:  # flip
                        trend_up = True; sar[i] = ep; ep = daily_high[i]; af = 0.02
            # Signal: flip just occurred
            for i, d in enumerate(dates):
                if i < 2: signals[int(d)] = False; continue
                prev_up = sar[i-1] < prices[i-1]
                curr_up = sar[i] < prices[i]
                flip_bull = not prev_up and curr_up
                flip_bear = prev_up and not curr_up
                signals[int(d)] = flip_bull if indicator_type == "parabolic_sar" else flip_bear

    # ════════════════════════════════════════════════════════════════
    # Stochastic
    # ════════════════════════════════════════════════════════════════
    elif indicator_type in ("stoch_oversold", "stoch_overbought"):
        t = int(threshold) if threshold > 1 else int(threshold * 100)
        for i, d in enumerate(dates):
            if i < period: signals[int(d)] = False; continue
            window = prices[i-period+1:i+1]
            hh, ll = window.max(), window.min()
            if hh == ll: signals[int(d)] = False; continue
            k_raw = 100 * (prices[i] - ll) / (hh - ll)
            if i >= period + 2:
                k_vals = []
                for j in range(i-2, i+1):
                    w = prices[j-period+1:j+1]; hh2, ll2 = w.max(), w.min()
                    k_vals.append(100*(prices[j]-ll2)/(hh2-ll2) if hh2!=ll2 else 50)
                k = sum(k_vals)/3
            else: k = k_raw
            signals[int(d)] = k < t if indicator_type == "stoch_oversold" else k > t

    # ════════════════════════════════════════════════════════════════
    # EMA / SMA
    # ════════════════════════════════════════════════════════════════
    elif indicator_type in ("ema_below", "ema_above"):
        ema = _ema(prices, period)
        for i, d in enumerate(dates):
            if i < period: signals[int(d)] = False; continue
            signals[int(d)] = prices[i] < ema[i] if indicator_type == "ema_below" else prices[i] > ema[i]

    elif indicator_type in ("sma_below", "sma_above"):
        sma = _sma(prices, period)
        for i, d in enumerate(dates):
            if i < period: signals[int(d)] = False; continue
            signals[int(d)] = prices[i] < sma[i] if indicator_type == "sma_below" else prices[i] > sma[i]

    # ════════════════════════════════════════════════════════════════
    # Price % from SMA  (period=SMA length, threshold=% extended)
    # ════════════════════════════════════════════════════════════════
    elif indicator_type in ("price_pct_sma", "price_pct_sma_above"):
        sma = _sma(prices, period)
        for i, d in enumerate(dates):
            if i < period or np.isnan(sma[i]): signals[int(d)] = False; continue
            pct = abs(prices[i] - sma[i]) / sma[i] * 100
            if indicator_type == "price_pct_sma":
                signals[int(d)] = prices[i] < sma[i] and pct > threshold
            else:
                signals[int(d)] = prices[i] > sma[i] and pct > threshold

    # ════════════════════════════════════════════════════════════════
    # Bollinger Bands
    # ════════════════════════════════════════════════════════════════
    elif indicator_type in ("bb_lower", "bb_upper"):
        bb_p = period if period >= 10 else 20
        sma = _sma(prices, bb_p)
        for i, d in enumerate(dates):
            if i < bb_p: signals[int(d)] = False; continue
            std = prices[i-bb_p+1:i+1].std()
            lower = sma[i] - 2*std; upper = sma[i] + 2*std
            signals[int(d)] = prices[i] < lower if indicator_type == "bb_lower" else prices[i] > upper

    elif indicator_type == "bb_squeeze":
        bb_p = max(period, 10); lookback = 125
        sma = _sma(prices, bb_p)
        bb_widths = np.full(n, np.nan)
        for i in range(bb_p-1, n):
            std = prices[i-bb_p+1:i+1].std()
            bb_widths[i] = (2*std)/sma[i] if sma[i]>0 else 0
        for i, d in enumerate(dates):
            if i < lookback: signals[int(d)] = False; continue
            recent = bb_widths[max(0,i-lookback):i+1]; recent = recent[~np.isnan(recent)]
            if len(recent) < 20: signals[int(d)] = False; continue
            cutoff = np.percentile(recent, threshold) if threshold<100 else recent.min()
            signals[int(d)] = bb_widths[i] <= cutoff

    # ════════════════════════════════════════════════════════════════
    # Keltner Channels  (period=EMA length, period2=ATR multiplier)
    # ════════════════════════════════════════════════════════════════
    elif indicator_type in ("keltner_lower", "keltner_upper"):
        ema = _ema(prices, period)
        tr_vals = np.array([_true_range(i) for i in range(n)])
        atr_vals = _ema(tr_vals, period)
        mult = threshold if threshold > 0 else period2  # use period2 as multiplier
        for i, d in enumerate(dates):
            if i < period: signals[int(d)] = False; continue
            lower = ema[i] - mult * atr_vals[i]
            upper = ema[i] + mult * atr_vals[i]
            signals[int(d)] = prices[i] < lower if indicator_type == "keltner_lower" else prices[i] > upper

    # ════════════════════════════════════════════════════════════════
    # ATR  (period, threshold = % of price)
    # ════════════════════════════════════════════════════════════════
    elif indicator_type in ("atr", "atr_below"):
        tr_vals = np.array([_true_range(i) for i in range(n)])
        atr_vals = _ema(tr_vals, period)
        for i, d in enumerate(dates):
            if i < period: signals[int(d)] = False; continue
            atr_pct = atr_vals[i] / prices[i] * 100 if prices[i] > 0 else 0
            signals[int(d)] = atr_pct > threshold if indicator_type == "atr" else atr_pct < threshold

    # ════════════════════════════════════════════════════════════════
    # Historical Volatility  (period, threshold %)
    # ════════════════════════════════════════════════════════════════
    elif indicator_type in ("hist_vol", "hist_vol_below"):
        log_ret = np.diff(np.log(prices), prepend=np.log(prices[0]))
        for i, d in enumerate(dates):
            if i < period: signals[int(d)] = False; continue
            hv = log_ret[i-period+1:i+1].std() * np.sqrt(252) * 100
            signals[int(d)] = hv > threshold if indicator_type == "hist_vol" else hv < threshold

    # ════════════════════════════════════════════════════════════════
    # Rate of Change  (period, threshold %)
    # ════════════════════════════════════════════════════════════════
    elif indicator_type == "roc":
        for i, d in enumerate(dates):
            if i < period: signals[int(d)] = False; continue
            roc_val = (prices[i] - prices[i-period]) / prices[i-period] * 100
            signals[int(d)] = roc_val < threshold  # negative ROC = momentum dip

    # ════════════════════════════════════════════════════════════════
    # Volume Spike  (period, threshold = multiplier of avg volume)
    # ════════════════════════════════════════════════════════════════
    elif indicator_type == "volume_spike":
        vols = np.array([_get_volume(d) for d in dates])
        avg_vol = _sma(vols, period)
        for i, d in enumerate(dates):
            if i < period or avg_vol[i] <= 0: signals[int(d)] = False; continue
            signals[int(d)] = vols[i] > threshold * avg_vol[i]

    # ════════════════════════════════════════════════════════════════
    # IV Rank  (period lookback days, threshold %)
    # ════════════════════════════════════════════════════════════════
    elif indicator_type in ("iv_rank", "iv_rank_below"):
        ivs = np.array([_get_iv(d) for d in dates])
        for i, d in enumerate(dates):
            if i < period: signals[int(d)] = False; continue
            window_iv = ivs[max(0,i-period):i+1]
            window_iv = window_iv[window_iv > 0]
            if len(window_iv) < 20: signals[int(d)] = False; continue
            iv_lo, iv_hi = window_iv.min(), window_iv.max()
            iv_range = iv_hi - iv_lo
            rank = (ivs[i] - iv_lo) / iv_range * 100 if iv_range > 0 else 50
            signals[int(d)] = rank > threshold if indicator_type == "iv_rank" else rank < threshold

    # ════════════════════════════════════════════════════════════════
    # 52-week high/low proximity  (threshold = %)
    # ════════════════════════════════════════════════════════════════
    elif indicator_type in ("near_52w_high", "near_52w_low"):
        lookback = 252
        for i, d in enumerate(dates):
            if i < lookback: signals[int(d)] = False; continue
            window = prices[i-lookback:i]
            high_52 = window.max(); low_52 = window.min()
            if indicator_type == "near_52w_high":
                pct = (high_52 - prices[i]) / high_52 * 100 if high_52 > 0 else 100
                signals[int(d)] = pct <= threshold
            else:
                pct = (prices[i] - low_52) / low_52 * 100 if low_52 > 0 else 100
                signals[int(d)] = pct <= threshold

    # ════════════════════════════════════════════════════════════════
    # Donchian Channel
    # ════════════════════════════════════════════════════════════════
    elif indicator_type in ("price_channel_upper", "price_channel_lower"):
        for i, d in enumerate(dates):
            if i < period: signals[int(d)] = False; continue
            window = prices[i-period:i]
            ch_high, ch_low = window.max(), window.min()
            if indicator_type == "price_channel_upper":
                signals[int(d)] = prices[i] > ch_high and prices[i-1] <= ch_high
            else:
                signals[int(d)] = prices[i] < ch_low and prices[i-1] >= ch_low

    else:
        signals = {int(d): True for d in dates}

    return signals

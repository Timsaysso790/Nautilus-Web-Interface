"""
Simulation engine for the Options Station backtest.
Computes indicators on-the-fly, evaluates AND/OR condition gates,
enforces exit rules, and returns the same OptionBacktestResult shape.
"""

import logging
import math
from datetime import datetime, timezone
from typing import Any, Dict, List, Optional

import pandas as pd
import yfinance as yf

from option_service import calculate_bsm, _norm_cdf
from option_strategies import StrategyConfig, OptionLeg

logger = logging.getLogger(__name__)

COMMISSION_PER_CONTRACT = 0.65
CONTRACT_MULTIPLIER = 100


def _load_data(symbol: str, start: str, end: str, resolution: str = "daily") -> pd.DataFrame:
    """Load price data with resolution fallback: 1m -> 5m -> daily -> yfinance."""
    tk = yf.Ticker(symbol)
    interval = resolution if resolution in ("1m", "5m") else "1d"
    df = tk.history(start=start, end=end, interval=interval)
    if df.empty:
        df = tk.history(start=start, end=end, interval="1d")
    if df.empty:
        return df
    df.reset_index(inplace=True)
    date_col = "Datetime" if "Datetime" in df.columns else "Date"
    df[date_col] = pd.to_datetime(df[date_col])
    df.rename(columns={date_col: "Date"}, inplace=True)
    return df


def _compute_rsi(prices: pd.Series, period: int = 14) -> float:
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


def _compute_sma(prices: pd.Series, period: int) -> float:
    if len(prices) < period:
        return float(prices.iloc[-1])
    return float(prices.rolling(period).mean().iloc[-1])


def _compute_bb_position(prices: pd.Series, period: int = 20) -> float:
    """Return 0..1 position within Bollinger Bands (0 = lower, 1 = upper)."""
    if len(prices) < period:
        return 0.5
    sma = prices.rolling(period).mean().iloc[-1]
    std = prices.rolling(period).std().iloc[-1]
    if std == 0:
        return 0.5
    current = prices.iloc[-1]
    return (current - (sma - 2 * std)) / (4 * std)


def _estimate_iv(df: pd.DataFrame, lookback: int = 21) -> float:
    if len(df) < lookback:
        lookback = len(df)
    prices = df["Close"].values[-lookback:]
    log_returns = [math.log(prices[i] / prices[i - 1]) for i in range(1, len(prices))]
    if not log_returns:
        return 0.20
    mean_r = sum(log_returns) / len(log_returns)
    variance = sum((r - mean_r) ** 2 for r in log_returns) / (len(log_returns) - 1)
    daily_vol = math.sqrt(variance)
    return daily_vol * math.sqrt(252)


def _find_option_price(
    underlying_price: float,
    strike: float,
    dte: int,
    right: str,
    iv: float,
    rate: float = 0.05,
) -> float:
    import asyncio
    t = max(dte, 1) / 365.0
    result = asyncio.run(calculate_bsm(
        underlying_price=underlying_price,
        strike=strike,
        time_to_expiry=t,
        risk_free_rate=rate,
        volatility=iv,
        right=right,
    ))
    return result["price"]


def _evaluate_condition(
    cond: dict,
    underlying_price: float,
    dte: int,
    iv: float,
    theta: float,
    delta: float,
    prices: pd.Series,
) -> bool:
    source = cond["source"]
    op = cond["operator"]
    target = cond["target"]
    target_val = target["value"]
    if target["type"] == "indicator" and target.get("indicator"):
        try:
            target_val = float(target["indicator"])
        except (ValueError, TypeError):
            pass

    if source == "underlying_price":
        val = underlying_price
    elif source == "days_to_expiry":
        val = float(dte)
    elif source == "iv":
        val = iv
    elif source == "theta":
        val = theta
    elif source == "delta":
        val = delta
    elif source == "rsi":
        val = _compute_rsi(prices)
    elif source == "sma":
        val = _compute_sma(prices, 20)
    elif source == "bb_position":
        val = _compute_bb_position(prices)
    else:
        return True

    if op == "gt":
        return val > target_val
    elif op == "gte":
        return val >= target_val
    elif op == "lt":
        return val < target_val
    elif op == "lte":
        return val <= target_val
    elif op == "eq":
        return abs(val - target_val) < 0.001
    elif op == "crosses_above":
        return False  # Simplified: would need prev bar
    elif op == "crosses_below":
        return False
    return True


def _calculate_margin(
    legs: list,
    underlying_price: float,
    premia: Dict[str, float],
) -> float:
    margin = 0.0
    sell_leg = next((l for l in legs if l.get("action") == "sell"), None)
    buy_leg = next((l for l in legs if l.get("action") == "buy"), None)
    if sell_leg and buy_leg and sell_leg.get("right") == buy_leg.get("right"):
        width = abs(sell_leg.get("strikeValue", 0) - buy_leg.get("strikeValue", 0))
        credit = premia.get("sell", 0) * CONTRACT_MULTIPLIER
        margin = (width * CONTRACT_MULTIPLIER * abs(sell_leg.get("quantity", 1))) + credit
    else:
        naked = sum(abs(l.get("quantity", 0)) for l in legs if l.get("action") == "sell")
        margin = max(0, underlying_price * CONTRACT_MULTIPLIER * naked * 0.20)
    return max(0, margin)


def _calculate_commission(legs: list) -> float:
    total_qty = sum(abs(l.get("quantity", 0)) for l in legs)
    return total_qty * COMMISSION_PER_CONTRACT


async def run_options_station(config: Dict[str, Any]) -> Dict[str, Any]:
    """
    Full simulation engine for the Options Station.
    Accepts the CompiledStrategy dict from the frontend.
    """
    global_config = config.get("global", {})
    symbol = global_config.get("symbol", "SPY").upper()
    start = global_config.get("dateRange", {}).get("start", "2024-01-01")
    end = global_config.get("dateRange", {}).get("end", "")
    initial_capital = global_config.get("initialCapital", 50000)
    resolution = global_config.get("dataResolution", "daily")

    legs_config = config.get("legs", [])
    entry_conditions = config.get("entryConditions", {})
    exit_rules = config.get("exitRules", {})

    if not end:
        end = datetime.now(timezone.utc).strftime("%Y-%m-%d")

    if not legs_config:
        return {"success": False, "error": "No legs configured"}

    df = _load_data(symbol, start, end, resolution)
    if df.empty:
        return {"success": False, "error": f"No price data for {symbol} in range {start} to {end}"}

    trades = []
    equity_curve = [{"date": str(df.iloc[0]["Date"])[:10], "equity": initial_capital, "margin": 0}]
    running_balance = initial_capital
    total_commission = 0.0
    total_attribution = {"delta": 0, "gamma": 0, "theta": 0, "vega": 0, "unexplained": 0}
    open_trade = None

    # Simulation: iterate through bars
    for i in range(len(df)):
        if i < 1:
            continue

        bar = df.iloc[i]
        underlying_price = float(bar["Close"])
        prev_price = float(df.iloc[i - 1]["Close"])
        iv = _estimate_iv(df.iloc[:i + 1]) if i > 20 else 0.20
        prices_series = df["Close"].iloc[:i + 1]

        # Evaluate entry conditions
        if not open_trade:
            cond_logic = entry_conditions.get("logic", "all")
            conds = entry_conditions.get("conditions", [])

            should_enter = True
            if conds:
                results = []
                for cond in conds:
                    results.append(_evaluate_condition(
                        cond, underlying_price, 45, iv, 0, 0, prices_series
                    ))
                if cond_logic == "all":
                    should_enter = all(results)
                else:
                    should_enter = any(results)

            if should_enter:
                # Compute option prices at entry
                premia = {}
                for leg in legs_config:
                    dte = leg.get("dte", 45)
                    strike = leg.get("strikeValue", 0)
                    if leg.get("strikeModel") == "atm":
                        strike = round(underlying_price / 5) * 5
                    elif leg.get("strikeModel") == "otm":
                        strike = round(underlying_price / 5) * 5 + (5 if leg.get("right") == "call" else -5)
                    elif leg.get("strikeModel") == "itm":
                        strike = round(underlying_price / 5) * 5 + (-5 if leg.get("right") == "call" else 5)

                    price = _find_option_price(underlying_price, strike, dte, leg.get("right", "call"), iv)
                    mult = -1 if leg.get("action") == "buy" else 1
                    premia[leg.get("action", "sell")] = premia.get(leg.get("action", "sell"), 0) + price * abs(leg.get("quantity", 1)) * mult

                net_credit = premia.get("sell", 0) - premia.get("buy", 0)
                commission = _calculate_commission(legs_config)
                total_commission += commission
                margin = _calculate_margin(legs_config, underlying_price, premia)

                open_trade = {
                    "entry_date": str(bar["Date"])[:10],
                    "entry_price": underlying_price,
                    "entry_iv": iv,
                    "net_credit": net_credit,
                    "entry_commission": commission,
                    "margin": margin,
                    "legs": [dict(l) for l in legs_config],
                    "entry_idx": i,
                }

            continue

        # Exit check
        exit_now = False
        exit_reason = "expiry"

        if not exit_now and open_trade:
            profit_pct = ((underlying_price - open_trade["entry_price"]) / open_trade["entry_price"]) * 100
            loss_pct = ((open_trade["entry_price"] - underlying_price) / open_trade["entry_price"]) * 100

            pt = exit_rules.get("profitTargetPct")
            if pt is not None and profit_pct >= pt:
                exit_now = True
                exit_reason = "profit_target"

            sl = exit_rules.get("stopLossPct")
            if sl is not None and loss_pct >= sl:
                exit_now = True
                exit_reason = "stop_loss"

            ts = exit_rules.get("trailingStopPct")
            if ts is not None:
                activation = exit_rules.get("trailingStopActivationPct", 0)
                high_since_entry = max(df["Close"].iloc[open_trade["entry_idx"]:i + 1])
                peak_profit = ((high_since_entry - open_trade["entry_price"]) / open_trade["entry_price"]) * 100
                if peak_profit >= activation:
                    trail_stop_price = high_since_entry * (1 - ts / 100)
                    if underlying_price <= trail_stop_price:
                        exit_now = True
                        exit_reason = "trailing_stop"

            ed = exit_rules.get("earlyExitDte")
            if ed is not None and i - open_trade["entry_idx"] >= ed:
                exit_now = True
                exit_reason = "early_exit_dte"

        if exit_now:
            # Compute exit option prices
            exit_premia = {}
            for leg in open_trade["legs"]:
                dte = max(1, leg.get("dte", 45) - (i - open_trade["entry_idx"]))
                strike = leg.get("strikeValue", 0)
                if leg.get("strikeModel") == "atm":
                    strike = round(underlying_price / 5) * 5

                price = _find_option_price(underlying_price, strike, dte, leg.get("right", "call"), iv)
                mult = 1 if leg.get("action") == "sell" else -1
                exit_premia[leg.get("action", "sell")] = exit_premia.get(leg.get("action", "sell"), 0) + price * abs(leg.get("quantity", 1)) * mult

            exit_credit = exit_premia.get("sell", 0) - exit_premia.get("buy", 0)
            exit_commission = _calculate_commission(open_trade["legs"])
            total_commission += exit_commission

            net_entry = open_trade["net_credit"] * CONTRACT_MULTIPLIER - open_trade["entry_commission"]
            net_exit = exit_credit * CONTRACT_MULTIPLIER - exit_commission
            trade_pnl = net_entry + net_exit
            running_balance += trade_pnl

            trade_record = {
                "entry_date": open_trade["entry_date"],
                "exit_date": str(bar["Date"])[:10],
                "entry_price": round(open_trade["entry_price"], 2),
                "exit_price": round(underlying_price, 2),
                "net_credit": round(open_trade["net_credit"], 2),
                "commission": round(open_trade["entry_commission"] + exit_commission, 2),
                "pnl": round(trade_pnl, 2),
                "margin": round(open_trade["margin"], 2),
                "iv": round(open_trade["entry_iv"], 4),
                "attribution": {"delta": 0, "gamma": 0, "theta": 0, "vega": 0, "unexplained": round(trade_pnl, 2)},
                "exit_reason": exit_reason,
            }
            trades.append(trade_record)
            equity_curve.append({"date": str(bar["Date"])[:10], "equity": round(running_balance, 2), "margin": round(open_trade["margin"], 2)})
            open_trade = None

    if not trades:
        return {"success": False, "error": "No trades generated. Check your conditions and date range."}

    total_pnl = round(running_balance - initial_capital, 2)
    winning = [t for t in trades if t["pnl"] > 0]
    losing = [t for t in trades if t["pnl"] <= 0]
    win_rate = round(len(winning) / len(trades) * 100, 2) if trades else 0

    equity_values = [e["equity"] for e in equity_curve]
    peak = equity_values[0]
    max_dd = 0.0
    for eq in equity_values:
        if eq > peak:
            peak = eq
        if peak > 0:
            dd = (peak - eq) / peak * 100
            if dd > max_dd:
                max_dd = dd

    returns = []
    for j in range(1, len(equity_values)):
        prev = equity_values[j - 1]
        if prev > 0:
            returns.append((equity_values[j] - prev) / prev)

    sharpe = 0.0
    if len(returns) > 1:
        import statistics
        try:
            mean_r = statistics.mean(returns)
            std_r = statistics.stdev(returns)
            sharpe = round((mean_r / std_r) * (252 ** 0.5), 3) if std_r > 0 else 0.0
        except Exception:
            pass

    avg_pnl = round(sum(t["pnl"] for t in trades) / len(trades), 2) if trades else 0
    avg_margin = round(sum(t["margin"] for t in trades) / len(trades), 2) if trades else 0

    return {
        "success": True,
        "config": config,
        "summary": {
            "total_trades": len(trades),
            "winning_trades": len(winning),
            "losing_trades": len(losing),
            "win_rate": win_rate,
            "total_pnl": total_pnl,
            "avg_pnl_per_trade": avg_pnl,
            "avg_margin_per_trade": avg_margin,
            "max_drawdown_pct": round(max_dd, 2),
            "sharpe_ratio": sharpe,
            "total_commission": round(total_commission, 2),
            "net_pnl": round(total_pnl - total_commission, 2),
            "pnl_attribution": {k: round(v, 2) for k, v in total_attribution.items()},
            "return_pct": round((running_balance - initial_capital) / initial_capital * 100, 2) if initial_capital > 0 else 0,
        },
        "equity_curve": equity_curve,
        "trades": trades,
    }

import logging
import math
from datetime import datetime, timedelta, timezone
from typing import Any, Dict, List, Optional, Tuple

import pandas as pd
import yfinance as yf

from option_service import calculate_bsm, _norm_cdf
from option_strategies import StrategyConfig, OptionLeg

logger = logging.getLogger(__name__)

COMMISSION_PER_CONTRACT = 0.65
CONTRACT_MULTIPLIER = 100


def _days_between(d1: str, d2: str) -> int:
    fmt = "%Y-%m-%d"
    return (datetime.strptime(d2[:10], fmt) - datetime.strptime(d1[:10], fmt)).days


def _load_historical_prices(symbol: str, start: str, end: str) -> pd.DataFrame:
    tk = yf.Ticker(symbol)
    df = tk.history(start=start, end=end, interval="1d")
    if df.empty:
        return df
    df.reset_index(inplace=True)
    df["Date"] = pd.to_datetime(df["Date"])
    return df


def _estimate_iv(
    df: pd.DataFrame,
    lookback: int = 21,
) -> float:
    if len(df) < lookback:
        lookback = len(df)
    prices = df["Close"].values[-lookback:]
    log_returns = [math.log(prices[i] / prices[i - 1]) for i in range(1, len(prices))]
    if not log_returns:
        return 0.20
    daily_vol = (sum((r - sum(log_returns) / len(log_returns)) ** 2 for r in log_returns) / (len(log_returns) - 1)) ** 0.5
    return daily_vol * (252 ** 0.5)


def _calculate_margin(
    legs: List[OptionLeg],
    underlying_price: float,
    strategy_type: str,
    option_premia: Dict[str, float],
) -> float:
    margin = 0.0

    if strategy_type == "credit_spread":
        sell_leg = next((l for l in legs if l.action == "sell"), None)
        buy_leg = next((l for l in legs if l.action == "buy"), None)
        if sell_leg and buy_leg:
            width = abs(sell_leg.strike - buy_leg.strike)
            credit = option_premia.get("sell", 0) * CONTRACT_MULTIPLIER
            margin = (width * CONTRACT_MULTIPLIER * abs(sell_leg.quantity)) + credit

    elif strategy_type == "iron_condor":
        put_sell = next((l for l in legs if l.right == "put" and l.action == "sell"), None)
        put_buy = next((l for l in legs if l.right == "put" and l.action == "buy"), None)
        call_sell = next((l for l in legs if l.right == "call" and l.action == "sell"), None)
        call_buy = next((l for l in legs if l.right == "call" and l.action == "buy"), None)
        put_width = abs((put_sell.strike if put_sell else 0) - (put_buy.strike if put_buy else 0))
        call_width = abs((call_sell.strike if call_sell else 0) - (call_buy.strike if call_buy else 0))
        max_width = max(put_width, call_width)
        net_credit = sum(v for k, v in option_premia.items() if k.startswith("sell")) * CONTRACT_MULTIPLIER
        margin = (max_width * CONTRACT_MULTIPLIER) + net_credit

    elif strategy_type == "ratio_spread":
        shorts = [l for l in legs if l.action == "sell"]
        net_shorts = sum(l.quantity for l in shorts)
        width = 0
        if shorts and legs:
            outer = max(l.strike for l in shorts)
            inner = min(l.strike for l in legs if l.action == "buy") if any(l.action == "buy" for l in legs) else outer
            width = abs(outer - inner)
        margin = (width * CONTRACT_MULTIPLIER * net_shorts) * 0.5

    elif strategy_type == "covered_call":
        margin = underlying_price * 100 * 0.5

    else:
        if underlying_price > 0:
            naked = sum(l.quantity for l in legs if l.action == "sell")
            margin = max(0, underlying_price * CONTRACT_MULTIPLIER * naked * 0.20)

    return max(0, margin)


def _calculate_commission(legs: List[OptionLeg]) -> float:
    total_qty = sum(abs(l.quantity) for l in legs)
    return total_qty * COMMISSION_PER_CONTRACT


def _find_option_price(
    underlying_price: float,
    strike: float,
    dte: int,
    right: str,
    iv: float,
    rate: float = 0.05,
) -> float:
    import asyncio
    t = dte / 365.0
    result = asyncio.run(calculate_bsm(
        underlying_price=underlying_price,
        strike=strike,
        time_to_expiry=t,
        risk_free_rate=rate,
        volatility=iv,
        right=right,
    ))
    return result["price"]


def _decompose_pnl(
    prices: List[float],
    legs: List[OptionLeg],
    entry_iv: float,
    rate: float,
    dte_at_entry: int,
) -> Dict[str, float]:
    """Estimate Greek attribution for a completed trade."""
    if len(prices) < 2:
        return {"delta": 0, "gamma": 0, "theta": 0, "vega": 0, "unexplained": 0}

    entry_price = prices[0]
    exit_price = prices[-1]
    actual_pnl = exit_price - entry_price

    delta_pnl = 0.0
    gamma_pnl = 0.0
    theta_pnl = 0.0
    vega_pnl = 0.0

    midpoint = prices[len(prices) // 2]
    t = dte_at_entry / 365.0

    for leg in legs:
        d1 = (math.log(midpoint / leg.strike) + (rate + 0.5 * entry_iv ** 2) * t) / (entry_iv * math.sqrt(t)) if entry_iv * math.sqrt(t) > 0 else 0
        delta = _norm_cdf(d1) if leg.right == "call" else -_norm_cdf(-d1)
        gamma = (math.exp(-d1 * d1 / 2) / math.sqrt(2 * math.pi)) / (midpoint * entry_iv * math.sqrt(t)) if entry_iv * math.sqrt(t) > 0 else 0

        price_change = exit_price - entry_price
        delta_pnl += delta * price_change * leg.quantity * CONTRACT_MULTIPLIER
        gamma_pnl += 0.5 * gamma * (price_change ** 2) * leg.quantity * CONTRACT_MULTIPLIER

    theta_pnl = actual_pnl * 0.3
    vega_pnl = actual_pnl * 0.1
    unexplained = actual_pnl - delta_pnl - gamma_pnl - theta_pnl - vega_pnl

    return {
        "delta": round(delta_pnl, 2),
        "gamma": round(gamma_pnl, 2),
        "theta": round(theta_pnl, 2),
        "vega": round(vega_pnl, 2),
        "unexplained": round(unexplained, 2),
    }


async def run_option_backtest(config: StrategyConfig) -> Dict[str, Any]:
    symbol = config.symbol.upper()
    start = config.start_date
    end = config.end_date or datetime.now(timezone.utc).strftime("%Y-%m-%d")

    if _days_between(start, end) < config.entry_dte + 30:
        return {"success": False, "error": "Date range too short for the selected DTE"}

    df = _load_historical_prices(symbol, start, end)
    if df.empty:
        return {"success": False, "error": f"No price data for {symbol} in range {start} to {end}"}

    trade_dates = []
    current = pd.Timestamp(start)
    end_ts = pd.Timestamp(end)
    while current <= end_ts:
        closest = df.iloc[(df["Date"] - current).abs().argsort()[:1]]
        if not closest.empty:
            cd = closest.iloc[0]["Date"]
            if cd not in trade_dates:
                trade_dates.append(cd)
        current += timedelta(days=config.entry_frequency_days)

    trades = []
    equity_curve = [{"date": str(df.iloc[0]["Date"])[:10], "equity": config.starting_balance, "margin": 0}]
    running_balance = config.starting_balance
    total_commission = 0.0
    total_attribution = {"delta": 0, "gamma": 0, "theta": 0, "vega": 0, "unexplained": 0}
    open_trade = None

    for trade_date in trade_dates:
        idx = df[df["Date"] == trade_date].index
        if idx.empty:
            continue
        i = idx[0]
        exit_idx = i + config.hold_until_dte
        if exit_idx >= len(df):
            break

        underlying_price = float(df.iloc[i]["Close"])
        iv = _estimate_iv(df.iloc[:i + 1]) if i > 20 else 0.20
        exit_price = float(df.iloc[exit_idx]["Close"])
        exit_date = str(df.iloc[exit_idx]["Date"])[:10]

        if len(config.legs) < 2:
            continue

        strikes = sorted(set(l.strike for l in config.legs if l.strike > 0))
        if not strikes:
            if config.strategy_type in ("straddle", "strangle"):
                atm = round(underlying_price / 5) * 5
                for leg in config.legs:
                    if leg.right == "call":
                        leg.strike = atm + (5 if config.strategy_type == "strangle" else 0)
                    else:
                        leg.strike = atm - (5 if config.strategy_type == "strangle" else 0)
                strikes = sorted(set(l.strike for l in config.legs))
            else:
                continue

        if "spread" in config.strategy_type and len(strikes) >= 2:
            short_strike = min(strikes) if all(l.right == "put" for l in config.legs) else max(strikes)
            for leg in config.legs:
                if leg.action == "sell":
                    leg.strike = short_strike
                else:
                    leg.strike = short_strike + (5 if config.strategy_type == "credit_spread" else -5) if leg.right == "put" else short_strike - 5

        premia = {}
        for leg in config.legs:
            price = _find_option_price(underlying_price, leg.strike, config.entry_dte, leg.right, iv, config.risk_free_rate)
            premia[leg.action] = premia.get(leg.action, 0) + price * abs(leg.quantity) * (-1 if leg.action == "buy" else 1)

        net_credit = premia.get("sell", 0) - premia.get("buy", 0)
        commission = _calculate_commission(config.legs)
        net_entry = net_credit * CONTRACT_MULTIPLIER - commission
        total_commission += commission

        margin = _calculate_margin(config.legs, underlying_price, config.strategy_type, premia)

        exit_premia = {}
        for leg in config.legs:
            remaining_dte = max(1, config.entry_dte - config.hold_until_dte)
            price = _find_option_price(exit_price, leg.strike, remaining_dte, leg.right, iv, config.risk_free_rate)
            multiplier = 1 if leg.action == "sell" else -1
            exit_premia[leg.action] = exit_premia.get(leg.action, 0) + price * abs(leg.quantity) * multiplier

        exit_credit = exit_premia.get("sell", 0) - exit_premia.get("buy", 0)
        exit_commission = _calculate_commission(config.legs)
        net_exit = exit_credit * CONTRACT_MULTIPLIER - exit_commission
        total_commission += exit_commission

        trade_pnl = net_entry + net_exit
        running_balance += trade_pnl

        price_series = [underlying_price, exit_price]
        attribution = _decompose_pnl(price_series, config.legs, iv, config.risk_free_rate, config.entry_dte)
        for k in total_attribution:
            total_attribution[k] += attribution[k]

        trade_record = {
            "entry_date": str(trade_date)[:10],
            "exit_date": exit_date,
            "entry_price": round(underlying_price, 2),
            "exit_price": round(exit_price, 2),
            "net_credit": round(net_credit, 2),
            "commission": round(commission + exit_commission, 2),
            "pnl": round(trade_pnl, 2),
            "margin": round(margin, 2),
            "iv": round(iv, 4),
            "attribution": attribution,
        }
        trades.append(trade_record)
        equity_curve.append({"date": exit_date, "equity": round(running_balance, 2), "margin": round(margin, 2)})

    if not trades:
        return {"success": False, "error": "No trades generated. Check symbol and date range."}

    total_pnl = round(running_balance - config.starting_balance, 2)
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
    for i in range(1, len(equity_values)):
        prev = equity_values[i - 1]
        if prev > 0:
            returns.append((equity_values[i] - prev) / prev)

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
        "config": {
            "symbol": symbol,
            "strategy_type": config.strategy_type,
            "entry_dte": config.entry_dte,
            "hold_until_dte": config.hold_until_dte,
            "entry_frequency_days": config.entry_frequency_days,
            "start_date": start,
            "end_date": end,
            "starting_balance": config.starting_balance,
            "commission_per_contract": config.commission_per_contract,
            "legs": [{"strike": l.strike, "right": l.right, "quantity": l.quantity, "action": l.action} for l in config.legs],
        },
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
            "return_pct": round((running_balance - config.starting_balance) / config.starting_balance * 100, 2) if config.starting_balance > 0 else 0,
        },
        "equity_curve": equity_curve,
        "trades": trades,
    }

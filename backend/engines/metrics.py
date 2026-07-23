"""
Advanced options backtest metrics computation module.
Sharpe, Sortino, Calmar, drawdown profile, regime analysis, etc.
"""
import math
from typing import Any, Dict, List, Optional, Tuple


def compute_sharpe(returns: List[float], risk_free_rate: float = 0.05) -> float:
    """Annualized Sharpe ratio from a series of periodic returns."""
    if len(returns) < 2:
        return 0.0
    mean_r = sum(returns) / len(returns)
    var = sum((r - mean_r) ** 2 for r in returns) / (len(returns) - 1)
    if var < 1e-12:
        return 0.0  # flat equity curve — no volatility to measure
    std = math.sqrt(var)
    daily_rf = risk_free_rate / 252
    return (mean_r - daily_rf) / std * math.sqrt(252)


def compute_sortino(returns: List[float], risk_free_rate: float = 0.05) -> float:
    """Annualized Sortino ratio — uses only downside deviation."""
    if len(returns) < 2:
        return 0.0
    mean_r = sum(returns) / len(returns)
    daily_rf = risk_free_rate / 252
    downside = [r - daily_rf for r in returns if r < daily_rf]
    if not downside:
        return mean_r * 252  # no downside → infinite, cap at linear return
    down_var = sum(d ** 2 for d in downside) / len(returns)
    if down_var < 1e-12:
        return 0.0
    down_std = math.sqrt(down_var)
    return (mean_r - daily_rf) / down_std * math.sqrt(252)


def compute_cagr(start_equity: float, end_equity: float, years: float) -> float:
    """Compound Annual Growth Rate."""
    if start_equity <= 0 or years <= 0:
        return 0.0
    return (end_equity / start_equity) ** (1 / years) - 1


def compute_calmar(cagr: float, max_drawdown_pct: float) -> float:
    """Calmar ratio = CAGR / Max Drawdown (as positive decimal)."""
    if max_drawdown_pct <= 0:
        return cagr * 100  # no drawdown → return CAGR as proxy
    return cagr / (max_drawdown_pct / 100)


def compute_drawdown_profile(equity_values: List[float]) -> Dict[str, Any]:
    """
    Compute detailed drawdown profile.
    Returns max_dd_pct, avg_dd_pct, dd_count, and list of drawdown events.
    Each event: {peak_idx, trough_idx, recovery_idx, peak_value, trough_value,
                 dd_pct, duration_days, recovery_days}
    """
    if not equity_values:
        return {"max_drawdown_pct": 0, "avg_drawdown_pct": 0, "drawdown_count": 0, "events": []}

    events = []
    peak_idx = 0
    peak_value = equity_values[0]
    trough_idx = 0
    trough_value = peak_value
    in_dd = False

    for i in range(1, len(equity_values)):
        v = equity_values[i]
        if v > peak_value:
            if in_dd:
                # Recovered — close out this drawdown event
                events.append({
                    "peak_idx": peak_idx,
                    "trough_idx": trough_idx,
                    "recovery_idx": i,
                    "peak_value": round(peak_value, 2),
                    "trough_value": round(trough_value, 2),
                    "dd_pct": round((peak_value - trough_value) / peak_value * 100, 2) if peak_value > 0 else 0,
                    "duration_days": trough_idx - peak_idx,
                    "recovery_days": i - trough_idx,
                })
                in_dd = False
            peak_value = v
            peak_idx = i
        elif v < trough_value:
            trough_value = v
            trough_idx = i
            in_dd = True

    # Close any open drawdown at end
    if in_dd:
        events.append({
            "peak_idx": peak_idx,
            "trough_idx": trough_idx,
            "recovery_idx": len(equity_values) - 1,
            "peak_value": round(peak_value, 2),
            "trough_value": round(trough_value, 2),
            "dd_pct": round((peak_value - trough_value) / peak_value * 100, 2) if peak_value > 0 else 0,
            "duration_days": trough_idx - peak_idx,
            "recovery_days": len(equity_values) - 1 - trough_idx,
        })

    if not events:
        return {"max_drawdown_pct": 0, "avg_drawdown_pct": 0, "drawdown_count": 0, "events": []}

    max_dd = max(e["dd_pct"] for e in events)
    avg_dd = sum(e["dd_pct"] for e in events) / len(events)
    return {
        "max_drawdown_pct": max_dd,
        "avg_drawdown_pct": round(avg_dd, 2),
        "drawdown_count": len(events),
        "events": events,
    }


def compute_payoff_ratio(trades: List[Dict]) -> float:
    """Average Win / Average Loss."""
    wins = [t["pnl"] for t in trades if t["pnl"] > 0]
    losses = [t["pnl"] for t in trades if t["pnl"] < 0]
    if not wins or not losses:
        return 0.0
    avg_win = sum(wins) / len(wins)
    avg_loss = abs(sum(losses) / len(losses))
    return round(avg_win / avg_loss, 2) if avg_loss > 0 else 0.0


def compute_expectancy(trades: List[Dict]) -> float:
    """Average P&L per trade including winners and losers."""
    if not trades:
        return 0.0
    return round(sum(t["pnl"] for t in trades) / len(trades), 2)


def compute_profit_factor(trades: List[Dict]) -> float:
    """Gross Profit / Gross Loss."""
    gross_profit = sum(t["pnl"] for t in trades if t["pnl"] > 0)
    gross_loss = abs(sum(t["pnl"] for t in trades if t["pnl"] < 0))
    if gross_loss == 0:
        return float("inf") if gross_profit > 0 else 0.0
    return round(gross_profit / gross_loss, 2)


def compute_regime_stats(
    trades: List[Dict],
    equity_curve: List[Dict],
    regime_data: Optional[List[Dict]] = None,
) -> Dict[str, Any]:
    """
    Break down performance by market regime.
    If regime_data is provided (list of {date, vix or sma200}), uses that.
    Otherwise estimates from equity curve periods.
    """
    if not trades:
        return {"regimes": {}}

    # Simple regime classification by trade period
    # In production, this would use VIX data from archive
    regimes = {}
    for t in trades:
        entry_month = t.get("entry_date", "")[:7]
        regime = "unknown"
        # Default: classify first half / second half of data
        # Placeholder for real VIX-based classification
        if "regime" not in regimes:
            regimes[regime] = {"trades": 0, "total_pnl": 0, "wins": 0, "losses": 0}
        r = regimes[regime]
        r["trades"] += 1
        r["total_pnl"] = r.get("total_pnl", 0) + t["pnl"]
        if t["pnl"] > 0:
            r["wins"] += 1
        else:
            r["losses"] += 1

    for regime, data in regimes.items():
        data["win_rate"] = round(data["wins"] / data["trades"] * 100, 1) if data["trades"] else 0
        data["total_pnl"] = round(data["total_pnl"], 2)

    return {"regimes": regimes}


def compute_all_metrics(
    trades: List[Dict],
    equity_curve: List[Dict],
    start_equity: float,
    end_equity: float,
    years: float,
    risk_free_rate: float = 0.05,
) -> Dict[str, Any]:
    """Compute all backtest metrics from trades and equity curve."""
    equity_values = [e["equity"] for e in equity_curve]
    returns = []
    for i in range(1, len(equity_values)):
        prev = equity_values[i - 1]
        if prev > 0:
            returns.append((equity_values[i] - prev) / prev)

    total_pnl = end_equity - start_equity
    winning = [t for t in trades if t["pnl"] > 0]
    losing = [t for t in trades if t["pnl"] <= 0]
    win_rate = len(winning) / len(trades) * 100 if trades else 0

    avg_win = round(sum(t["pnl"] for t in winning) / len(winning), 2) if winning else 0
    avg_loss = round(abs(sum(t["pnl"] for t in losing) / len(losing)), 2) if losing else 0

    sharpe = compute_sharpe(returns, risk_free_rate)
    sortino = compute_sortino(returns, risk_free_rate)
    cagr = compute_cagr(start_equity, end_equity, years)
    dd_profile = compute_drawdown_profile(equity_values)
    calmar = compute_calmar(cagr, dd_profile["max_drawdown_pct"])

    return {
        "total_trades": len(trades),
        "winning_trades": len(winning),
        "losing_trades": len(losing),
        "win_rate": round(win_rate, 1),
        "total_pnl": round(total_pnl, 2),
        "avg_pnl": round(sum(t["pnl"] for t in trades) / len(trades), 2) if trades else 0,
        "avg_win": avg_win,
        "avg_loss": avg_loss,
        "payoff_ratio": compute_payoff_ratio(trades),
        "profit_factor": compute_profit_factor(trades),
        "expectancy": compute_expectancy(trades),
        "sharpe_ratio": round(sharpe, 3),
        "sortino_ratio": round(sortino, 3),
        "calmar_ratio": round(calmar, 3),
        "cagr_pct": round(cagr * 100, 2),
        "total_return_pct": round((end_equity - start_equity) / start_equity * 100, 2) if start_equity > 0 else 0,
        "max_drawdown_pct": dd_profile["max_drawdown_pct"],
        "avg_drawdown_pct": dd_profile["avg_drawdown_pct"],
        "drawdown_count": dd_profile["drawdown_count"],
        "drawdown_events": dd_profile["events"],
        "avg_days_held": round(sum(t.get("days_held", 0) for t in trades) / len(trades), 1) if trades else 0,
    }

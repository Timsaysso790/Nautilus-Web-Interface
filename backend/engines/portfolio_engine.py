"""
Portfolio & Margin Backtest Engine.
Simulates a leveraged equity/ETF income portfolio with margin debt,
dividend DRIP/paydown, scheduled cash flows, and margin call detection.
"""
import logging
import os
from datetime import datetime, timedelta
from pathlib import Path
from typing import Any, Dict, List, Optional, Tuple

import pandas as pd

from engines.margin import (
    daily_margin_interest,
    maintenance_margin_requirement,
    distance_to_margin_call,
)

logger = logging.getLogger(__name__)

EQUITY_ARCHIVE = Path(os.getenv("EQUITY_ARCHIVE_PATH", "/workspace/Archive/Equity_Archive"))

# ── Types ──────────────────────────────────────────────────────────────────────

class PortfolioAsset:
    def __init__(self, ticker: str, weight: float, dividend_yield: float = 0.0):
        self.ticker = ticker.upper()
        self.weight = weight  # target allocation %
        self.dividend_yield = dividend_yield  # annual dividend yield (decimal)

    def monthly_dividend_rate(self) -> float:
        return self.dividend_yield / 12


class CashEvent:
    def __init__(self, date: str, amount: float, description: str = ""):
        self.date = date
        self.amount = amount  # positive = deposit, negative = withdrawal
        self.description = description


class PortfolioConfig:
    def __init__(
        self,
        assets: List[PortfolioAsset],
        initial_cash: float = 100_000.0,
        margin_target: float = 0.0,
        margin_rate: float = 0.065,
        interest_free_buffer: float = 1000.0,
        drip_enabled: bool = True,
        maintenance_req_pct: float = 0.25,
        start_date: str = "2020-01-01",
        end_date: str = "",
        deposits: Optional[List[CashEvent]] = None,
        withdrawals: Optional[List[CashEvent]] = None,
    ):
        self.assets = assets
        self.initial_cash = initial_cash
        self.margin_target = margin_target
        self.margin_rate = margin_rate
        self.interest_free_buffer = interest_free_buffer
        self.drip_enabled = drip_enabled
        self.maintenance_req_pct = maintenance_req_pct
        self.start_date = start_date
        self.end_date = end_date or datetime.now().strftime("%Y-%m-%d")
        self.deposits = deposits or []
        self.withdrawals = withdrawals or []


# ── Data Loading ────────────────────────────────────────────────────────────────

def _load_equity_prices(ticker: str, start: str, end: str) -> pd.DataFrame:
    """Load daily OHLCV data from equity archive."""
    ticker_dir = EQUITY_ARCHIVE / ticker.upper()
    if not ticker_dir.exists():
        # Try loading from options archive underlying_price
        opt_dir = Path(str(EQUITY_ARCHIVE).replace("Equity_Archive", "Nautilus_Archive5min"))
        if (opt_dir / ticker.upper()).exists():
            dfs = []
            for f in sorted((opt_dir / ticker.upper()).glob("*.parquet")):
                d = pd.read_parquet(f)
                if "underlying_price" in d.columns:
                    d["date_str"] = d["date"].astype(str)
                    daily = d.groupby("date_str").agg({
                        "underlying_price": "last",
                        "volume": "sum",
                    }).reset_index()
                    daily.columns = ["date", "close", "volume"]
                    daily["ticker"] = ticker.upper()
                    dfs.append(daily)
            if dfs:
                df = pd.concat(dfs, ignore_index=True)
                df["date"] = pd.to_datetime(df["date"], errors="coerce")
                df = df.sort_values("date").dropna(subset=["date"])
                mask = (df["date"] >= pd.Timestamp(start)) & (df["date"] <= pd.Timestamp(end))
                return df[mask].copy()

        raise FileNotFoundError(f"No price data for {ticker}")

    dfs = []
    for f in sorted(ticker_dir.glob("*.parquet")):
        d = pd.read_parquet(f)
        if "Date" in d.columns:
            d = d.rename(columns={"Date": "date", "Close": "close"})
        elif "date" not in d.columns:
            continue
        d["date"] = pd.to_datetime(d["date"], errors="coerce")
        d["ticker"] = ticker.upper()
        dfs.append(d)

    if not dfs:
        raise FileNotFoundError(f"No data for {ticker} in archive")

    df = pd.concat(dfs, ignore_index=True)
    df = df.sort_values("date").dropna(subset=["date"])
    mask = (df["date"] >= pd.Timestamp(start)) & (df["date"] <= pd.Timestamp(end))
    return df[mask].copy()


def _build_price_matrix(
    assets: List[PortfolioAsset],
    start: str,
    end: str,
) -> pd.DataFrame:
    """Build a daily price matrix for all assets, forward-filled."""
    price_dict = {}
    for asset in assets:
        try:
            df = _load_equity_prices(asset.ticker, start, end)
            if not df.empty:
                price_dict[asset.ticker] = df.set_index("date")["close"]
        except FileNotFoundError:
            logger.warning(f"No price data for {asset.ticker}, skipping")

    if not price_dict:
        raise ValueError("No price data could be loaded for any asset")

    matrix = pd.DataFrame(price_dict)
    matrix = matrix.resample("D").last().ffill().bfill()
    return matrix


# ── Engine ──────────────────────────────────────────────────────────────────────

class PortfolioBacktestEngine:
    """Daily portfolio simulation with margin, dividends, and cash flows."""

    def __init__(self, config: PortfolioConfig):
        self.config = config
        self.total_weight = sum(a.weight for a in config.assets)

    def run(self) -> Dict[str, Any]:
        config = self.config
        logger.info(f"Loading price data for {len(config.assets)} assets...")
        price_matrix = _build_price_matrix(config.assets, config.start_date, config.end_date)
        logger.info(f"Price matrix: {len(price_matrix)} trading days")

        # Normalize weights
        weights = {a.ticker: a.weight / self.total_weight for a in config.assets}
        div_rates = {a.ticker: a.monthly_dividend_rate() for a in config.assets}

        # Initial state
        cash = config.initial_cash
        shares = {a.ticker: 0.0 for a in config.assets}
        margin_debt = config.margin_target
        equity_curve = []
        ledger = []
        margin_call_events = 0
        total_dividends = 0.0
        total_interest = 0.0
        last_month = -1

        # Build deposit/withdrawal lookup
        cash_events: Dict[str, List[CashEvent]] = {}
        for evt in config.deposits + config.withdrawals:
            d = evt.date[:7]  # YYYY-MM
            if d not in cash_events:
                cash_events[d] = []
            cash_events[d].append(evt)

        # Initial purchase on day 1
        first_date = price_matrix.index[0]
        first_prices = price_matrix.loc[first_date]
        for ticker in config.assets:
            t = ticker.ticker
            px = first_prices.get(t)
            if pd.isna(px) or px <= 0:
                continue
            alloc = cash * weights[t]
            shares[t] = alloc / px
        cash = 0.0

        for date_idx, (date, prices) in enumerate(price_matrix.iterrows()):
            date_str = date.strftime("%Y-%m-%d")
            month_key = date_str[:7]

            # ── 1. Compute portfolio value ──
            portfolio_value = cash
            for ticker in config.assets:
                t = ticker.ticker
                px = prices.get(t)
                if pd.notna(px) and px > 0:
                    portfolio_value += shares[t] * px

            # Recompute margin debt (if margin target is % of portfolio)
            if config.margin_target > 0:
                # Gradually step toward target margin
                target_debt = portfolio_value * (config.margin_target / 100)
                if margin_debt < target_debt:
                    additional = (target_debt - margin_debt) * 0.01  # 1% step per day
                    margin_debt += additional
                    cash += additional  # borrowing adds cash
                elif margin_debt > target_debt:
                    paydown = (margin_debt - target_debt) * 0.01
                    margin_debt -= paydown
                    cash -= paydown

            equity = portfolio_value - margin_debt

            # ── 2. Process scheduled deposits/withdrawals ──
            if month_key in cash_events:
                for evt in cash_events[month_key]:
                    if evt.amount > 0:
                        # Deposit — use to reduce margin first, then add to cash
                        if margin_debt > 0:
                            paydown = min(margin_debt, evt.amount)
                            margin_debt -= paydown
                            cash += evt.amount - paydown
                        else:
                            cash += evt.amount
                    else:
                        # Withdrawal — increase margin if insufficient cash
                        withdrawal = abs(evt.amount)
                        if cash >= withdrawal:
                            cash -= withdrawal
                        else:
                            shortfall = withdrawal - cash
                            cash = 0
                            margin_debt += shortfall

                    ledger.append({
                        "date": date_str,
                        "type": "deposit" if evt.amount > 0 else "withdrawal",
                        "amount": round(evt.amount, 2),
                        "description": evt.description or f"{'Deposit' if evt.amount > 0 else 'Withdrawal'}",
                        "cash_after": round(cash, 2),
                        "margin_after": round(margin_debt, 2),
                    })

            # ── 3. Daily margin interest ──
            if margin_debt > 0:
                interest = daily_margin_interest(
                    margin_debt,
                    config.margin_rate,
                    config.interest_free_buffer,
                )
                if interest > 0:
                    total_interest += interest
                    margin_debt += interest  # interest accrues to debt

            # ── 4. Monthly dividend collection ──
            current_month = date.month
            if current_month != last_month:
                last_month = current_month
                monthly_dividends = 0.0

                for asset in config.assets:
                    t = asset.ticker
                    px = prices.get(t)
                    if pd.notna(px) and px > 0 and shares[t] > 0:
                        div_per_share = px * div_rates[t]
                        div_amount = shares[t] * div_per_share
                        monthly_dividends += div_amount

                if monthly_dividends > 0:
                    total_dividends += monthly_dividends
                    if config.drip_enabled:
                        # DRIP: buy more shares proportionally
                        for asset in config.assets:
                            t = asset.ticker
                            px = prices.get(t)
                            if pd.notna(px) and px > 0:
                                alloc = weights[t]
                                shares[t] += (monthly_dividends * alloc) / px
                    else:
                        # Paydown: reduce margin debt
                        if margin_debt > 0:
                            paydown = min(margin_debt, monthly_dividends)
                            margin_debt -= paydown
                            cash += monthly_dividends - paydown
                        else:
                            cash += monthly_dividends

                    ledger.append({
                        "date": date_str,
                        "type": "dividend",
                        "amount": round(monthly_dividends, 2),
                        "description": f"Monthly dividends ({config.drip_enabled and 'DRIP' or 'Paydown'})",
                        "cash_after": round(cash, 2),
                        "margin_after": round(margin_debt, 2),
                    })

            # ── 5. Margin call check ──
            mmr, in_call = maintenance_margin_requirement(
                portfolio_value, equity, config.maintenance_req_pct,
            )
            if in_call:
                margin_call_events += 1

            dist_to_call = distance_to_margin_call(
                equity, portfolio_value, config.maintenance_req_pct,
            )

            # ── 6. Record snapshot ──
            equity_curve.append({
                "date": date_str,
                "portfolio_value": round(portfolio_value, 2),
                "equity": round(equity, 2),
                "margin_debt": round(margin_debt, 2),
                "cash": round(cash, 2),
                "dividends_collected": round(total_dividends, 2),
                "interest_accrued": round(total_interest, 2),
                "distance_to_call_pct": round(dist_to_call, 2),
                "margin_call": in_call,
            })

        # ── Compute final metrics ──
        final_equity = equity_curve[-1]["equity"] if equity_curve else 0
        start_equity = config.initial_cash
        total_return = final_equity - start_equity
        total_return_pct = (total_return / start_equity * 100) if start_equity > 0 else 0

        # Date range in years
        if len(equity_curve) >= 2:
            d0 = equity_curve[0]["date"]
            d1 = equity_curve[-1]["date"]
            years = max((pd.Timestamp(d1) - pd.Timestamp(d0)).days / 365.25, 1 / 365.25)
            cagr = ((final_equity / start_equity) ** (1 / years) - 1) * 100 if start_equity > 0 else 0
        else:
            years = 1
            cagr = 0

        # Max drawdown
        eq_values = [e["equity"] for e in equity_curve]
        peak = eq_values[0] if eq_values else 0
        max_dd = 0.0
        for v in eq_values:
            if v > peak:
                peak = v
            if peak > 0:
                dd = (peak - v) / peak * 100
                if dd > max_dd:
                    max_dd = dd

        # Sharpe on daily equity returns
        daily_returns = []
        for i in range(1, len(eq_values)):
            prev = eq_values[i - 1]
            if prev > 0:
                daily_returns.append((eq_values[i] - prev) / prev)

        sharpe = 0.0
        if len(daily_returns) > 1:
            mean_r = sum(daily_returns) / len(daily_returns)
            var_r = sum((r - mean_r) ** 2 for r in daily_returns) / (len(daily_returns) - 1)
            if var_r > 1e-12:
                std_r = var_r ** 0.5
                daily_rf = 0.05 / 252
                sharpe = round((mean_r - daily_rf) / std_r * (252 ** 0.5), 3)

        # Avg distance to call
        distances = [e["distance_to_call_pct"] for e in equity_curve]
        avg_distance = sum(distances) / len(distances) if distances else 0

        # Net yield spread
        avg_div_yield = sum(a.dividend_yield for a in config.assets) / len(config.assets) * 100 if config.assets else 0
        margin_drag = (total_interest / start_equity * 100) if start_equity > 0 else 0
        net_yield_spread = round(avg_div_yield - margin_drag, 2)

        return {
            "success": True,
            "config": {
                "assets": [{"ticker": a.ticker, "weight": a.weight, "dividend_yield": a.dividend_yield} for a in config.assets],
                "initial_cash": config.initial_cash,
                "margin_target": config.margin_target,
                "margin_rate": config.margin_rate,
                "drip_enabled": config.drip_enabled,
                "start_date": config.start_date,
                "end_date": config.end_date,
            },
            "metrics": {
                "total_return": round(total_return, 2),
                "total_return_pct": round(total_return_pct, 2),
                "cagr_pct": round(cagr, 2),
                "sharpe_ratio": round(sharpe, 3),
                "max_drawdown_pct": round(max_dd, 2),
                "total_dividends_collected": round(total_dividends, 2),
                "total_margin_interest_paid": round(total_interest, 2),
                "net_yield_spread": net_yield_spread,
                "margin_call_count": margin_call_events,
                "avg_distance_to_call_pct": round(avg_distance, 2),
                "final_equity": round(final_equity, 2),
                "final_margin_debt": round(margin_debt, 2),
            },
            "equity_curve": equity_curve,
            "ledger": ledger,
        }

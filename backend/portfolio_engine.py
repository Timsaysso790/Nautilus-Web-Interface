"""
Portfolio Engine — master orchestrator for bar-by-bar leveraged income backtest.
"""

import logging
import math
from datetime import datetime, timedelta, timezone
from typing import Any, Dict, List, Optional

import pandas as pd

import data_loader
import dividend_pipeline
import margin_bridge
import valuation_clearance
import vix_hedge_engine
from option_service import calculate_bsm

logger = logging.getLogger(__name__)

COMMISSION_PER_SHARE = 0.005
VIX_OPTION_IV = 0.80


async def _find_option_price_async(
    underlying_price: float,
    strike: float,
    dte: int,
    right: str,
    iv: float,
    rate: float = 0.05,
) -> float:
    """Async wrapper around BSM pricing."""
    t = max(dte, 1) / 365.0
    result = await calculate_bsm(
        underlying_price=underlying_price,
        strike=strike,
        time_to_expiry=t,
        risk_free_rate=rate,
        volatility=iv,
        right=right,
    )
    return result["price"]


def _dollars_to_shares(amount: float, price: float) -> float:
    """Convert dollar amount to whole shares (round down)."""
    if price <= 0:
        return 0.0
    return math.floor(amount / price)


def _compute_equity_value(
    positions: Dict[str, float],
    prices: Dict[str, float],
) -> float:
    """Compute total market value of equity positions."""
    total = 0.0
    for ticker, shares in positions.items():
        price = prices.get(ticker, 0.0)
        total += shares * price
    return total


async def run_portfolio_backtest(config: Dict[str, Any]) -> Dict[str, Any]:
    """
    Full portfolio backtest simulation.
    Accepts the PortfolioConfig dict from the frontend.
    """
    # ── Extract config ──────────────────────────────────────────────────
    assets_config: list = config.get("assets", [])
    cash_schedule: dict = config.get("cashSchedule", {})
    clearance_config: dict = config.get("clearanceConfig", {})
    margin_config: dict = config.get("marginConfig", {})
    vix_config: dict = config.get("vixConfig", {})

    start_date: str = config.get("startDate", "2024-01-01")
    end_date: str = config.get("endDate", "")
    initial_cash: float = float(config.get("initialCash", 50000))

    if not end_date:
        end_date = datetime.now(timezone.utc).strftime("%Y-%m-%d")

    tickers = [a.get("ticker", "").upper() for a in assets_config if a.get("ticker")]
    if not tickers:
        return {"success": False, "error": "No assets configured"}

    # ── Load all market data ────────────────────────────────────────────
    # Macro data
    macro_data = await valuation_clearance.load_macro_data(start_date, end_date)
    qqq_df = macro_data.get("QQQ", pd.DataFrame())
    iwm_df = macro_data.get("IWM", pd.DataFrame())

    if qqq_df.empty:
        return {"success": False, "error": "Failed to load QQQ data"}

    # VIX data
    vix_df = await vix_hedge_engine.load_vix_data(start_date, end_date)

    # Equity price data for all configured tickers
    equity_data: Dict[str, pd.DataFrame] = {}
    for ticker in tickers:
        try:
            equity_data[ticker] = data_loader.load_daily_prices(ticker, start_date, end_date)
        except FileNotFoundError:
            logger.warning("No archive data for %s — skipping", ticker)
            equity_data[ticker] = pd.DataFrame()

    # ── Warm dividend cache ────────────────────────────────────────────
    for ticker in tickers:
        await dividend_pipeline.get_dividend_history(ticker, start_date, end_date)

    # ── Initialize state ────────────────────────────────────────────────
    cash = initial_cash
    equity_positions: Dict[str, float] = {t: 0.0 for t in tickers}
    margin_debt = 0.0
    total_margin_interest_paid = 0.0
    total_dividends_collected = 0.0
    clearance_active = False
    prev_clearance_active = False
    clearance_entry_count = 0

    # ── Initialize subsystems ───────────────────────────────────────────
    bridge = margin_bridge.MarginBridge(
        debt_governor_pct=float(margin_config.get("debtGovernorPct", 20.0)),
        freeze_days=int(margin_config.get("freezeDays", 60)),
        borrow_rate=float(margin_config.get("borrowRate", 0.06)),
    )

    vix_orchestrator = vix_hedge_engine.VixHedgeOrchestrator(
        ladder45_config=vix_config.get("ladder45dte", []),
        ladder90_config=vix_config.get("ladder90dte", []),
        systematic_roll_threshold=int(vix_config.get("systematicRollThreshold", 10)),
        opportunistic_roll_vix_min=float(vix_config.get("opportunisticRollVixMin", 18.0)),
        spike_multiplier=float(vix_config.get("spikeHarvest", {}).get("vixSpikeMultiplier", 3.0)),
        vix_ma_period=int(vix_config.get("spikeHarvest", {}).get("vixMaPeriod", 20)),
        reentry_vix_threshold=float(vix_config.get("spikeHarvest", {}).get("reentryVixThreshold", 20.0)),
    )

    # ── Results accumulators ────────────────────────────────────────────
    equity_curve: list = []
    clearance_events: list = []
    trade_log: list = []

    clearance_enabled = clearance_config.get("enabled", True)
    margin_enabled = margin_config.get("enabled", True)
    vix_enabled = vix_config.get("enabled", False)

    # Build a unified date index from QQQ data (use as the bar source)
    if qqq_df.empty:
        return {"success": False, "error": "No QQQ price data available"}

    bb_period = int(clearance_config.get("bbPeriod", 20))
    bb_std = float(clearance_config.get("bbStdDev", 2.0))
    rsi_threshold = float(clearance_config.get("rsiThreshold", 40.0))
    front_load_months = int(clearance_config.get("frontLoadMonths", 3))

    # ── Bar loop ────────────────────────────────────────────────────────
    for i in range(len(qqq_df)):
        bar = qqq_df.iloc[i]
        bar_date = str(bar["Date"])[:10]
        bar_date_obj = datetime.strptime(bar_date, "%Y-%m-%d").date()

        # Prices at current bar
        current_prices: Dict[str, float] = {}
        for ticker in tickers:
            td = equity_data.get(ticker)
            if td is not None and not td.empty:
                bar_rows = td[td["Date"] <= bar["Date"]]
                if not bar_rows.empty:
                    current_prices[ticker] = float(bar_rows.iloc[-1]["Close"])

        equity_value = _compute_equity_value(equity_positions, current_prices)
        total_asset_value = cash + equity_value
        nav = total_asset_value - margin_debt

        # ── Step 1: Process dividends ───────────────────────────────────
        for ticker in tickers:
            shares = equity_positions.get(ticker, 0.0)
            if shares > 0:
                div_amount = await dividend_pipeline.get_dividends_on_date(ticker, bar_date_obj)
                if div_amount > 0:
                    drip_enabled = True
                    for a in assets_config:
                        if a.get("ticker", "").upper() == ticker:
                            drip_enabled = a.get("dripEnabled", True)
                            break

                    dividend_cash = div_amount * shares
                    if drip_enabled and current_prices.get(ticker, 0) > 0:
                        # DRIP: use cash to buy more shares
                        new_shares = dividend_cash / current_prices[ticker]
                        equity_positions[ticker] += new_shares
                    else:
                        cash += dividend_cash

                    total_dividends_collected += dividend_cash
                    trade_log.append({
                        "date": bar_date,
                        "type": "dividend",
                        "ticker": ticker,
                        "amount": round(dividend_cash, 2),
                        "drip": drip_enabled,
                    })

        # ── Step 2: Process cash injections ─────────────────────────────
        if cash_schedule.get("enabled", False):
            paycheck_amount = float(cash_schedule.get("paycheckAmount", 1200))
            paycheck_freq = cash_schedule.get("paycheckFrequency", "monthly")

            # Monthly paycheck
            if paycheck_freq == "monthly" and bar_date_obj.day == 1:
                cash += paycheck_amount
                trade_log.append({"date": bar_date, "type": "paycheck", "amount": paycheck_amount})

            # Lump sum injections
            for inj in cash_schedule.get("lumpSumInjections", []):
                inj_date = str(inj.get("date", ""))[:10]
                if inj_date == bar_date:
                    cash += float(inj.get("amount", 0))
                    trade_log.append({
                        "date": bar_date,
                        "type": "lump_sum",
                        "label": inj.get("label", ""),
                        "amount": float(inj.get("amount", 0)),
                    })

        # ── Step 3: Valuation clearance check ─────────────────────────
        if clearance_enabled and not qqq_df.empty:
            # Get up-to-date price series for indicators
            qqq_up_to = qqq_df[qqq_df["Date"] <= bar["Date"]]["Close"]
            iwm_window = pd.Series(dtype=float)
            if not iwm_df.empty:
                iwm_window = iwm_df[iwm_df["Date"] <= bar["Date"]]["Close"]

            if len(qqq_up_to) >= bb_period:
                indicators = valuation_clearance.compute_macro_indicators(
                    qqq_prices=qqq_up_to,
                    iwm_prices=iwm_window if not iwm_window.empty else qqq_up_to,
                    bb_period=bb_period,
                    bb_std=bb_std,
                    rsi_threshold=rsi_threshold,
                )

                prev_clearance_active = clearance_active
                clearance_active = indicators["clearance_active"]

                # Clearance entry event
                if clearance_active and not prev_clearance_active:
                    clearance_entry_count += 1
                    clearance_events.append({
                        "date": bar_date,
                        "type": "clearance_entry",
                        "detail": f"QQQ RSI={indicators['qqq']['rsi']} BB_lower={indicators['qqq']['bb']['pierced_lower']} | "
                                  f"IWM RSI={indicators['iwm']['rsi']} BB_lower={indicators['iwm']['bb']['pierced_lower']}",
                    })
                elif not clearance_active and prev_clearance_active:
                    clearance_events.append({
                        "date": bar_date,
                        "type": "clearance_exit",
                        "detail": "Macro conditions normalized.",
                    })

                # ── Step 4: Time-Machine front-load (at clearance) ────
                if clearance_active:
                    # Project forward dividends and paychecks for Time-Machine
                    future_end = (bar_date_obj + timedelta(days=front_load_months * 30)).isoformat()
                    proj_divs = await dividend_pipeline.project_dividends(
                        tickers, bar_date, future_end,
                        existing_positions=equity_positions,
                    )
                    projected_divs_3m = sum(proj_divs.values())

                    projected_paychecks_3m = 0.0
                    if cash_schedule.get("enabled", False):
                        pa = float(cash_schedule.get("paycheckAmount", 1200))
                        projected_paychecks_3m = pa * front_load_months

                    tm = valuation_clearance.compute_time_machine(
                        current_nav=nav,
                        projected_dividends_3m=projected_divs_3m,
                        projected_paychecks_3m=projected_paychecks_3m,
                    )

                    if margin_enabled and tm["front_load_capacity"] > 0:
                        can_borrow = bridge.can_borrow_amount(
                            tm["front_load_capacity"],
                            total_asset_value,
                            margin_debt,
                        )
                        if can_borrow:
                            actual_borrow = tm["front_load_capacity"]
                            margin_debt += actual_borrow
                            cash += actual_borrow
                            total_asset_value += actual_borrow

                            # Deploy borrowed cash to equity positions proportionally
                            deployable = actual_borrow
                            for ticker in sorted(
                                tickers,
                                key=lambda t: next(
                                    (a.get("allocation", 0) for a in assets_config if a.get("ticker", "").upper() == t),
                                    0,
                                ),
                                reverse=True,
                            ):
                                alloc = next(
                                    (a.get("allocation", 0) for a in assets_config if a.get("ticker", "").upper() == ticker),
                                    0,
                                )
                                if alloc <= 0 or deployable <= 0:
                                    continue
                                buy_amount = deployable * (alloc / 100.0)
                                price = current_prices.get(ticker, 0)
                                if price > 0:
                                    shares_to_buy = _dollars_to_shares(buy_amount, price)
                                    if shares_to_buy > 0:
                                        cost = shares_to_buy * price
                                        equity_positions[ticker] += shares_to_buy
                                        deployable -= cost
                                        trade_log.append({
                                            "date": bar_date,
                                            "type": "margin_buy",
                                            "ticker": ticker,
                                            "shares": shares_to_buy,
                                            "price": round(price, 2),
                                            "cost": round(cost, 2),
                                            "borrow": round(actual_borrow, 2),
                                        })

                            # Remaining deployable stays as cash
                            cash = max(0.0, cash - (actual_borrow - deployable))

                            clearance_events.append({
                                "date": bar_date,
                                "type": "time_machine_front_load",
                                "detail": f"Borrowed ${actual_borrow:.0f} from FutureNAV ${tm['future_nav']:.0f}. "
                                          f"Deployed to equity positions.",
                            })

                        else:
                            clearance_events.append({
                                "date": bar_date,
                                "type": "time_machine_blocked",
                                "detail": f"Front-load capacity ${tm['front_load_capacity']:.0f} blocked by debt governor.",
                            })

        # ── Step 5: VIX hedge processing (BEFORE margin bridge) ──────
        vix_harvest_cash = 0.0
        vix_reentry_cost = 0.0
        if vix_enabled and not vix_df.empty:
            vix_close = None
            vix_bars = vix_df[vix_df["Date"] <= bar["Date"]]
            if not vix_bars.empty:
                vix_close = float(vix_bars.iloc[-1]["Close"])

            if vix_close is not None and len(vix_bars) >= 20:
                vix_prices = vix_bars["Close"]
                vix_result = await vix_orchestrator.tick(
                    bar_date=bar_date,
                    vix_price=vix_close,
                    vix_prices=vix_prices,
                    iv=VIX_OPTION_IV,
                )

                for action in vix_result.get("actions", []):
                    trade_log.append({**action, "date": bar_date})

                vix_harvest_cash = vix_result.get("harvested_cash", 0.0)
                vix_reentry_cost = vix_result.get("reentry_cost", 0.0)

                # ── Step 5a: Route harvested cash directly to equity at crash prices ──
                if vix_harvest_cash > 0:
                    deployable = vix_harvest_cash
                    for ticker in sorted(
                        tickers,
                        key=lambda t: next(
                            (a.get("allocation", 0) for a in assets_config if a.get("ticker", "").upper() == t),
                            0,
                        ),
                        reverse=True,
                    ):
                        alloc = next(
                            (a.get("allocation", 0) for a in assets_config if a.get("ticker", "").upper() == ticker),
                            0,
                        )
                        if alloc <= 0 or deployable <= 0:
                            continue
                        buy_amount = deployable * (alloc / 100.0)
                        price = current_prices.get(ticker, 0)
                        if price > 0:
                            shares_to_buy = _dollars_to_shares(buy_amount, price)
                            if shares_to_buy > 0:
                                cost = shares_to_buy * price
                                equity_positions[ticker] += shares_to_buy
                                deployable -= cost
                                trade_log.append({
                                    "date": bar_date,
                                    "type": "vix_harvest_buy",
                                    "ticker": ticker,
                                    "shares": shares_to_buy,
                                    "price": round(price, 2),
                                    "value": round(cost, 2),
                                })

                    # Any remaining harvest cash goes into general cash
                    cash += deployable

                # Reentry cost comes from cash (VIX positions cost money to re-establish)
                if vix_reentry_cost > 0:
                    cash -= min(cash, vix_reentry_cost)

        # ── Step 6: Margin bridge processing ──────────────────────────
        if margin_enabled:
            # Recompute equity value after VIX harvest buys
            equity_value = _compute_equity_value(equity_positions, current_prices)
            total_asset_value = cash + equity_value
            nav = total_asset_value - margin_debt

            bridge_result = bridge.check_and_update(
                total_asset_value=total_asset_value,
                total_debt=margin_debt,
                cash=cash,
                bar_date=bar_date,
            )

            for action in bridge_result.get("actions", []):
                trade_log.append(action)

            # ── Step 6a: Debt absorption (when frozen) ────────────────
            if bridge.state.is_frozen:
                # All cash inflows go to debt reduction
                # For this bar, any cash we have above a minimum gets swept
                min_cash_reserve = 100.0
                sweepable = max(0.0, cash - min_cash_reserve)
                if sweepable > 0 and margin_debt > 0:
                    new_debt, remaining = margin_bridge.process_debt_absorption(
                        sweepable, margin_debt, is_frozen=True,
                    )
                    actual_paydown = margin_debt - new_debt
                    if actual_paydown > 0:
                        margin_debt = new_debt
                        cash = remaining + min_cash_reserve
                        trade_log.append({
                            "date": bar_date,
                            "type": "debt_absorption",
                            "amount": round(actual_paydown, 2),
                            "remaining_debt": round(margin_debt, 2),
                        })

            # ── Step 6b: Compute margin interest ──────────────────────
            if i > 0:
                prev_bar_date = str(qqq_df.iloc[i - 1]["Date"])[:10]
                prev = datetime.strptime(prev_bar_date, "%Y-%m-%d")
                curr = datetime.strptime(bar_date, "%Y-%m-%d")
                days = (curr - prev).days
                if days > 0 and margin_debt > 0:
                    interest = bridge.compute_interest(margin_debt, days)
                    cash -= interest
                    total_margin_interest_paid += interest

        # ── Step 7: Record equity curve snapshot ─────────────────────
        equity_value = _compute_equity_value(equity_positions, current_prices)
        total_asset_value = cash + equity_value
        nav = total_asset_value - margin_debt

        equity_curve.append({
            "date": bar_date,
            "cash": round(cash, 2),
            "equityValue": round(equity_value, 2),
            "totalDebt": round(margin_debt, 2),
            "nav": round(nav, 2),
            "clearance": "CLEARANCE_ACTIVE" if clearance_active else "NORMAL",
        })

    # ── Package results ────────────────────────────────────────────
    if not equity_curve:
        return {"success": False, "error": "No bars processed"}

    first_nav = equity_curve[0]["nav"]
    last_nav = equity_curve[-1]["nav"]
    total_return_pct = round(((last_nav - first_nav) / first_nav) * 100, 2) if first_nav > 0 else 0.0

    final_positions = [
        {"ticker": t, "shares": round(s, 4), "avgCost": round(current_prices.get(t, 0), 2)}
        for t, s in equity_positions.items() if s > 0
    ]

    summary_stats = bridge.get_summary_stats()

    result = {
        "success": True,
        "summary": {
            "totalReturnPct": total_return_pct,
            "totalDividendsCollected": round(total_dividends_collected, 2),
            "totalMarginPaid": round(total_margin_interest_paid, 2),
            "totalMarginInterestPaid": round(total_margin_interest_paid, 2),
            "spikeHarvestCount": vix_orchestrator.harvest_count,
            "totalVixPnl": 0.0,
            "clearanceEntryCount": clearance_entry_count,
            "maxUtilization": summary_stats["max_utilization"],
            "avgUtilization": summary_stats["avg_utilization"],
            "finalCash": round(cash, 2),
            "finalEquityValue": round(equity_value, 2),
            "finalDebt": round(margin_debt, 2),
        },
        "equityCurve": equity_curve,
        "positions": final_positions,
        "clearanceEvents": clearance_events,
        "marginHistory": [
            {"date": h.date, "utilization": round(h.utilization * 100, 2), "isFrozen": h.is_frozen, "debt": round(h.debt, 2)}
            for h in bridge.history
        ],
        "vixLadderHistory": vix_orchestrator.get_history(),
    }

    return result

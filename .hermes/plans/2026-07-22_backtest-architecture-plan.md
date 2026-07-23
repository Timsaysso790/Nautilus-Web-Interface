# Options Backtesting Module — Architecture Plan

> **Status:** Design proposal — review before implementation
> **Scope:** Unified institutional-grade backtest engine + dense analytical dashboard

---

## 1. Current State Analysis

### Engines (fragmented — 3 separate implementations)

| Engine | Data Source | Used By | Issues |
|--------|-------------|---------|--------|
| `options_backtest_engine.py` | Local Parquet archive | ResearchWorkspace | No delta filtering, no slippage, sequential-only trades |
| `option_backtest_service.py` | Yahoo Finance (yfinance) | Old backtest page | No real option data, BSM-estimated prices only |
| `nautilus_core.py` | NautilusTrader | Internal | Not user-configurable |

### API Endpoints (fragmented — 3 separate routers)

| Router | Prefix | Path | Notes |
|--------|--------|------|-------|
| `backtest_options.py` | `/api/backtest/options` | `/run`, `/walk-forward` | Parquet engine |
| `backtest.py` | `/api/nautilus` | `/option-backtest` | yfinance engine |
| `backtest_projects.py` | `/api/backtest/projects` | CRUD | Project management |

### Frontends (overlapping)

- `ResearchWorkspace.tsx` — new unified workspace (Config/Backtest/Chart/History)
- `BacktestingPage.tsx` — old standalone page
- `OptionsStationPage.tsx` — old project-based page

---

## 2. Target Architecture

### Backend: Single Unified Engine → Single API Endpoint

```
POST /api/backtest/run
├── engine: "parquet" | "yfinance"        # data source selector
├── ticker: "SPY"
├── legs: [{ strike, right, action, qty }]
├── entry_rules:
│   ├── dte_min, dte_max
│   ├── delta_min, delta_max               # new — filter entries by greeks
│   ├── iv_percentile_min                   # new — entry IV filter
│   └── allow_overlapping: bool             # new — support concurrent positions
├── exit_triggers:
│   ├── profit_target_pct: 50               # new — take profit at +50%
│   ├── stop_loss_pct: 100                  # new — stop loss at -100%
│   ├── hold_until_dte: 21
│   └── max_days_in_trade: 60
├── execution:
│   ├── slippage_model: "mid" | "spread_pct" | "aggressive"  # new
│   ├── slippage_pct: 0.1                   # configurable spread penalty
│   └── commission_per_contract: 0.65
├── date_range:
│   ├── start_year, end_year
│   └── entry_frequency_days: 7
└── analysis:
    ├── regime_filter: null | "vix" | "sma200"  # new
    └── starting_capital: 50000
```

### Metrics Output (expanded — 20+ metrics)

| Category | Metrics | Status |
|----------|---------|--------|
| **Base** | Total Trades, Win Count, Loss Count, Win Rate | ✅ Existing |
| **P&L** | Total PnL, Avg PnL, Avg Win, Avg Loss, Payoff Ratio | ✅ Add avg win/loss, payoff ratio |
| **Risk-Adjusted** | Sharpe Ratio, Sortino Ratio, Calmar Ratio | 🔄 Add Sortino + Calmar |
| **Drawdown** | Max DD %, Avg DD, DD Recovery Days, DD Start/End | 🔄 Full drawdown profile |
| **Capital** | CAGR %, Total Return %, Avg Margin, Return on Margin | 🔄 Margin tracking |
| **Execution** | Total Commission, Slippage Cost, Avg Slippage/Trade | 🔄 New |
| **Greek Attribution** | Delta PnL, Gamma PnL, Theta PnL, Vega PnL, Unexplained | 🔄 Per-trade greeks |
| **Regime** | Bull Market Trades, Bear Market Trades, VIX Low/High Performance | 🔄 New |

### Per-Trade Record (expanded)

```typescript
interface TradeRecord {
  id: number;
  entry_date: string;
  exit_date: string;
  expiration: string;
  dte_at_entry: number;
  dte_at_exit: number;
  days_held: number;
  underlying_entry: number;
  underlying_exit: number;
  entry_cost: number;
  net_credit: number;
  exit_cost: number;
  pnl: number;
  pnl_pct: number;           // new — return on margin
  margin_required: number;   // new
  commission: number;
  slippage_cost: number;     // new
  exit_reason: "dte_exit" | "profit_target" | "stop_loss" | "max_hold";
  greeks: {                  // new
    delta: number;
    gamma: number;
    theta: number;
    vega: number;
    rho: number;
  };
}
```

---

## 3. Implementation Plan

### Phase 1: Engine Rewrite (`options_backtest_engine.py`)

The current engine is 283 lines and handles only sequential single-trade-at-a-time. Needs a full rewrite.

**New architecture:**

```
OptionsBacktestEngine
├── load_data(ticker, years) → DataFrame
├── run() → BacktestResult
│   ├── find_entries() → eligible entry dates
│   ├── manage_positions() → handle concurrent overlapping trades
│   │   ├── check_exit_triggers(position)
│   │   ├── apply_slippage(price)
│   │   └── compute_greeks(row, leg)
│   └── calculate_metrics(trades, equity_curve)
│       ├── compute_sharpe()
│       ├── compute_sortino()
│       ├── compute_drawdown_profile()
│       └── compute_regime_stats()
```

Key behavioral changes:
- **Concurrent positions**: Track a list of open positions, enter new ones on schedule even if existing ones are open
- **Slippage model**: Configurable penalty (e.g., 10% of bid-ask spread) rather than pure mid
- **Delta filtering**: Filter eligible entries by delta_min/delta_max

**Files to create/modify:**
- `backend/options_backtest_engine.py` — **rewrite** (keep same filename, same interface for backward compat)
- `backend/engines/__init__.py` — new package
- `backend/engines/metrics.py` — extracted metrics computation
- `backend/engines/slippage.py` — slippage models

### Phase 2: Unified API Endpoint

Replace the fragmented endpoints with a single well-documented one.

**Files:**
- `backend/routers/backtest_run.py` — **new**: single `POST /api/backtest/run`
- `backend/routers/backtest_options.py` — keep for backward compat, delegate to new engine
- `backend/routers/backtest.py` — keep legacy for now

### Phase 3: Frontend Dashboard

Create a dense, analytical dashboard that replaces both `BacktestingPage.tsx` and `OptionsStationPage.tsx`.

**Layout:**

```
┌─────────────────────────────────────────────────────────────┐
│  Backtest Configuration Panel (left sidebar, 320px)         │
│  ┌─────────────────────────────────────────────────────────┐│
│  │ Ticker: [SPY]  Preset: [Put Credit Spread ▼]           ││
│  │─────────────────────────────────────────────────────────││
│  │ Entry Rules                          Exit Triggers      ││
│  │ DTE: [30]─[45]   Δ: [0.16]─[0.20]   PT: [50]%  SL: [100]%│
│  │ Freq: [7]d   Allow Overlap: [✓]     Hold DTE: [21]     ││
│  │─────────────────────────────────────────────────────────││
│  │ Legs builder (add/remove rows)                         ││
│  │ ┌────┬──────┬────┬─────┐                               ││
│  │ │ #  │ Side │ Δ  │ Qty │                               ││
│  │ │ 1  │ Sell │ 620│  1  │                               ││
│  │ │ 2  │ Buy  │ 610│  1  │                               ││
│  │ └────┴──────┴────┴─────┘                               ││
│  │─────────────────────────────────────────────────────────││
│  │ [▶ Run Backtest]  [💾 Save Config]                     ││
│  └─────────────────────────────────────────────────────────┘│
│                                                              │
│  Main Panel (remaining width)                                │
│  ┌─────────────────────────────────────────────────────────┐│
│  │ Metrics Bar (12 metric boxes in 2 rows × 6)             ││
│  │ ┌──────┬──────┬──────┬──────┬──────┬──────┐            ││
│  │ │Total │Win   │Profit│Sharpe│Sortino│Calmar│            ││
│  │ │PnL   │Rate  │Factor│1.42  │1.18   │0.42  │            ││
│  │ ├──────┼──────┼──────┼──────┼──────┼──────┤            ││
│  │ │Max DD│Avg DD│CAGR  │Avg   │Avg Win│Payoff│            ││
│  │ │-18.2%│-5.3% │12.4% │$185  │+$487  │1.56  │            ││
│  │ └──────┴──────┴──────┴──────┴──────┴──────┘            ││
│  │─────────────────────────────────────────────────────────││
│  │ Equity Curve + Drawdown (Recharts)                      ││
│  │  $60K ┤╱╲    ╱╲    ╱╲    ╱╲                              ││
│  │  $50K ┤  ╲──╱  ╲──╱  ╲──╱  ╲──╱  ╲──╱                  ││
│  │  $40K ┤                                  ╲──             ││
│  │        ────  Drawdown shaded area                        ││
│  │─────────────────────────────────────────────────────────││
│  │ Return Distribution Histogram (Recharts)                ││
│  │  ██  ██████  ██████████  ██                              ││
│  │  -$500  -$250   $0    +$250  +$500                     ││
│  │─────────────────────────────────────────────────────────││
│  │ Trades Table (sortable, paginated, 100+)                ││
│  │ ┌────┬───┬──────┬──────┬──────┬─────┬───┬───┬──────┐│
│  │ │ #  │ Δ │Entry │Exit  │Days  │P&L  │ DD│ θ │Reason ││
│  │ │ 1  │.18│1/5   │1/12  │7     │+$48 │$2 │$4 │dte   ││
│  │ └────┴───┴──────┴──────┴──────┴─────┴───┴───┴──────┘│
│  └─────────────────────────────────────────────────────────┘│
└─────────────────────────────────────────────────────────────┘
```

**Files:**
- `frontend/src/pages/BacktestPage.tsx` — **new unified backtest page**
- `frontend/src/components/backtest/ConfigPanel.tsx` — configuration sidebar
- `frontend/src/components/backtest/MetricsBar.tsx` — 12-metric display
- `frontend/src/components/backtest/EquityChart.tsx` — equity + drawdown chart
- `frontend/src/components/backtest/DistributionChart.tsx` — histogram
- `frontend/src/components/backtest/TradeLog.tsx` — sortable trade table
- `frontend/src/components/backtest/types.ts` — shared types

---

## 4. Key Design Decisions

### Decision 1: Rewrite engine in place vs. new file
**Choice:** Rewrite `options_backtest_engine.py` in place. It already has the parquet loading and basic structure. Keep the public interface the same so `ResearchWorkspace.tsx` and `backtest_options.py` continue to work without change.

### Decision 2: Concurrent overlapping positions
**Choice:** Track a list of `OpenPosition` objects. On each date, check entry conditions. If met and `allow_overlapping=True`, add to open list. On each date, also check exit conditions for all open positions independently.

### Decision 3: Slippage model
**Choice:** Three modes:
- `mid` — current behavior (no slippage)
- `spread_pct` — penalize by `slippage_pct%` of estimated spread
- `aggressive` — fill at the less favorable side of the spread

### Decision 4: Separate metrics computation
**Choice:** Extract metrics into a standalone `compute_metrics(trades, equity_curve, config)` function. Makes it reusable and testable independently of the simulation logic.

### Decision 5: Frontend routing
**Choice:** Replace both `BacktestingPage.tsx` and `OptionsStationPage.tsx`. The new `BacktestPage.tsx` lives at `/backtest` route. The old routes redirect.

---

## 5. Open Questions

1. **Regime filter data source**: VIX data — from local archive or fetched live? There's a `vix_hedge_engine.py` that may have VIX data handling.
2. **Margin model detail**: SPAN margin vs. simple Reg-T (standard 20% naked, width+credit for spreads)? The current `option_backtest_service.py` has a basic margin calculator.
3. **Old page redirects**: Should old routes (`/trader/backtest/options`, `/backtesting`) redirect to `/backtest` or keep both until the new UI is validated?

---

## 6. Validation Plan

1. Run existing backtest on SPY PCS → capture output
2. Run new engine with identical params → compare metrics (should match within slippage bounds)
3. Verify concurrent positions produce different equity curve than sequential
4. Verify slippage model produces lower returns than mid model
5. Verify Sortino < Sharpe (downside deviation > total deviation)
6. TypeScript: 0 errors on frontend
7. Python: all modules import clean

---

## 7. File Changes Summary

| File | Action | Lines |
|------|--------|-------|
| `backend/options_backtest_engine.py` | Rewrite | 283 → ~500 |
| `backend/engines/metrics.py` | Create | ~150 |
| `backend/engines/slippage.py` | Create | ~60 |
| `backend/routers/backtest_run.py` | Create | ~120 |
| `backend/routers/backtest_options.py` | Minor update (delegate) | +20 |
| `frontend/src/pages/BacktestPage.tsx` | Create | ~400 |
| `frontend/src/components/backtest/*.tsx` | Create (5-6 files) | ~150 each |
| `frontend/src/pages/BacktestingPage.tsx` | Replace with redirect | ~20 |
| `frontend/src/pages/OptionsStationPage.tsx` | Replace with redirect | ~20 |

**Total estimated: ~1,600 new lines, ~300 modified**

---

Want me to proceed with implementation? If yes, I'll start with Phase 1 (engine rewrite) since it's the foundation everything else depends on.

# ResearchWorkspace & Options Backtest Platform — Audit & Enhancement Plan

> **Date:** 2026-07-21
> **Goal:** Audit every open issue (missing delta/metrics, chart broken, data catalog empty, AI offline) and map the fix.

---

## 🧠 Part 1: What a Comprehensive Options Backtest Dashboard Should Include

Based on industry standards (TastyTrade, OptionNet Explorer, ThinkOrSwim, CBOE Livevol):

### Core Metrics (current backtest returns 7 — needs 15+)
| Current | Missing |
|---|---|
| Total Trades | **Avg Win / Avg Loss** |
| Win Rate | **Payoff Ratio (Avg Win ÷ Avg Loss)** |
| Total PnL | **CAGR % (annualized return)** |
| Sharpe Ratio | **Sortino Ratio (downside deviation only)** |
| Max Drawdown % | **Calmar Ratio (CAGR ÷ Max DD)** |
| Profit Factor | **Expectancy ($ per trade)** |
| Avg Days Held | **Avg Credit / Avg Debit per trade** |

### Per-Trade Fields (current trade record has 7 — needs 20+)
| Current | Missing |
|---|---|
| entry_date, exit_date | **Entry delta per leg** |
| expiration | **Entry IV per leg** |
| dte_at_entry, dte_at_exit | **Exit IV per leg** |
| days_held | **Credit received / Debit paid** |
| entry_cost | **Underlying price at entry/exit** |
| pnl, exit_reason | **Max favorable excursion (MFE)** |
| | **Max adverse excursion (MAE)** |
| | **Theta decay captured** |
| | **Vega P&L component** |
| | **Days in trade** |
| | **Exit mid price** |

### Visualizations
| Status | Item |
|---|---|
| ❌ Broken | Candlestick chart with indicators (lightweight-charts) |
| ✅ Tabs exist | Config / Backtest / Chart / History |
| ❌ Missing | **Equity curve (P&L over time)** — exists in backend data, no chart |
| ❌ Missing | **Drawdown curve** |
| ❌ Missing | **Monthly P&L heatmap** |
| ❌ Missing | **Trade distribution histogram** (PnL bins) |
| ❌ Missing | **Win/Loss streak bar** |
| ❌ Missing | **Rolling Sharpe / Win Rate (n-trade window)** |

### Greeks Exposure — Most critical missing piece
The `options_backtest_engine.py` computes entry/exit cost from bid/ask mid but **never reads or stores delta, gamma, theta, vega, or rho** from the parquet data. This means:
- No way to filter entries by delta (critical for PCS strategies — target 16-20Δ)
- No way to attribute P&L to Greeks
- No way to analyze greeks exposure over time

The parquet files already have these fields (`delta`, `gamma`, `theta`, `vega`, `rho`) — the engine just doesn't capture them.

---

## 🔍 Part 2: Root Cause Analysis — Each Issue

### Issue A: Delta & Metrics Missing from Backtest

**Root Cause:** `options_backtest_engine.py:242-258` — the `run()` method returns a metrics dict with only 7 fields. The parquet data has `delta` and all other greeks, but the engine:
1. Filters by `dte` and `right` but NOT by `delta` — entry selection is essentially random (uses `groupby("expiration").size().idxmax()`)
2. Never reads `delta`, `gamma`, `theta`, `vega`, `rho` from the matched rows
3. Never stores greeks in the trade record
4. Only computes: total_trades, win_rate, total_pnl, profit_factor, sharpe, max_drawdown, avg_days_held

**Fix:** Add delta filtering to entry logic, store greeks in each trade record, add missing metrics to output.

### Issue B: Chart View Not Working

**Root Cause:** `options_backtest_engine.py:16` — `ARCHIVE_PATH` is **hardcoded**:
```python
ARCHIVE_PATH = Path("/workspace/Archive/Nautilus_Archive5min")
```
But the routers (`chart.py`, `data_ingestion.py`, `options_lab.py`) correctly read from env var:
```python
OPTIONS_ARCHIVE = Path(os.getenv("OPTIONS_ARCHIVE_PATH", "/workspace/Archive/Nautilus_Archive5min"))
```

If the user's archive is at a different path, the **backtest engine** finds no data (`FileNotFoundError`), while the **chart router** reads from the correct env var path.

**Potential Second Issue:** The `ChartPage.tsx` only fetches data when the component mounts (the `useEffect` has `[ticker, trades.length]` as deps but doesn't include `startDate`, `endDate`, or `indicators`). The range and indicator selectors change state but **don't trigger a re-fetch**.

**Fix:** 
1. Change `options_backtest_engine.py` to read `ARCHIVE_PATH` from env var
2. Add missing deps to ChartView useEffect

### Issue C: Data Catalog Shows Nothing

**Root Cause:** The `data_ingestion.py` router has TWO separate archive paths:
- `OPTIONS_ARCHIVE = Path(os.getenv("OPTIONS_ARCHIVE_PATH", "/workspace/Archive/Nautilus_Archive5min"))` (line 22)
- `EQUITY_ARCHIVE = Path(os.getenv("EQUITY_ARCHIVE_PATH", "/workspace/Archive/Equity_Archive"))` (line 23)

If the user correctly set `OPTIONS_ARCHIVE_PATH` in `.env` but:
1. No `.env` file exists at the backend root (`/opt/data/nautilus_web_interface/backend/.env`) — confirmed: search returned 0 results
2. The `.env` might exist at project root but `nautilus_fastapi.py` only loads from `Path(__file__).parent.parent / ".env"` — which is `backend/../.env` i.e. project root — so that should work
3. **OR** the directories specified by `OPTIONS_ARCHIVE_PATH` don't have the expected structure (ticker directories with `*.parquet` files inside)

**Fix:** Check the actual archive path exists, verify directory structure matches `{ticker}/{ticker}_{year}.parquet`.

### Issue D: AI Assistant Not Connecting

**Root Cause:** The `ai_assistant.py` router reads:
```python
LLM_BASE_URL = os.getenv("LLM_BASE_URL", os.getenv("OLLAMA_BASE_URL", "http://localhost:8080"))
```

If the user set `LLM_BASE_URL` in `.env` but:
1. The `.env` file doesn't exist at the right location — same issue as above
2. OR the LLM server isn't actually running at that URL
3. OR the frontend's `checkStatus()` API call is failing silently (the `AIAssistant.tsx` catches errors and sets `unavailable` but doesn't show the actual error)

The `GET /api/ai/status` endpoint tries to hit `{LLM_BASE_URL}/v1/models` (for llama-server) or `{LLM_BASE_URL}/api/tags` (for ollama). If the URL is correct but the server isn't running, it returns `available: false`.

**Fix:** Check the `.env` location, verify LLM server is running, add error detail to the frontend.

---

## 🛠 Part 3: Fix Plan — Step by Step

### File Path Summary

| # | File | Action |
|---|---|---|
| 1 | `backend/options_backtest_engine.py` | Fix hardcoded `ARCHIVE_PATH`, add delta filter, add greeks to trades, expand metrics |
| 2 | `backend/routers/backtest_options.py` | Add delta range to request model, forward to engine |
| 3 | `frontend/src/components/ChartView.tsx` | Add missing deps to useEffect, fix re-fetch on param change |
| 4 | `frontend/src/pages/ResearchWorkspace.tsx` | Expand BacktestMetrics interface, add delta/theta/vega display, add expanded metric boxes |
| 5 | Check `.env` exists at project root | Critical for all env-var-dependent features |

### Task 1: Fix Hardcoded Archive Path in Engine

**File:** `backend/options_backtest_engine.py`, line 16

```python
# BEFORE:
ARCHIVE_PATH = Path("/workspace/Archive/Nautilus_Archive5min")

# AFTER:
import os
ARCHIVE_PATH = Path(os.getenv("OPTIONS_ARCHIVE_PATH", "/workspace/Archive/Nautilus_Archive5min"))
```

### Task 2: Add Delta Filtering & Greeks Capture to Engine

**File:** `backend/options_backtest_engine.py`

Changes needed:
1. Add `entry_delta_min` / `entry_delta_max` params to `OptionsBacktestEngine.__init__`
2. In `_calc_entry_cost()`, also return delta for each leg
3. Store per-leg greeks in each trade record
4. Compute additional metrics (CAGR, Sortino, Calmar, expectancy, avg win/loss)

### Task 3: Add Delta Range to Backtest Request & Forward to Engine

**File:** `backend/routers/backtest_options.py`

Add to `BacktestRequest`:
```python
entry_delta_min: float = Field(0.0, ge=0.0, le=1.0)
entry_delta_max: float = Field(1.0, ge=0.0, le=1.0)
```

Forward to engine constructor.

### Task 4: Fix ChartView Re-fetch

**File:** `frontend/src/components/ChartView.tsx`

Change `useEffect` deps from `[ticker, trades.length]` to:
```typescript
[ticker, trades.length, startDate, endDate, indicators]
```

### Task 5: Expand ResearchWorkspace.tsx Dashboard

Add display for all new metrics, add equity curve tab (recharts from existing data), add drawdown chart, add trade distribution. All data is already in the `BacktestResult` response — just needs frontend to render it.

### Task 6: Verify .env Configuration

Create `.env` at the project root (`/opt/data/nautilus_web_interface/.env`) if it doesn't exist:
```env
OPTIONS_ARCHIVE_PATH=/path/to/your/Nautilus_Archive5min
EQUITY_ARCHIVE_PATH=/path/to/your/Equity_Archive
LLM_BASE_URL=http://your-llm-host:port
LLM_MODEL=your-model-name
```

Then restart the backend.

---

## 📊 Part 4: Enhanced Dashboard Wireframe (ResearchWorkspace.tsx)

```
┌─────────────────────────────────────────────────────────────────────┐
│  Left Panel (Projects)    │  Center Workspace (Tabs)               │
│  ┌─────────────────────┐  │  ┌──────────────────────────────────┐  │
│  │ Projects (7)   [+New]│  │  │ Config │ Backtest │ Chart │ Hist│  │
│  │─────────────────────│  │  │──────────────────────────────────│  │
│  │ ○ SPY PCS 2025      │  │  │                                  │  │
│  │ ○ QQQ Iron Condor   │  │  │ [BACKTEST TAB — expanded view]   │  │
│  │ ○ AAPL Calendar     │  │  │ ┌────────────────────────────┐  │  │
│  │ ○ ...               │  │  │ │ Total PnL    Win Rate     │  │  │
│  │                     │  │  │ │ +$12,450    62.3%         │  │  │
│  │                     │  │  │ │ Sharpe     Sortino        │  │  │
│  │                     │  │  │ │ 1.42       1.18           │  │  │
│  │                     │  │  │ │ Max DD     Calmar         │  │  │
│  │                     │  │  │ │ -18.2%     0.42           │  │  │
│  │                     │  │  │ │ Avg Win    Avg Loss       │  │  │
│  │                     │  │  │ │ +$487      -$312          │  │  │
│  │                     │  │  │ │ Payoff     Expectancy     │  │  │
│  │                     │  │  │ │ 1.56       +$185/trade    │  │  │
│  │                     │  │  │ │ Avg Δ      Avg IV         │  │  │
│  │                     │  │  │ │ 0.18       24.3%          │  │  │
│  │                     │  │  │ │ Trades: 247               │  │  │
│  │                     │  │  │ └────────────────────────────┘  │  │
│  │                     │  │  │ [Equity Curve ▼] [DD Curve ▼]  │  │
│  │                     │  │  │ [Distribution ▼]                │  │
│  │                     │  │  └──────────────────────────────────┘  │
│  │                     │  │                                        │
│  └─────────────────────┘  │  ┌──────────────────────────────────┐  │
│                           │  │ 💬 AI Analysis [▲]              │  │
│  [Collapsible AI Panel]   │  │ [Chat messages...]               │  │
│                           │  │ [________________________] [⇨]  │  │
│                           │  └──────────────────────────────────┘  │
└─────────────────────────────────────────────────────────────────────┘
```

---

## ✅ Verification Steps

After all fixes:
1. Start backend: `cd backend && python nautilus_fastapi.py`
2. Open frontend: `http://localhost:5173/research/workspace`
3. Create a project, configure SPY PCS (sell 620P / buy 610P, 30-45 DTE, 0.16-0.20Δ)
4. Run backtest → verify 15+ metrics shown
5. Click "Chart" tab → verify equity curve renders
6. Open Data Catalog → verify archive tickers appear
7. Click "Analyze Results" → verify AI responds

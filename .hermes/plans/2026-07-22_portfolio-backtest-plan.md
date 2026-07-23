# Portfolio & Margin Backtester — Architecture Plan

> **Status:** Design proposal
> **Scope:** New portfolio/margin backtester + project creation dialog + navigation cleanup

---

## 1. What Changes

### Navigation Cleanup
- Remove standalone "Backtesting" and "Portfolio Designer" nav items
- All backtesting lives inside the **Research Workspace**
- Add a "Quick Backtest" floating button in the workspace header

### Project Creation Dialog
When clicking "New Project" in ResearchWorkspace, show a dialog with:

```
┌──────────────────────────────────────────┐
│  New Research Project                    │
│                                          │
│  Name: [________________________]        │
│                                          │
│  Type:                                   │
│  ○ Options Strategy Backtest             │
│  ○ Portfolio / Margin Backtest           │
│                                          │
│  [Cancel]  [Create Project]              │
└──────────────────────────────────────────┘
```

Selecting "Portfolio" redirects to the Portfolio Backtest tab in the workspace.

### Research Workspace Tabs (per project type)
| Project Type | Available Tabs |
|-------------|---------------|
| Options Strategy | Config / Backtest / Chart / History |
| Portfolio / Margin | Portfolio Config / Portfolio Results / Chart / Ledger |

---

## 2. Backend — Portfolio Backtest Engine

### Data Model

```python
class PortfolioAsset:
    ticker: str          # e.g. "SPY", "QQQ", "TLT"
    weight: float        # target allocation % (0-100)
    dividend_yield: float  # estimated annual yield

class PortfolioConfig:
    assets: List[PortfolioAsset]
    initial_cash: float = 100_000
    margin_target: float = 0.0       # target margin debt
    margin_rate: float = 0.065       # annual margin interest rate
    interest_free_buffer: float = 1000  # first $X borrowed is interest-free
    drip_enabled: bool = True        # dividend reinvestment
    start_date: str = "2020-01-01"
    end_date: str = ""
    deposits: List[CashEvent]        # scheduled deposits
    withdrawals: List[CashEvent]     # scheduled withdrawals
```

### Core Equations

**Daily Interest Accrual:**
```
Net Margin Balance = max(0, Total Borrowed - Interest-Free Buffer)
Daily Interest = Net Margin Balance × (Annual Rate / 360)
```

**Maintenance Margin:**
```
MMR = Portfolio Long Value × 0.25  # 25% for most equities
Equity = Total Portfolio Value - Margin Debt
Margin Call if: Equity < MMR
```

**Dividend DRIP / Paydown:**
```
If DRIP: Dividends → Buy more shares
If Paydown: Dividends → Reduce margin balance first
```

**Cash Flow Timeline:**
```
For each date in simulation:
  ├── Apply scheduled deposits → reduce margin / increase cash
  ├── Apply scheduled withdrawals → increase margin / reduce cash
  ├── Accrue daily margin interest
  ├── Collect dividends (monthly/quarterly)
  ├── Check margin call condition
  └── Record portfolio snapshot
```

### API Endpoint

```
POST /api/portfolio/backtest

Request:
{
  assets: [{ ticker, weight, dividend_yield }],
  initial_cash: 100000,
  margin_target: 0,
  margin_rate: 0.065,
  interest_free_buffer: 1000,
  drip_enabled: true,
  start_date: "2020-01-01",
  end_date: "2024-12-31",
  deposits: [{ date: "2020-06-01", amount: 50000 }],
  withdrawals: []
}

Response:
{
  success: true,
  metrics: {
    total_return: 45231.50,
    total_return_pct: 45.2,
    cagr_pct: 8.3,
    total_dividends_collected: 12450.00,
    total_margin_interest_paid: 3200.50,
    net_yield_spread: 2.1,        // div yield % - margin drag %
    max_drawdown_pct: -12.3,
    margin_calls: 0,
    avg_distance_to_call_pct: 45.2,
    sharpe_ratio: 0.95,
  },
  equity_curve: [{ date, portfolio_value, equity, margin_debt, dividends, interest }],
  ledger: [{ date, type, amount, description }],
}
```

### Files to Create

| File | Purpose |
|------|---------|
| `backend/engines/portfolio_engine.py` | Core portfolio simulation engine |
| `backend/routers/portfolio_backtest.py` | API endpoint |
| `backend/engines/margin.py` | Margin interest / MMR calculations |

---

## 3. Frontend

### ResearchWorkspace.tsx — Updated Project Creation
- Add radio button group to CreateProjectDialog
- Store `project_type` when creating
- Change available tabs based on project type

### New Components

| Component | Purpose |
|-----------|---------|
| `frontend/src/components/portfolio/PortfolioConfigPanel.tsx` | Asset allocation, margin, dividend settings |
| `frontend/src/components/portfolio/PortfolioResultsPanel.tsx` | Metrics display |
| `frontend/src/components/portfolio/PortfolioChart.tsx` | Multi-line equity + margin chart |
| `frontend/src/components/portfolio/PortfolioLedger.tsx` | Monthly ledger table |

### Navigation Cleanup
- Remove `/backtesting` and `/portfolio-designer` from sidebar
- Add Quick Backtest button to ResearchWorkspace header

---

## 4. Implementation Order

1. Create `engines/margin.py` — interest calculations
2. Create `engines/portfolio_engine.py` — full simulation
3. Create `routers/portfolio_backtest.py` — API endpoint
4. Wire router into `nautilus_fastapi.py`
5. Update `CreateProjectDialog` in ResearchWorkspace.tsx
6. Create portfolio components
7. Update tabs to be project-type aware
8. Add Quick Backtest button
9. Navigation cleanup

---

## 5. File Changes Summary

| File | Action | Est. Lines |
|------|--------|-----------|
| `backend/engines/margin.py` | Create | 60 |
| `backend/engines/portfolio_engine.py` | Create | 300 |
| `backend/routers/portfolio_backtest.py` | Create | 100 |
| `backend/nautilus_fastapi.py` | Modify (add router) | +3 |
| `frontend/src/pages/ResearchWorkspace.tsx` | Modify (dialog, tabs, portfolio panels) | +400 |
| `frontend/src/components/portfolio/*.tsx` | Create (4 files) | ~500 total |
| Frontend nav config | Modify | +10 |

**Total estimated: ~1,400 new lines**

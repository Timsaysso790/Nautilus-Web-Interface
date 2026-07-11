import api from '@/lib/api';

export interface OptionLegRequest {
  strike: number;
  right: "call" | "put";
  quantity: number;
  action: "buy" | "sell";
}

export interface OptionBacktestConfig {
  symbol: string;
  strategy_type: string;
  entry_dte: number;
  hold_until_dte: number;
  entry_frequency_days: number;
  start_date: string;
  end_date: string;
  starting_balance: number;
  commission_per_contract: number;
  legs: OptionLegRequest[];
}

export interface PnLAttribution {
  delta: number;
  gamma: number;
  theta: number;
  vega: number;
  unexplained: number;
}

export interface TradeRecord {
  entry_date: string;
  exit_date: string;
  entry_price: number;
  exit_price: number;
  net_credit: number;
  commission: number;
  pnl: number;
  margin: number;
  iv: number;
  attribution: PnLAttribution;
}

export interface EquityPoint {
  date: string;
  equity: number;
  margin: number;
}

export interface OptionBacktestSummary {
  total_trades: number;
  winning_trades: number;
  losing_trades: number;
  win_rate: number;
  total_pnl: number;
  avg_pnl_per_trade: number;
  avg_margin_per_trade: number;
  max_drawdown_pct: number;
  sharpe_ratio: number;
  total_commission: number;
  net_pnl: number;
  pnl_attribution: PnLAttribution;
  return_pct: number;
}

export interface OptionBacktestResult {
  success: boolean;
  config: OptionBacktestConfig;
  summary: OptionBacktestSummary;
  equity_curve: EquityPoint[];
  trades: TradeRecord[];
}

export interface OptionStrategyDef {
  id: string;
  label: string;
  description: string;
  margin_rule: string;
}

export const optionBacktestService = {
  async listStrategies() {
    return api.get<{ strategies: OptionStrategyDef[]; count: number }>('/api/nautilus/option-strategies');
  },

  async getStrategyDefaults(strategyType: string, symbol = "SPY") {
    return api.get<{ strategy_type: string; config: OptionBacktestConfig }>(
      `/api/nautilus/option-strategies/${strategyType}/defaults?symbol=${symbol}`
    );
  },

  async runBacktest(params: {
    symbol: string;
    strategy_type: string;
    legs: OptionLegRequest[];
    entry_dte: number;
    hold_until_dte: number;
    entry_frequency_days: number;
    start_date: string;
    end_date: string;
    starting_balance: number;
    commission_per_contract: number;
    risk_free_rate: number;
  }) {
    return api.post<OptionBacktestResult>('/api/nautilus/option-backtest', params);
  },

  // ── Projects ──────────────────────────────────────────────────────────────

  async listProjects() {
    return api.get<{ projects: any[] }>('/api/backtest/projects');
  },

  async createProject(name: string) {
    return api.post<{ project: any }>('/api/backtest/projects', { name });
  },

  async deleteProject(projectId: string) {
    return api.delete(`/api/backtest/projects/${projectId}`);
  },

  // ── Templates ─────────────────────────────────────────────────────────────

  async listTemplates() {
    return api.get<{ templates: any[] }>('/api/backtest/templates');
  },

  async saveTemplate(name: string, config: any) {
    return api.post<{ template: any }>('/api/backtest/templates', { name, config });
  },

  async deleteTemplate(templateId: string) {
    return api.delete(`/api/backtest/templates/${templateId}`);
  },

  // ── Options Station Backtest ──────────────────────────────────────────────

  async runOptionsStation(config: any) {
    return api.post<any>('/api/backtest/options-station/run', config);
  },

  // ── Portfolio Engine Backtest ────────────────────────────────────────────

  async runPortfolioBacktest(config: any) {
    return api.post<any>('/api/backtest/portfolio/run', config);
  },

  async fetchDividends(ticker: string) {
    return api.get<{ ticker: string; dividends: { date: string; amount: number }[]; cached: boolean }>(
      `/api/backtest/portfolio/dividends?ticker=${ticker}`
    );
  },

  async fetchMacroPrices(symbols = "QQQ,IWM") {
    return api.get<{ symbols: Record<string, { close: number | null; date: string | null }> }>(
      `/api/backtest/portfolio/macro-prices?symbols=${symbols}`
    );
  },
};

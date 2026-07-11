export interface BacktestProject {
  id: string;
  name: string;
  created_at: string;
  updated_at: string;
  config_count: number;
}

export interface BacktestTemplate {
  id: string;
  name: string;
  config: CompiledStrategy;
  created_at: string;
}

export interface OptionLeg {
  id: string;
  action: "buy" | "sell";
  right: "call" | "put";
  quantity: number;
  dte: number;
  strikeModel: "atm" | "otm" | "itm" | "fixed" | "locked_offset";
  strikeValue: number;
  parentLegId: string | null;
  lockedOffset: boolean;
}

export interface Condition {
  id: string;
  source: "underlying_price" | "days_to_expiry" | "iv" | "theta" | "delta" | "rsi" | "sma" | "bb_position";
  operator: "gt" | "gte" | "lt" | "lte" | "eq" | "crosses_above" | "crosses_below";
  target: ConditionTarget;
}

export interface ConditionTarget {
  type: "value" | "indicator";
  value: number;
  indicator?: string;
}

export interface ConditionGroup {
  logic: "all" | "any";
  conditions: Condition[];
}

export interface ExitRules {
  profitTargetPct: number | null;
  stopLossPct: number | null;
  trailingStopPct: number | null;
  trailingStopActivationPct: number;
  earlyExitDte: number | null;
  intradayCutoff: string;
  conflictResolution: "first_hit" | "best" | "worst";
}

export interface CompiledStrategy {
  projectId: string;
  projectName: string;
  global: {
    symbol: string;
    dateRange: { start: string; end: string };
    initialCapital: number;
    sizing: { strategy: "contracts" | "dollars" | "nav_pct"; value: number };
    slippageBps: number;
    dataResolution: "1m" | "5m" | "daily";
  };
  legs: OptionLeg[];
  entryConditions: ConditionGroup;
  exitRules: ExitRules;
}

export interface BacktestResult {
  success: boolean;
  config: CompiledStrategy;
  summary: {
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
    pnl_attribution: { delta: number; gamma: number; theta: number; vega: number; unexplained: number };
    return_pct: number;
  };
  equity_curve: { date: string; equity: number; margin: number }[];
  trades: {
    entry_date: string;
    exit_date: string;
    entry_price: number;
    exit_price: number;
    net_credit: number;
    commission: number;
    pnl: number;
    margin: number;
    iv: number;
    attribution: { delta: number; gamma: number; theta: number; vega: number; unexplained: number };
  }[];
}

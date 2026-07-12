export interface BacktestProject {
  id: string;
  name: string;
  project_type: string;
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
  strikeModel: "atm" | "otm" | "itm" | "fixed" | "locked_offset" | "delta";
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
  closeRollDteEnabled: boolean;
  closeRollDte: number;
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
    fillModel: "mid" | "natural" | "linear_split";
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

// ── Portfolio Engine Types ─────────────────────────────────────────────────

export interface PortfolioAsset {
  ticker: string;
  allocation: number;
  dripEnabled: boolean;
}

export interface LumpSumInjection {
  date: string;
  amount: number;
  label: string;
}

export interface CashSchedule {
  enabled: boolean;
  paycheckAmount: number;
  paycheckFrequency: "monthly" | "weekly" | "biweekly";
  lumpSumInjections: LumpSumInjection[];
}

export interface ValuationClearanceConfig {
  enabled: boolean;
  rsiThreshold: number;
  bbPeriod: number;
  bbStdDev: number;
  frontLoadMonths: number;
}

export interface MarginBridgeConfig {
  enabled: boolean;
  maxLeverage: number;
  maintenanceRate: number;
  borrowRate: number;
  debtGovernorPct: number;
  freezeDays: number;
}

export interface VixRatioBackspreadLeg {
  dte: number;
  action: "buy" | "sell";
  right: "call" | "put";
  quantity: number;
  strikeModel: "atm" | "otm";
}

export interface SpikeHarvestTrigger {
  enabled: boolean;
  vixSpikeMultiplier: number;
  vixMaPeriod: number;
  reentryVixThreshold: number;
}

export interface VixHedgeConfig {
  enabled: boolean;
  vixTicker: string;
  ladder45dte: VixRatioBackspreadLeg[];
  ladder90dte: VixRatioBackspreadLeg[];
  systematicRollThreshold: number;
  opportunisticRollVixMin: number;
  spikeHarvest: SpikeHarvestTrigger;
}

export interface PortfolioConfig {
  assets: PortfolioAsset[];
  cashSchedule: CashSchedule;
  clearanceConfig: ValuationClearanceConfig;
  marginConfig: MarginBridgeConfig;
  vixConfig: VixHedgeConfig;
  startDate: string;
  endDate: string;
  initialCash: number;
}

export type ClearanceState = "NORMAL" | "CLEARANCE_ACTIVE";

export interface TimeMachineResult {
  currentNav: number;
  futureNav: number;
  projectedDividends3m: number;
  projectedPaychecks3m: number;
  frontLoadCapacity: number;
  clearanceActive: boolean;
}

export interface MarginState {
  utilization: number;
  isFrozen: boolean;
  freezeStartDate: string;
  thawDays: number;
  totalDebt: number;
  totalAssetValue: number;
}

export interface PortfolioSummary {
  totalReturnPct: number;
  totalDividendsCollected: number;
  totalMarginPaid: number;
  totalMarginInterestPaid: number;
  spikeHarvestCount: number;
  totalVixPnl: number;
  clearanceEntryCount: number;
  maxUtilization: number;
  avgUtilization: number;
  finalCash: number;
  finalEquityValue: number;
  finalDebt: number;
}

export interface PortfolioEquityPoint {
  date: string;
  cash: number;
  equityValue: number;
  totalDebt: number;
  nav: number;
  clearance: ClearanceState;
}

export interface PortfolioBacktestResult {
  success: boolean;
  summary: PortfolioSummary;
  equityCurve: PortfolioEquityPoint[];
  positions: { ticker: string; shares: number; avgCost: number }[];
  clearanceEvents: { date: string; type: string; detail: string }[];
  marginHistory: { date: string; utilization: number; isFrozen: boolean; debt: number }[];
  vixLadderHistory: { date: string; ladderDte: number; status: string; pnl: number }[];
}

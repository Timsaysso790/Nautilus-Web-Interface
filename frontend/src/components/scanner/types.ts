export interface OptionSpread {
  width: number;
  longStrike: number;
  netCredit: number;
  yieldPct: number;
  maxRisk: number;
}

export interface ScanEntry {
  ticker: string;
  signal_type: "radar_alert" | "trigger_entry";
  price: number;
  rsi: number;
  bb_lower?: number;
  bb_upper?: number;
  news_classification?: "passive" | "skip" | "transitional" | "fatal";
  news_confidence?: number;
  news_summary?: string;
  dte?: number;
  composite_score?: number;
  shortDelta?: number;
  shortStrike?: number;
  passingSpreads?: OptionSpread[];
}

export interface ScanSession {
  scanId: string;
  timestamp: string;
  results: ScanEntry[];
}

export interface DateGroup {
  date: string;
  sessions: ScanSession[];
}

export interface ScansResponse {
  sessions: ScanSession[];
  results: ScanEntry[];
}

export interface BalanceData {
  netLiq: number;
  cashBalance: number;
  buyingPower: number;
}

export type SortField = "rsi" | "price" | "dte" | "composite_score";
export type SortDir = "asc" | "desc";

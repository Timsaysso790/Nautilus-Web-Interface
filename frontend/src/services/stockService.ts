import api from '@/lib/api';

export interface Quote {
  symbol: string;
  price: number | null;
  change: number | null;
  change_pct: number | null;
  bid: number | null;
  ask: number | null;
  volume: number | null;
  open: number | null;
  high: number | null;
  low: number | null;
  prev_close: number | null;
  market_cap: number | null;
  name: string;
  exchange: string | null;
  timestamp: string;
}

export interface Bar {
  timestamp: string;
  open: number;
  high: number;
  low: number;
  close: number;
  volume: number;
}

export interface StockInfo {
  symbol: string;
  name: string;
  sector: string | null;
  industry: string | null;
  exchange: string | null;
  market_cap: number | null;
  pe_ratio: number | null;
  dividend_yield: number | null;
  beta: number | null;
  "52w_high": number | null;
  "52w_low": number | null;
  avg_volume: number | null;
  description: string | null;
}

export interface WatchlistItem {
  symbol: string;
  added_at: string;
  notes: string;
}

export interface SearchResult {
  symbol: string;
  name: string;
  source: string;
}

export const stockService = {
  async search(query: string) {
    return api.get<{ results: SearchResult[]; count: number }>(`/api/stocks/search?q=${encodeURIComponent(query)}`);
  },

  async getQuote(symbol: string) {
    return api.get<Quote>(`/api/stocks/${encodeURIComponent(symbol)}/quote`);
  },

  async getHistory(symbol: string, interval = "1d", start?: string, end?: string) {
    const params = new URLSearchParams({ interval });
    if (start) params.set("start", start);
    if (end) params.set("end", end);
    return api.get<{ symbol: string; interval: string; bars: Bar[]; count: number }>(
      `/api/stocks/${encodeURIComponent(symbol)}/history?${params}`
    );
  },

  async getInfo(symbol: string) {
    return api.get<StockInfo>(`/api/stocks/${encodeURIComponent(symbol)}/info`);
  },

  async getWatchlist() {
    return api.get<{ watchlist: WatchlistItem[]; count: number }>("/api/stocks/watchlist");
  },

  async addToWatchlist(symbol: string, notes = "") {
    return api.post<{ success: boolean; symbol: string }>("/api/stocks/watchlist", { symbol, notes });
  },

  async removeFromWatchlist(symbol: string) {
    return api.delete<{ success: boolean }>(`/api/stocks/watchlist/${encodeURIComponent(symbol)}`);
  },
};

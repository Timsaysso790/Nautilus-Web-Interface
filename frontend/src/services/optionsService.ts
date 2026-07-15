import api from '@/lib/api';

export interface OptionContract {
  symbol: string;
  strike: number;
  right: "call" | "put";
  bid: number | null;
  ask: number | null;
  last: number | null;
  volume: number;
  open_interest: number;
  implied_volatility: number | null;
  delta: number | null;
  gamma: number | null;
  theta: number | null;
  vega: number | null;
  rho: number | null;
  iv: number | null;
  underlying_price: number | null;
  expiration: string;
}

export interface OptionChain {
  symbol: string;
  expiration: string;
  underlying_price: number | null;
  calls: OptionContract[];
  puts: OptionContract[];
}

export interface PayoffLeg {
  strike: number;
  right: "call" | "put";
  quantity: number;
  entry_price: number;
}

export interface PayoffPoint {
  underlying_price: number;
  pnl: number;
  legs: number[];
}

export interface PayoffResult {
  payoff: PayoffPoint[];
  legs: PayoffLeg[];
  price_range: { min: number; max: number } | null;
}

export interface BSMParams {
  underlying_price: number;
  strike: number;
  time_to_expiry: number;
  risk_free_rate: number;
  volatility: number;
  right: "call" | "put";
}

export interface BSMResult {
  price: number;
  delta: number;
  gamma: number;
  theta: number;
  vega: number;
  rho: number;
  d1: number;
  d2: number;
}

export const optionsService = {
  async getExpirations(symbol: string) {
    return api.get<{ symbol: string; expirations: string[]; count: number }>(
      `/api/options/${encodeURIComponent(symbol)}/expirations`
    );
  },

  async getChain(symbol: string, expiration: string) {
    return api.get<OptionChain>(
      `/api/options/${encodeURIComponent(symbol)}/chain?expiration=${encodeURIComponent(expiration)}`
    );
  },

  async getGreeks(symbol: string, expiration: string, strike: number, right: string) {
    return api.get<any>(
      `/api/options/${encodeURIComponent(symbol)}/greeks?expiration=${encodeURIComponent(expiration)}&strike=${strike}&right=${right}`
    );
  },

  async calculateBSM(params: BSMParams) {
    return api.post<BSMResult>("/api/options/calculate", params);
  },

  async calculatePayoff(legs: PayoffLeg[], priceMin?: number, priceMax?: number) {
    return api.post<PayoffResult>("/api/options/payoff", {
      legs,
      price_min: priceMin,
      price_max: priceMax,
      steps: 100,
    });
  },
};

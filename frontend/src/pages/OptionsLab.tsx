import { useState, useEffect, useCallback } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import {
  Activity, LineChart, Calculator,
  Sigma, RefreshCw, Plus, X, FlaskConical, Loader2
} from "lucide-react";
import api from "@/lib/api";

const API_BASE = "http://localhost:8000";
const YEAR = "2025";

/* ───────── types ───────── */
interface ChainRowRaw {
  strike: number;
  right: "C" | "P";
  bid: number;
  ask: number;
  last: number;
  volume: number;
  trades: number;
  iv: number;
  delta: number;
  gamma: number;
  theta: number;
  vega: number;
  rho: number;
}

interface ChainResponse {
  ticker: string;
  expiration: string;
  underlying_price: number;
  rows: ChainRowRaw[];
}

interface OptionContract {
  strike: number;
  bid: number;
  ask: number;
  last: number;
  iv: number;
  delta: number;
  gamma: number;
  theta: number;
  vega: number;
  volume: number;
  oi: number;
}

interface ChainRow {
  strike: number;
  call: OptionContract | null;
  put: OptionContract | null;
}

interface StrategyLeg {
  strike: number;
  right: string;
  price: number;
  iv: number;
  delta: number;
}

/* ───────── helpers ───────── */
function greekColor(v: number): string {
  if (v > 0.5) return "text-profit";
  if (v > 0) return "text-gray-200";
  return "text-loss";
}

function rowToContract(r: ChainRowRaw): OptionContract {
  return {
    strike: r.strike,
    bid: r.bid,
    ask: r.ask,
    last: r.last,
    iv: r.iv,
    delta: r.delta,
    gamma: r.gamma,
    theta: r.theta,
    vega: r.vega,
    volume: r.volume,
    oi: r.trades,
  };
}

function buildChain(calls: ChainRowRaw[], puts: ChainRowRaw[]): ChainRow[] {
  const callMap = new Map<number, ChainRowRaw>();
  const putMap = new Map<number, ChainRowRaw>();
  for (const r of calls) callMap.set(r.strike, r);
  for (const r of puts) putMap.set(r.strike, r);
  const allStrikes = new Set([...callMap.keys(), ...putMap.keys()]);
  return [...allStrikes].sort((a, b) => a - b).map((strike) => ({
    strike,
    call: callMap.has(strike) ? rowToContract(callMap.get(strike)!) : null,
    put: putMap.has(strike) ? rowToContract(putMap.get(strike)!) : null,
  }));
}

async function fetchChain(symbol: string, expiration: string): Promise<{ rows: ChainRow[]; underlying: number }> {
  const expClean = expiration.replace(/-/g, "");
  const [callsRes, putsRes] = await Promise.all([
    api.get<ChainResponse>(`${API_BASE}/api/options-lab/chain/${symbol}/${expClean}?year=${YEAR}&right=C`),
    api.get<ChainResponse>(`${API_BASE}/api/options-lab/chain/${symbol}/${expClean}?year=${YEAR}&right=P`),
  ]);
  return {
    rows: buildChain(callsRes.rows, putsRes.rows),
    underlying: callsRes.underlying_price ?? putsRes.underlying_price ?? 0,
  };
}

/* ───────── component ───────── */
export default function OptionsLab() {
  const [symbol, setSymbol] = useState("SPY");
  const [symbolInput, setSymbolInput] = useState("SPY");
  const [expiration, setExpiration] = useState("");
  const [expirations, setExpirations] = useState<string[]>([]);
  const [chain, setChain] = useState<ChainRow[]>([]);
  const [underlyingPrice, setUnderlyingPrice] = useState<number>(0);
  const [loadingExpirations, setLoadingExpirations] = useState(false);
  const [loadingChain, setLoadingChain] = useState(false);
  const [chainError, setChainError] = useState(false);
  const [view, setView] = useState<"chain" | "greeks" | "payoff">("chain");
  const [selectedLegs, setSelectedLegs] = useState<StrategyLeg[]>([]);

  /* ── load expirations ── */
  useEffect(() => {
    if (!symbol) return;
    setLoadingExpirations(true);
    setExpiration("");
    api.get<string[]>(`${API_BASE}/api/options-lab/expirations/${symbol}?year=${YEAR}`)
      .then((dates) => {
        const list = Array.isArray(dates) ? dates : [];
        setExpirations(list);
        if (list.length > 0) setExpiration(list[0]);
      })
      .catch(() => {
        setExpirations([]);
      })
      .finally(() => setLoadingExpirations(false));
  }, [symbol]);

  /* ── load chain ── */
  useEffect(() => {
    if (!symbol || !expiration) return;
    setLoadingChain(true);
    setChainError(false);
    fetchChain(symbol, expiration)
      .then(({ rows, underlying }) => {
        setChain(rows);
        setUnderlyingPrice(underlying);
      })
      .catch(() => {
        setChain([]);
        setChainError(true);
      })
      .finally(() => setLoadingChain(false));
  }, [symbol, expiration]);

  const handleRefresh = useCallback(() => {
    if (!symbol || !expiration) return;
    setLoadingChain(true);
    setChainError(false);
    fetchChain(symbol, expiration)
      .then(({ rows, underlying }) => {
        setChain(rows);
        setUnderlyingPrice(underlying);
      })
      .catch(() => {
        setChainError(true);
      })
      .finally(() => setLoadingChain(false));
  }, [symbol, expiration]);

  const handleSymbolSubmit = useCallback(() => {
    setSymbol(symbolInput.toUpperCase());
  }, [symbolInput]);

  const addLeg = (strike: number, right: string, price: number, iv: number, delta: number) => {
    setSelectedLegs((prev) => [...prev, { strike, right, price, iv, delta }]);
  };

  const removeLeg = (idx: number) => {
    setSelectedLegs((prev) => prev.filter((_, i) => i !== idx));
  };

  const totalDebit = selectedLegs.reduce((sum, l) => sum + l.price, 0);

  /* ── ATM detection for display ── */
  const atmStrike = chain.length > 0 && underlyingPrice > 0
    ? chain.reduce((prev, curr) =>
        Math.abs(curr.strike - underlyingPrice) < Math.abs(prev.strike - underlyingPrice) ? curr : prev
      ).strike
    : 0;

  return (
    <div className="space-y-4">
      {/* ── Header ── */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-lg font-semibold text-gray-100 flex items-center gap-2">
            <Activity className="h-5 w-5 text-amber-400" />
            Options Lab
          </h1>
          <p className="text-xs text-gray-500 mt-0.5">
            Chain analysis, greeks, and strategy payoff builder
          </p>
        </div>
        <div className="flex items-center gap-2">
          {underlyingPrice > 0 && (
            <Badge variant="outline" className="text-[11px] text-gray-400 border-gray-700 tabular-mono">
              <span className="text-gray-500 mr-1">SPY</span>$ {underlyingPrice.toFixed(2)}
            </Badge>
          )}
          <Button size="sm" variant="ghost" className="text-gray-500 h-7" onClick={handleRefresh} disabled={loadingChain}>
            <RefreshCw className={`h-3.5 w-3.5 ${loadingChain ? "animate-spin" : ""}`} />
          </Button>
        </div>
      </div>

      {/* ── Controls ── */}
      <div className="flex items-center gap-3 flex-wrap">
        <div className="flex items-center gap-2">
          <label className="text-[11px] text-gray-500">Symbol</label>
          <Input
            value={symbolInput}
            onChange={(e) => setSymbolInput(e.target.value.toUpperCase())}
            onKeyDown={(e) => { if (e.key === "Enter") handleSymbolSubmit(); }}
            className="w-20 h-7 text-xs bg-[#0d1321] border-gray-700"
          />
          <Button size="sm" variant="ghost" className="h-7 text-xs text-gray-500 px-1" onClick={handleSymbolSubmit}>
            Go
          </Button>
        </div>
        <div className="flex items-center gap-2">
          <label className="text-[11px] text-gray-500">Expiration</label>
          {loadingExpirations ? (
            <div className="flex items-center gap-2 h-7 px-2 text-xs text-gray-500">
              <Loader2 className="h-3 w-3 animate-spin" />
              Loading...
            </div>
          ) : (
            <Select value={expiration} onValueChange={setExpiration} disabled={expirations.length === 0}>
              <SelectTrigger className="w-36 h-7 text-xs bg-[#0d1321] border-gray-700">
                <SelectValue placeholder="Select date" />
              </SelectTrigger>
              <SelectContent>
                {expirations.map((e) => (
                  <SelectItem key={e} value={e} className="text-xs">{e}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          )}
        </div>
        <Tabs value={view} onValueChange={(v) => setView(v as typeof view)} className="ml-2">
          <TabsList className="h-7 bg-[#0d1321] border border-gray-800/60">
            <TabsTrigger value="chain" className="text-xs px-3 h-6">Chain</TabsTrigger>
            <TabsTrigger value="greeks" className="text-xs px-3 h-6">Greeks</TabsTrigger>
            <TabsTrigger value="payoff" className="text-xs px-3 h-6">Payoff</TabsTrigger>
          </TabsList>
        </Tabs>
      </div>

      {/* ── Strategy legs bar ── */}
      {selectedLegs.length > 0 && (
        <div className="bg-[#0d1321] border border-gray-800/60 rounded-lg px-4 py-2 flex items-center gap-3 flex-wrap">
          <span className="text-[11px] text-gray-500">Legs ({selectedLegs.length}):</span>
          {selectedLegs.map((leg, i) => (
            <Badge key={i} variant="secondary" className="text-[11px] flex items-center gap-1 h-6">
              {leg.right.toUpperCase()} ${leg.strike} @ ${leg.price.toFixed(2)}
              <button onClick={() => removeLeg(i)} className="ml-1 hover:text-loss">
                <X className="h-3 w-3" />
              </button>
            </Badge>
          ))}
          <span className="text-xs text-gray-600 ml-auto tabular-mono">
            Net {totalDebit >= 0 ? "Debit" : "Credit"}: ${Math.abs(totalDebit).toFixed(2)}
          </span>
        </div>
      )}

      {/* ═══════════════════════════════════════ */}
      {/*  CHAIN VIEW                            */}
      {/* ═══════════════════════════════════════ */}
      {view === "chain" && (
        <div className="bg-[#0d1321] border border-gray-800/60 rounded-lg overflow-hidden">
          {loadingChain ? (
            <div className="flex items-center justify-center py-16">
              <Loader2 className="h-6 w-6 text-amber-400 animate-spin mr-2" />
              <span className="text-sm text-gray-500">Loading chain data...</span>
            </div>
          ) : chainError ? (
            <div className="text-center py-16">
              <p className="text-sm text-gray-500">Failed to load chain data. Check that the backend is running.</p>
              <Button size="sm" variant="outline" className="mt-3 text-xs border-gray-700 text-gray-400" onClick={handleRefresh}>
                <RefreshCw className="h-3 w-3 mr-1" /> Retry
              </Button>
            </div>
          ) : chain.length === 0 ? (
            <div className="text-center py-16">
              <p className="text-sm text-gray-500">No chain data available for {symbol} {expiration}.</p>
            </div>
          ) : (
            <>
              {/* Header row */}
              <div className="grid grid-cols-[1fr_repeat(7,minmax(60px,1fr))_1fr_repeat(7,minmax(60px,1fr))] gap-0">
                <div className="text-[10px] text-gray-600 uppercase tracking-wider px-2 py-2 bg-gray-900/50 border-r border-gray-800/40 border-b border-gray-800/40">
                  Strike
                </div>
                {/* Call headers */}
                <div className="text-[10px] text-gray-500 uppercase tracking-wider text-right px-1.5 py-2 bg-gray-900/50 border-r border-gray-800/40 border-b border-gray-800/40 col-span-7">
                  <span className="text-profit/70">CALLS</span>
                </div>
                {/* Put headers */}
                <div className="text-[10px] text-gray-500 uppercase tracking-wider text-right px-1.5 py-2 bg-gray-900/50 border-b border-gray-800/40 col-span-7">
                  <span className="text-loss/70">PUTS</span>
                </div>

                <div className="text-[10px] text-gray-600 uppercase tracking-wider px-2 py-1 bg-gray-900/50 border-r border-gray-800/40 border-b border-gray-800/40" />
                {["Bid","Ask","IV","Δ","Γ","Θ","ν"].map((h) => (
                  <div key={`c-${h}`} className="text-[10px] text-gray-600 uppercase tracking-wider text-right px-1.5 py-1 bg-gray-900/50 border-r border-gray-800/40 border-b border-gray-800/40">
                    {h}
                  </div>
                ))}
                <div className="text-[10px] text-gray-600 uppercase tracking-wider px-2 py-1 bg-gray-900/50 border-r border-gray-800/40 border-b border-gray-800/40" />
                {["Bid","Ask","IV","Δ","Γ","Θ","ν"].map((h) => (
                  <div key={`p-${h}`} className="text-[10px] text-gray-600 uppercase tracking-wider text-right px-1.5 py-1 bg-gray-900/50 border-b border-gray-800/40">
                    {h}
                  </div>
                ))}
              </div>

              {/* Data rows */}
              <div className="divide-y divide-gray-800/40 max-h-[60vh] overflow-y-auto">
                {chain.map((row) => {
                  const isATM = row.strike === atmStrike;
                  return (
                    <div
                      key={row.strike}
                      className={`grid grid-cols-[1fr_repeat(7,minmax(60px,1fr))_1fr_repeat(7,minmax(60px,1fr))] gap-0 hover:bg-white/[0.02] transition-colors ${
                        isATM ? "bg-amber-400/5" : ""
                      }`}
                    >
                      {/* Strike */}
                      <div className={`px-2 py-2 text-xs tabular-mono font-medium flex items-center border-r border-gray-800/40 cursor-pointer hover:text-amber-400 ${
                        isATM ? "text-amber-400" : "text-gray-300"
                      }`}
                        onClick={() => {
                          if (row.call) addLeg(row.strike, "C", row.call.ask, row.call.iv, row.call.delta);
                          if (row.put) addLeg(row.strike, "P", row.put.ask, row.put.iv, row.put.delta);
                        }}
                        title="Click to add both legs to strategy"
                      >
                        {row.strike}
                        {isATM && <span className="ml-1 text-[10px] text-amber-400/60">ATM</span>}
                      </div>

                      {/* Call data */}
                      {row.call ? (
                        <>
                          <PriceCell value={row.call.bid} onClick={() => addLeg(row.strike, "C", row.call!.bid, row.call!.iv, row.call!.delta)} />
                          <PriceCell value={row.call.ask} onClick={() => addLeg(row.strike, "C", row.call!.ask, row.call!.iv, row.call!.delta)} />
                          <PctCell value={row.call.iv} />
                          <DeltaCell value={row.call.delta} />
                          <NumCell value={row.call.gamma} />
                          <NumCell value={row.call.theta} />
                          <NumCell value={row.call.vega} />
                        </>
                      ) : (
                        Array(7).fill(null).map((_, i) => <EmptyCell key={i} />)
                      )}

                      {/* Put data */}
                      {row.put ? (
                        <>
                          <PriceCell value={row.put.bid} onClick={() => addLeg(row.strike, "P", row.put!.bid, row.put!.iv, row.put!.delta)} />
                          <PriceCell value={row.put.ask} onClick={() => addLeg(row.strike, "P", row.put!.ask, row.put!.iv, row.put!.delta)} />
                          <PctCell value={row.put.iv} />
                          <DeltaCell value={row.put.delta} />
                          <NumCell value={row.put.gamma} />
                          <NumCell value={row.put.theta} />
                          <NumCell value={row.put.vega} />
                        </>
                      ) : (
                        Array(7).fill(null).map((_, i) => <EmptyCell key={i} />)
                      )}
                    </div>
                  );
                })}
              </div>
            </>
          )}
        </div>
      )}

      {/* ═══════════════════════════════════════ */}
      {/*  GREEKS VIEW — selected row details    */}
      {/* ═══════════════════════════════════════ */}
      {view === "greeks" && (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
          <Card className="bg-[#0d1321] border-gray-800/60">
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-semibold text-gray-100 flex items-center gap-2">
                <Sigma className="h-4 w-4 text-amber-400/70" />
                Greeks — Calls
              </CardTitle>
            </CardHeader>
            <CardContent className="p-0">
              {loadingChain ? (
                <div className="flex items-center justify-center py-10">
                  <Loader2 className="h-5 w-5 text-amber-400 animate-spin" />
                </div>
              ) : (
                <GreeksTable
                  contracts={chain.map((r) => r.call).filter(Boolean) as OptionContract[]}
                  onSelectContract={(c) => addLeg(c.strike, "C", c.ask, c.iv, c.delta)}
                />
              )}
            </CardContent>
          </Card>
          <Card className="bg-[#0d1321] border-gray-800/60">
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-semibold text-gray-100 flex items-center gap-2">
                <Sigma className="h-4 w-4 text-amber-400/70" />
                Greeks — Puts
              </CardTitle>
            </CardHeader>
            <CardContent className="p-0">
              {loadingChain ? (
                <div className="flex items-center justify-center py-10">
                  <Loader2 className="h-5 w-5 text-amber-400 animate-spin" />
                </div>
              ) : (
                <GreeksTable
                  contracts={chain.map((r) => r.put).filter(Boolean) as OptionContract[]}
                  onSelectContract={(c) => addLeg(c.strike, "P", c.ask, c.iv, c.delta)}
                />
              )}
            </CardContent>
          </Card>

          {/* Selected contract detail */}
          {selectedLegs.length > 0 && (
            <Card className="lg:col-span-2 bg-[#0d1321] border-gray-800/60">
              <CardHeader className="pb-2">
                <CardTitle className="text-sm font-semibold text-gray-100 flex items-center gap-2">
                  <Calculator className="h-4 w-4 text-amber-400/70" />
                  Selected Leg Details
                </CardTitle>
              </CardHeader>
              <CardContent>
                <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-6 gap-4">
                  {selectedLegs.map((leg, i) => (
                    <div key={i} className="bg-[#0a0e17] rounded-lg p-3 border border-gray-800/40">
                      <div className="text-[10px] text-gray-500 uppercase tracking-wider mb-1">
                        Leg {i + 1}
                      </div>
                      <div className="text-xs font-semibold text-gray-200 mb-2">
                        {leg.right.toUpperCase()} ${leg.strike}
                      </div>
                      <div className="space-y-1 text-[11px]">
                        <div className="flex justify-between">
                          <span className="text-gray-500">Price</span>
                          <span className="tabular-mono text-gray-200">${leg.price.toFixed(2)}</span>
                        </div>
                        <div className="flex justify-between">
                          <span className="text-gray-500">IV</span>
                          <span className="tabular-mono text-gray-200">{(leg.iv * 100).toFixed(1)}%</span>
                        </div>
                        <div className="flex justify-between">
                          <span className="text-gray-500">Delta</span>
                          <span className={`tabular-mono ${greekColor(leg.delta)}`}>{leg.delta.toFixed(3)}</span>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              </CardContent>
            </Card>
          )}
        </div>
      )}

      {/* ═══════════════════════════════════════ */}
      {/*  PAYOFF VIEW — multi-leg builder       */}
      {/* ═══════════════════════════════════════ */}
      {view === "payoff" && (
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
          <div className="lg:col-span-2">
            <Card className="bg-[#0d1321] border-gray-800/60">
              <CardHeader className="pb-2">
                <CardTitle className="text-sm font-semibold text-gray-100 flex items-center gap-2">
                  <LineChart className="h-4 w-4 text-amber-400/70" />
                  Payoff Diagram
                </CardTitle>
              </CardHeader>
              <CardContent className="h-72 flex items-center justify-center">
                {selectedLegs.length > 0 ? (
                  <div className="text-center w-full max-w-md">
                    <LineChart className="h-16 w-16 text-amber-400/30 mx-auto mb-3" />
                    <p className="text-xs text-gray-500 mb-4">
                      Payoff diagram — {selectedLegs.length} leg{selectedLegs.length > 1 ? "s" : ""} configured
                    </p>
                    <div className="space-y-1.5">
                      {selectedLegs.map((leg, i) => (
                        <div key={i} className="flex items-center justify-between bg-[#0a0e17] rounded px-3 py-1.5 border border-gray-800/40">
                          <div className="flex items-center gap-2">
                            <span className="text-[10px] text-gray-600 w-8">{i + 1}.</span>
                            <Badge variant="outline" className={`text-[10px] border-gray-700 ${
                              leg.right === "C" ? "text-profit" : "text-loss"
                            }`}>
                              {leg.right.toUpperCase()}
                            </Badge>
                            <span className="text-xs text-gray-300 tabular-mono">${leg.strike}</span>
                          </div>
                          <div className="flex items-center gap-3">
                            <span className="text-xs text-gray-500 tabular-mono">@ ${leg.price.toFixed(2)}</span>
                            <button onClick={() => removeLeg(i)} className="text-gray-600 hover:text-loss transition-colors">
                              <X className="h-3 w-3" />
                            </button>
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                ) : (
                  <div className="text-center">
                    <FlaskConical className="h-12 w-12 text-gray-700 mx-auto mb-3" />
                    <p className="text-xs text-gray-500">
                      Click a bid/ask cell in the Chain tab to add a leg, then view the payoff diagram
                    </p>
                  </div>
                )}
              </CardContent>
            </Card>
          </div>
          <div className="space-y-3">
            <Card className="bg-[#0d1321] border-gray-800/60">
              <CardHeader className="pb-2">
                <CardTitle className="text-sm font-semibold text-gray-100 flex items-center gap-2">
                  <Calculator className="h-4 w-4 text-amber-400/70" />
                  Strategy Summary
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-2 text-xs text-gray-400">
                {selectedLegs.length === 0 ? (
                  <p className="text-gray-600">Add legs from the chain view to build a strategy.</p>
                ) : (
                  <>
                    <div className="flex justify-between">
                      <span>Legs</span>
                      <span className="text-gray-200 tabular-mono">{selectedLegs.length}</span>
                    </div>
                    <div className="flex justify-between">
                      <span>Total Premium</span>
                      <span className="text-gray-200 tabular-mono">${totalDebit.toFixed(2)}</span>
                    </div>
                    <div className="flex justify-between">
                      <span>Avg IV</span>
                      <span className="text-gray-200 tabular-mono">
                        {(selectedLegs.reduce((s, l) => s + l.iv, 0) / selectedLegs.length * 100).toFixed(1)}%
                      </span>
                    </div>
                    <div className="flex justify-between">
                      <span>Net Delta</span>
                      <span className={`tabular-mono ${greekColor(selectedLegs.reduce((s, l) => s + l.delta, 0))}`}>
                        {selectedLegs.reduce((s, l) => s + l.delta, 0).toFixed(3)}
                      </span>
                    </div>
                    <div className="flex justify-between">
                      <span>Underlying</span>
                      <span className="text-gray-200 tabular-mono">${underlyingPrice.toFixed(2)}</span>
                    </div>
                    <div className="pt-2 border-t border-gray-800/40">
                      <Button
                        size="sm"
                        variant="outline"
                        className="w-full text-xs border-gray-700 text-gray-400 hover:text-amber-400"
                        onClick={() => setSelectedLegs([])}
                      >
                        <RefreshCw className="h-3 w-3 mr-1" />
                        Clear All Legs
                      </Button>
                    </div>
                  </>
                )}
              </CardContent>
            </Card>

            {/* Quick add from chain */}
            {chain.length > 0 && (
              <Card className="bg-[#0d1321] border-gray-800/60">
                <CardHeader className="pb-2">
                  <CardTitle className="text-sm font-semibold text-gray-100 flex items-center gap-2">
                    <Plus className="h-4 w-4 text-amber-400/70" />
                    Quick Add
                  </CardTitle>
                </CardHeader>
                <CardContent className="space-y-2">
                  <div className="max-h-48 overflow-y-auto space-y-1">
                    {chain.slice(0, 20).map((row) => (
                      <div key={row.strike} className="flex items-center justify-between text-[11px] py-1 border-b border-gray-800/30 last:border-0">
                        <span className={`tabular-mono ${row.strike === atmStrike ? "text-amber-400 font-medium" : "text-gray-400"}`}>
                          ${row.strike}
                        </span>
                        <div className="flex gap-1">
                          {row.call && (
                            <button
                              className="text-[10px] px-1.5 py-0.5 rounded bg-profit/10 text-profit/80 hover:bg-profit/20 transition-colors"
                              onClick={() => addLeg(row.strike, "C", row.call!.ask, row.call!.iv, row.call!.delta)}
                            >
                              C ${row.call.ask.toFixed(2)}
                            </button>
                          )}
                          {row.put && (
                            <button
                              className="text-[10px] px-1.5 py-0.5 rounded bg-loss/10 text-loss/80 hover:bg-loss/20 transition-colors"
                              onClick={() => addLeg(row.strike, "P", row.put!.ask, row.put!.iv, row.put!.delta)}
                            >
                              P ${row.put.ask.toFixed(2)}
                            </button>
                          )}
                        </div>
                      </div>
                    ))}
                  </div>
                </CardContent>
              </Card>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

/* ───────── Cell components ───────── */

function EmptyCell() {
  return <div className="px-1.5 py-2 text-right text-[11px] text-gray-700 tabular-mono border-r border-gray-800/40">—</div>;
}

function PriceCell({ value, onClick }: { value: number; onClick?: () => void }) {
  return (
    <div
      className={`px-1.5 py-2 text-right text-[11px] tabular-mono text-gray-300 border-r border-gray-800/40 ${onClick ? "cursor-pointer hover:bg-amber-400/10 hover:text-amber-300 transition-colors" : ""}`}
      onClick={onClick}
      title={onClick ? "Click to add leg" : undefined}
    >
      {value.toFixed(2)}
    </div>
  );
}

function PctCell({ value }: { value: number }) {
  return (
    <div className="px-1.5 py-2 text-right text-[11px] tabular-mono text-gray-300 border-r border-gray-800/40">
      {(value * 100).toFixed(1)}%
    </div>
  );
}

function DeltaCell({ value }: { value: number }) {
  return (
    <div className={`px-1.5 py-2 text-right text-[11px] tabular-mono ${greekColor(value)} border-r border-gray-800/40`}>
      {value.toFixed(3)}
    </div>
  );
}

function NumCell({ value }: { value: number }) {
  return (
    <div className="px-1.5 py-2 text-right text-[11px] tabular-mono text-gray-300 border-r border-gray-800/40">
      {value.toFixed(3)}
    </div>
  );
}

/* ───────── Greeks Table ───────── */
function GreeksTable({ contracts, onSelectContract }: {
  contracts: OptionContract[];
  onSelectContract: (c: OptionContract) => void;
}) {
  if (contracts.length === 0) {
    return (
      <div className="text-center py-8">
        <p className="text-xs text-gray-600">No contracts available.</p>
      </div>
    );
  }

  return (
    <div className="overflow-x-auto">
      <table className="w-full text-xs">
        <thead>
          <tr className="border-b border-gray-800/40">
            {["Strike", "Bid", "Ask", "IV", "Δ", "Γ", "Θ", "ν"].map((h) => (
              <th key={h} className="text-right px-2 py-2 text-[10px] text-gray-600 font-normal uppercase tracking-wider">
                {h}
              </th>
            ))}
          </tr>
        </thead>
        <tbody className="divide-y divide-gray-800/40">
          {contracts.map((c) => (
            <tr
              key={c.strike}
              className="hover:bg-white/[0.02] cursor-pointer transition-colors"
              onClick={() => onSelectContract(c)}
              title="Click to add as leg"
            >
              <td className="text-center px-2 py-2 text-gray-400 tabular-mono">{c.strike}</td>
              <td className="text-right px-2 py-2 text-gray-300 tabular-mono">{c.bid.toFixed(2)}</td>
              <td className="text-right px-2 py-2 text-gray-300 tabular-mono">{c.ask.toFixed(2)}</td>
              <td className="text-right px-2 py-2 text-gray-300 tabular-mono">{(c.iv * 100).toFixed(1)}%</td>
              <td className={`text-right px-2 py-2 tabular-mono ${greekColor(c.delta)}`}>{c.delta.toFixed(3)}</td>
              <td className="text-right px-2 py-2 text-gray-300 tabular-mono">{c.gamma.toFixed(4)}</td>
              <td className="text-right px-2 py-2 text-loss tabular-mono">{c.theta.toFixed(4)}</td>
              <td className="text-right px-2 py-2 text-gray-300 tabular-mono">{c.vega.toFixed(4)}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

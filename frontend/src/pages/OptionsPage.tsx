import { useState, useEffect, useCallback } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { OptionChainTable } from "@/components/OptionChainTable";
import { OptionPayoffChart } from "@/components/OptionPayoffChart";
import { optionsService, type OptionChain, type PayoffLeg, type PayoffResult, type BSMParams, type BSMResult } from "@/services/optionsService";
import { useNotification } from "@/contexts/NotificationContext";

type Tab = "chain" | "strategy" | "bsm";

export default function OptionsPage() {
  const { success, error: notifyError } = useNotification();
  const [tab, setTab] = useState<Tab>("chain");
  const [symbol, setSymbol] = useState("SPY");
  const [expirations, setExpirations] = useState<string[]>([]);
  const [expiration, setExpiration] = useState("");
  const [chain, setChain] = useState<OptionChain | null>(null);
  const [loadingChain, setLoadingChain] = useState(false);
  const [legs, setLegs] = useState<PayoffLeg[]>([]);
  const [payoff, setPayoff] = useState<PayoffResult | null>(null);

  // BSM state
  const [bsmParams, setBsmParams] = useState<BSMParams>({
    underlying_price: 450,
    strike: 450,
    time_to_expiry: 30 / 365,
    risk_free_rate: 0.05,
    volatility: 0.20,
    right: "call",
  });
  const [bsmResult, setBsmResult] = useState<BSMResult | null>(null);

  const loadExpirations = useCallback(async () => {
    try {
      const res = await optionsService.getExpirations(symbol);
      setExpirations(res.expirations);
      if (res.expirations.length > 0) {
        setExpiration(res.expirations[0]);
      }
    } catch {
      notifyError("Failed to load expirations");
    }
  }, [symbol, notifyError]);

  const loadChain = useCallback(async () => {
    if (!expiration) return;
    setLoadingChain(true);
    try {
      const res = await optionsService.getChain(symbol, expiration);
      setChain(res);
    } catch {
      notifyError("Failed to load option chain");
    } finally {
      setLoadingChain(false);
    }
  }, [symbol, expiration, notifyError]);

  useEffect(() => {
    loadExpirations();
  }, []);

  useEffect(() => {
    if (expiration) loadChain();
  }, [expiration]);

  const handleAddLeg = (leg: PayoffLeg) => {
    setLegs(prev => [...prev, leg]);
    setTab("strategy");
    success(`Added ${leg.right === "call" ? "Call" : "Put"} $${leg.strike} x ${leg.quantity}`);
  };

  const handleRemoveLeg = (idx: number) => {
    setLegs(prev => prev.filter((_, i) => i !== idx));
  };

  const handleCalculatePayoff = async () => {
    if (legs.length === 0) return;
    try {
      const res = await optionsService.calculatePayoff(legs);
      setPayoff(res);
    } catch {
      notifyError("Failed to calculate payoff");
    }
  };

  useEffect(() => {
    if (legs.length > 0) handleCalculatePayoff();
    else setPayoff(null);
  }, [legs]);

  const handleBSMCalculate = async () => {
    try {
      const res = await optionsService.calculateBSM(bsmParams);
      setBsmResult(res);
    } catch {
      notifyError("BSM calculation failed");
    }
  };

  const formatPrice = (v: number | null | undefined) => {
    if (v == null) return "—";
    return `$${v.toFixed(2)}`;
  };

  return (
    <div className="min-h-screen bg-background">
      <header className="bg-card border-b border-border">
        <div className="container mx-auto px-4 py-4">
          <div className="flex items-center justify-between">
            <div>
              <h1 className="text-2xl font-bold text-foreground">Options</h1>
              <p className="text-sm text-muted-foreground">Option chains, greeks, and strategy analysis</p>
            </div>
            <Button variant="outline" onClick={() => window.location.href = '/trader'}>
              Back to Trader
            </Button>
          </div>
        </div>
      </header>

      <main className="container mx-auto px-4 py-8 space-y-4">
        {/* Symbol + Expiration controls */}
        <div className="flex gap-4 items-end">
          <div className="space-y-1">
            <label className="text-xs text-muted-foreground">Symbol</label>
            <div className="flex gap-2">
              <Input
                value={symbol}
                onChange={e => setSymbol(e.target.value.toUpperCase())}
                onKeyDown={e => e.key === "Enter" && loadExpirations()}
                className="w-24"
              />
              <Button size="sm" variant="secondary" onClick={loadExpirations}>Load</Button>
            </div>
          </div>
          <div className="space-y-1 flex-1 max-w-xs">
            <label className="text-xs text-muted-foreground">Expiration</label>
            <Select value={expiration} onValueChange={setExpiration}>
              <SelectTrigger>
                <SelectValue placeholder="Select expiration" />
              </SelectTrigger>
              <SelectContent>
                {expirations.map(e => (
                  <SelectItem key={e} value={e}>{e}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          {chain?.underlying_price && (
            <div className="text-sm text-muted-foreground">
              Underlying: <span className="font-semibold text-foreground">{formatPrice(chain.underlying_price)}</span>
            </div>
          )}
        </div>

        {/* Tabs */}
        <div className="flex gap-1 border-b">
          {[
            { key: "chain" as Tab, label: "Chain" },
            { key: "strategy" as Tab, label: `Strategy${legs.length ? ` (${legs.length})` : ""}` },
            { key: "bsm" as Tab, label: "BSM Calculator" },
          ].map(t => (
            <button
              key={t.key}
              onClick={() => setTab(t.key)}
              className={`px-4 py-2 text-sm font-medium border-b-2 transition-colors ${
                tab === t.key
                  ? "border-primary text-foreground"
                  : "border-transparent text-muted-foreground hover:text-foreground"
              }`}
            >
              {t.label}
            </button>
          ))}
        </div>

        {/* Chain Tab */}
        {tab === "chain" && (
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-base">Calls</CardTitle>
              </CardHeader>
              <CardContent className="p-0">
                {loadingChain ? (
                  <div className="h-48 bg-muted animate-pulse rounded" />
                ) : (
                  <OptionChainTable
                    contracts={chain?.calls || []}
                    right="call"
                    underlyingPrice={chain?.underlying_price ?? null}
                    onAddLeg={handleAddLeg}
                  />
                )}
              </CardContent>
            </Card>
            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-base">Puts</CardTitle>
              </CardHeader>
              <CardContent className="p-0">
                {loadingChain ? (
                  <div className="h-48 bg-muted animate-pulse rounded" />
                ) : (
                  <OptionChainTable
                    contracts={chain?.puts || []}
                    right="put"
                    underlyingPrice={chain?.underlying_price ?? null}
                    onAddLeg={handleAddLeg}
                  />
                )}
              </CardContent>
            </Card>
          </div>
        )}

        {/* Strategy Builder Tab */}
        {tab === "strategy" && (
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
            <div className="lg:col-span-2">
              <OptionPayoffChart
                data={payoff?.payoff || []}
                breakevens={payoff?.payoff?.filter((p, i, arr) => i > 0 && ((p.pnl >= 0 && arr[i-1].pnl < 0) || (p.pnl <= 0 && arr[i-1].pnl > 0))).map(p => p.underlying_price)}
              />
            </div>
            <div className="space-y-3">
              <Card>
                <CardHeader className="pb-2">
                  <CardTitle className="text-base">Legs</CardTitle>
                </CardHeader>
                <CardContent className="space-y-2">
                  {legs.length === 0 && (
                    <p className="text-sm text-muted-foreground">Click + on a contract to add it here.</p>
                  )}
                  {legs.map((leg, i) => (
                    <div key={i} className="flex items-center justify-between bg-muted/30 rounded px-3 py-2 text-sm">
                      <div>
                        <span className="font-medium text-foreground">{leg.right.toUpperCase()}</span>
                        <span className="text-muted-foreground ml-2">${leg.strike}</span>
                        <span className="text-muted-foreground ml-2">x{leg.quantity}</span>
                        <span className="text-muted-foreground ml-2">@${leg.entry_price.toFixed(2)}</span>
                      </div>
                      <Button size="sm" variant="ghost" className="text-destructive" onClick={() => handleRemoveLeg(i)}>
                        ✕
                      </Button>
                    </div>
                  ))}
                  {legs.length > 0 && (
                    <div className="pt-2 text-sm">
                      <span className="text-muted-foreground">Max: </span>
                      <span className="font-medium text-green-500">
                        {formatPrice(Math.max(...(payoff?.payoff?.map(p => p.pnl) || [0])))}
                      </span>
                      <span className="text-muted-foreground ml-3">Min: </span>
                      <span className="font-medium text-red-500">
                        {formatPrice(Math.min(...(payoff?.payoff?.map(p => p.pnl) || [0])))}
                      </span>
                    </div>
                  )}
                </CardContent>
              </Card>
            </div>
          </div>
        )}

        {/* BSM Calculator Tab */}
        {tab === "bsm" && (
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            <Card>
              <CardHeader>
                <CardTitle className="text-base">Parameters</CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="grid grid-cols-2 gap-4">
                  {([
                    { key: "underlying_price", label: "Underlying Price", step: 0.01 },
                    { key: "strike", label: "Strike Price", step: 0.01 },
                    { key: "time_to_expiry", label: "Time to Expiry (years)", step: 0.01 },
                    { key: "risk_free_rate", label: "Risk-Free Rate", step: 0.01 },
                    { key: "volatility", label: "Volatility (σ)", step: 0.01 },
                  ] as const).map(field => (
                    <div key={field.key} className="space-y-1">
                      <label className="text-xs text-muted-foreground">{field.label}</label>
                      <Input
                        type="number"
                        step={field.step}
                        value={(bsmParams as any)[field.key]}
                        onChange={e => setBsmParams(p => ({ ...p, [field.key]: parseFloat(e.target.value) || 0 }))}
                      />
                    </div>
                  ))}
                  <div className="space-y-1">
                    <label className="text-xs text-muted-foreground">Right</label>
                    <Select
                      value={bsmParams.right}
                      onValueChange={v => setBsmParams(p => ({ ...p, right: v as "call" | "put" }))}
                    >
                      <SelectTrigger>
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="call">Call</SelectItem>
                        <SelectItem value="put">Put</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                </div>
                <Button onClick={handleBSMCalculate}>Calculate</Button>
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle className="text-base">Results</CardTitle>
              </CardHeader>
              <CardContent>
                {bsmResult ? (
                  <div className="grid grid-cols-2 gap-4 text-sm">
                    {([
                      { key: "price", label: "Option Price", format: (v: number) => formatPrice(v) },
                      { key: "delta", label: "Delta", format: (v: number) => v.toFixed(4) },
                      { key: "gamma", label: "Gamma", format: (v: number) => v.toFixed(4) },
                      { key: "theta", label: "Theta", format: (v: number) => v.toFixed(4) },
                      { key: "vega", label: "Vega", format: (v: number) => v.toFixed(4) },
                      { key: "rho", label: "Rho", format: (v: number) => v.toFixed(4) },
                      { key: "d1", label: "d1", format: (v: number) => v.toFixed(4) },
                      { key: "d2", label: "d2", format: (v: number) => v.toFixed(4) },
                    ] as const).map(r => (
                      <div key={r.key} className="bg-muted/30 rounded p-3">
                        <p className="text-xs text-muted-foreground">{r.label}</p>
                        <p className="text-lg font-semibold text-foreground">{r.format((bsmResult as any)[r.key])}</p>
                      </div>
                    ))}
                  </div>
                ) : (
                  <p className="text-sm text-muted-foreground text-center py-8">Enter parameters and calculate.</p>
                )}
              </CardContent>
            </Card>
          </div>
        )}
      </main>
    </div>
  );
}

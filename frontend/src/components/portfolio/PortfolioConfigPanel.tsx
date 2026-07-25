import { useState, useMemo } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Switch } from "@/components/ui/switch";
import { Separator } from "@/components/ui/separator";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  Plus, Trash2, Play, Loader2, BarChart4, DollarSign,
  TrendingUp, PiggyBank, Shield,
} from "lucide-react";
import api from "@/lib/api";

/* ── Types ── */

interface Asset {
  ticker: string;
  weight: number;
  dividend_yield: number;
}

interface CashEvent {
  date: string;
  amount: number;
  description: string;
}

export interface PortfolioConfig {
  assets: Asset[];
  initial_cash: number;
  margin_target: number;
  margin_rate: number;
  interest_free_buffer: number;
  maintenance_req_pct: number;
  drip_enabled: boolean;
  rebalance_frequency: string;
  start_year: number;
  end_year: number;
  deposits: CashEvent[];
  withdrawals: CashEvent[];
}

interface Props {
  onRun: (config: PortfolioConfig) => void;
  running: boolean;
}

/* ── Presets ── */

const PRESETS: Record<string, Asset[]> = {
  "60/40 Balanced": [
    { ticker: "SPY", weight: 60, dividend_yield: 0.013 },
    { ticker: "TLT", weight: 40, dividend_yield: 0.042 },
  ],
  "Dividend Growth": [
    { ticker: "SCHD", weight: 50, dividend_yield: 0.035 },
    { ticker: "VYM", weight: 30, dividend_yield: 0.030 },
    { ticker: "SPY", weight: 20, dividend_yield: 0.013 },
  ],
  "High Yield Income": [
    { ticker: "TLT", weight: 40, dividend_yield: 0.042 },
    { ticker: "SCHD", weight: 30, dividend_yield: 0.035 },
    { ticker: "SPG", weight: 15, dividend_yield: 0.045 },
    { ticker: "VZ", weight: 15, dividend_yield: 0.065 },
  ],
  "Aggressive Growth": [
    { ticker: "QQQ", weight: 70, dividend_yield: 0.006 },
    { ticker: "SPY", weight: 30, dividend_yield: 0.013 },
  ],
};

export default function PortfolioConfigPanel({ onRun, running }: Props) {
  const [assets, setAssets] = useState<Asset[]>([...PRESETS["60/40 Balanced"]]);
  const [initialCash, setInitialCash] = useState(100000);
  const [marginTarget, setMarginTarget] = useState(0);
  const [marginRate, setMarginRate] = useState(6.5);
  const [interestFreeBuffer, setInterestFreeBuffer] = useState(1000);
  const [maintenanceReq, setMaintenanceReq] = useState(25);
  const [dripEnabled, setDripEnabled] = useState(true);
  const [rebalanceFreq, setRebalanceFreq] = useState("quarterly");
  const [startYear, setStartYear] = useState(2020);
  const [endYear, setEndYear] = useState(2025);
  const [error, setError] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState("allocation");
  const [deposits, setDeposits] = useState<CashEvent[]>([]);
  const [withdrawals, setWithdrawals] = useState<CashEvent[]>([]);

  /* ── Asset helpers ── */
  const updateAsset = (i: number, field: keyof Asset, value: string | number) => {
    setAssets(prev => prev.map((a, idx) => idx === i ? { ...a, [field]: value } : a));
  };
  const addAsset = () => setAssets(prev => [...prev, { ticker: "", weight: 0, dividend_yield: 0 }]);
  const removeAsset = (i: number) => setAssets(prev => prev.filter((_, idx) => idx !== i));
  const applyPreset = (name: string) => {
    const t = PRESETS[name];
    if (t) setAssets(t.map(a => ({ ...a })));
  };

  /* ── Cash event helpers ── */
  const addDeposit = () => setDeposits(prev => [...prev, { date: `${startYear}-06-01`, amount: 50000, description: "Capital injection" }]);
  const updateDeposit = (i: number, field: keyof CashEvent, value: string | number) => {
    setDeposits(prev => prev.map((d, idx) => idx === i ? { ...d, [field]: value } : d));
  };
  const removeDeposit = (i: number) => setDeposits(prev => prev.filter((_, idx) => idx !== i));
  const addWithdrawal = () => setWithdrawals(prev => [...prev, { date: `${startYear}-12-01`, amount: 25000, description: "Capital withdrawal" }]);
  const updateWithdrawal = (i: number, field: keyof CashEvent, value: string | number) => {
    setWithdrawals(prev => prev.map((d, idx) => idx === i ? { ...d, [field]: value } : d));
  };
  const removeWithdrawal = (i: number) => setWithdrawals(prev => prev.filter((_, idx) => idx !== i));

  /* ── Summary ── */
  const summary = useMemo(() => {
    const totalWeight = assets.reduce((s, a) => s + a.weight, 0);
    const avgDivYield = assets.reduce((s, a) => s + a.dividend_yield * (a.weight / (totalWeight || 100)), 0);
    const totalDeposits = deposits.reduce((s, d) => s + d.amount, 0);
    const totalWithdrawals = withdrawals.reduce((s, w) => s + w.amount, 0);
    return { totalWeight, avgDivYield, totalDeposits, totalWithdrawals, netCashFlow: totalDeposits - totalWithdrawals, assetCount: assets.length };
  }, [assets, deposits, withdrawals]);

  const handleRun = () => {
    if (running || assets.length === 0) return;
    if (Math.abs(summary.totalWeight - 100) > 1) {
      setError(`Weights total ${summary.totalWeight.toFixed(0)}% — should be 100%`);
      return;
    }
    setError(null);
    onRun({
      assets: assets.filter(a => a.ticker.trim()),
      initial_cash: initialCash,
      margin_target: marginTarget,
      margin_rate: marginRate / 100,
      interest_free_buffer: interestFreeBuffer,
      maintenance_req_pct: maintenanceReq / 100,
      drip_enabled: dripEnabled,
      rebalance_frequency: rebalanceFreq,
      start_year: startYear,
      end_year: endYear,
      deposits,
      withdrawals,
    });
  };

  return (
    <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
      {/* ── Left: Config Panel ── */}
      <div className="lg:col-span-2 space-y-4">
        {/* Header: Presets */}
        <Card className="bg-[#0d1321] border-gray-800/60">
          <CardContent className="p-3">
            <div className="flex items-center gap-2 flex-wrap">
              <Label className="text-[10px] text-gray-500 shrink-0">Presets</Label>
              {Object.keys(PRESETS).map(name => (
                <Button key={name} size="sm" variant="outline"
                  className="text-[10px] h-6 border-gray-700 text-gray-400 hover:text-blue-400"
                  onClick={() => applyPreset(name)}>
                  {name}
                </Button>
              ))}
            </div>
          </CardContent>
        </Card>

        {/* Tabbed params */}
        <Card className="bg-[#0d1321] border-gray-800/60">
          <Tabs value={activeTab} onValueChange={setActiveTab}>
            <TabsList className="h-8 bg-[#0a0e17] border-b border-gray-800/60 w-full justify-start rounded-none px-3 gap-4">
              <TabsTrigger value="allocation" className="text-[11px] h-7 px-2 data-[state=active]:text-blue-400">Allocation</TabsTrigger>
              <TabsTrigger value="margin" className="text-[11px] h-7 px-2 data-[state=active]:text-blue-400">Margin & Leverage</TabsTrigger>
              <TabsTrigger value="dividends" className="text-[11px] h-7 px-2 data-[state=active]:text-blue-400">Dividends</TabsTrigger>
              <TabsTrigger value="cashflow" className="text-[11px] h-7 px-2 data-[state=active]:text-blue-400">Cash Flow</TabsTrigger>
            </TabsList>

            {/* Allocation */}
            <TabsContent value="allocation" className="p-4 space-y-3 mt-0">
              <div className="flex items-center justify-between">
                <Label className="text-[11px] text-gray-500">Assets ({summary.assetCount})</Label>
                <Button size="sm" variant="ghost" className="h-6 text-[10px] text-blue-400" onClick={addAsset}>
                  <Plus className="h-3 w-3 mr-0.5" /> Add
                </Button>
              </div>

              {/* Visual weight bar */}
              <div className="h-5 bg-[#0a0e17] rounded-full overflow-hidden flex border border-gray-800/40">
                {assets.map((a, i) => {
                  const colors = ["#3b82f6", "#22c55e", "#f59e0b", "#ef4444", "#a855f7", "#ec4899", "#06b6d4", "#84cc16"];
                  return (
                    <div key={i}
                      style={{ width: `${Math.max(a.weight, 0)}%`, backgroundColor: colors[i % colors.length] }}
                      className="h-full transition-all duration-300 first:rounded-l-full last:rounded-r-full"
                      title={`${a.ticker}: ${a.weight}%`}
                    />
                  );
                })}
              </div>

              <div className="space-y-1.5">
                {assets.map((asset, i) => {
                  const totalWeight = assets.reduce((s, a) => s + a.weight, 0);
                  const colors = ["#3b82f6", "#22c55e", "#f59e0b", "#ef4444", "#a855f7", "#ec4899", "#06b6d4", "#84cc16"];
                  return (
                    <div key={i} className="flex items-center gap-2 bg-[#0a0e17] rounded-lg px-3 py-2 border border-gray-800/40">
                      <span className="w-2 h-2 rounded-full shrink-0" style={{ backgroundColor: colors[i % colors.length] }} />
                      <Input value={asset.ticker} onChange={e => updateAsset(i, "ticker", e.target.value.toUpperCase())}
                        placeholder="Ticker" className="w-20 h-7 text-xs bg-[#0a0e17] border-gray-700 text-gray-200" />
                      <div className="flex items-center gap-1">
                        <Label className="text-[9px] text-gray-600">Wt%</Label>
                        <Input type="number" value={asset.weight || ""} onChange={e => updateAsset(i, "weight", Number(e.target.value))}
                          className="w-16 h-7 text-xs bg-[#0a0e17] border-gray-700 text-gray-200" min={0} max={100} />
                      </div>
                      <div className="flex items-center gap-1">
                        <Label className="text-[9px] text-gray-600">Div%</Label>
                        <Input type="number" value={asset.dividend_yield ? (asset.dividend_yield * 100).toFixed(1) : ""}
                          onChange={e => updateAsset(i, "dividend_yield", Number(e.target.value) / 100)}
                          step={0.1} className="w-16 h-7 text-xs bg-[#0a0e17] border-gray-700 text-gray-200" />
                      </div>
                      <button onClick={() => removeAsset(i)} className="p-1 text-gray-600 hover:text-red-400"><Trash2 className="h-3 w-3" /></button>
                    </div>
                  );
                })}
              </div>

              <div className="flex items-center justify-between text-[10px]">
                <span className={`${Math.abs(summary.totalWeight - 100) <= 1 ? "text-emerald-400" : "text-red-400"}`}>
                  Total: {summary.totalWeight.toFixed(0)}%
                </span>
                <span className="text-gray-500">Target: 100%</span>
              </div>
            </TabsContent>

            {/* Margin & Leverage */}
            <TabsContent value="margin" className="p-4 space-y-4 mt-0">
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                <div className="space-y-1">
                  <Label className="text-[10px] text-gray-500">Initial Cash</Label>
                  <Input type="number" value={initialCash} onChange={e => setInitialCash(Number(e.target.value))}
                    className="h-7 text-xs bg-[#0a0e17] border-gray-700 text-gray-200" />
                </div>
                <div className="space-y-1">
                  <Label className="text-[10px] text-gray-500">Margin Target %</Label>
                  <Input type="number" value={marginTarget} onChange={e => setMarginTarget(Number(e.target.value))}
                    className="h-7 text-xs bg-[#0a0e17] border-gray-700 text-gray-200" min={0} max={200} />
                  <p className="text-[9px] text-gray-600">% of portfolio value</p>
                </div>
                <div className="space-y-1">
                  <Label className="text-[10px] text-gray-500">Margin Rate %</Label>
                  <Input type="number" value={marginRate} onChange={e => setMarginRate(Number(e.target.value))} step={0.1}
                    className="h-7 text-xs bg-[#0a0e17] border-gray-700 text-gray-200" />
                </div>
                <div className="space-y-1">
                  <Label className="text-[10px] text-gray-500">Interest-Free Buffer</Label>
                  <Input type="number" value={interestFreeBuffer} onChange={e => setInterestFreeBuffer(Number(e.target.value))}
                    className="h-7 text-xs bg-[#0a0e17] border-gray-700 text-gray-200" min={0} />
                </div>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1">
                  <Label className="text-[10px] text-gray-500">Maintenance Requirement %</Label>
                  <Input type="number" value={maintenanceReq} onChange={e => setMaintenanceReq(Number(e.target.value))}
                    className="h-7 text-xs bg-[#0a0e17] border-gray-700 text-gray-200" min={10} max={50} />
                  <p className="text-[9px] text-gray-600">Default 25% for equities. Lower = more leverage capacity.</p>
                </div>
                <div className="space-y-1">
                  <Label className="text-[10px] text-gray-500">Year Range</Label>
                  <div className="flex items-center gap-1">
                    <Input type="number" value={startYear} onChange={e => setStartYear(Number(e.target.value))}
                      className="h-7 text-xs bg-[#0a0e17] border-gray-700 text-gray-200" />
                    <span className="text-gray-600 text-[10px]">→</span>
                    <Input type="number" value={endYear} onChange={e => setEndYear(Number(e.target.value))}
                      className="h-7 text-xs bg-[#0a0e17] border-gray-700 text-gray-200" />
                  </div>
                </div>
              </div>
            </TabsContent>

            {/* Dividends */}
            <TabsContent value="dividends" className="p-4 space-y-4 mt-0">
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1">
                  <Label className="text-[10px] text-gray-500">Dividend Strategy</Label>
                  <Select value={dripEnabled ? "drip" : "paydown"} onValueChange={v => setDripEnabled(v === "drip")}>
                    <SelectTrigger className="h-7 text-xs bg-[#0a0e17] border-gray-700 text-gray-200">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent className="bg-[#0d1321] border-gray-700 text-gray-200">
                      <SelectItem value="drip" className="text-xs">DRIP — Reinvest into assets</SelectItem>
                      <SelectItem value="paydown" className="text-xs">Pay down margin first</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-1">
                  <Label className="text-[10px] text-gray-500">Rebalance Frequency</Label>
                  <Select value={rebalanceFreq} onValueChange={setRebalanceFreq}>
                    <SelectTrigger className="h-7 text-xs bg-[#0a0e17] border-gray-700 text-gray-200">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent className="bg-[#0d1321] border-gray-700 text-gray-200">
                      <SelectItem value="never" className="text-xs">None (buy & hold)</SelectItem>
                      <SelectItem value="monthly" className="text-xs">Monthly</SelectItem>
                      <SelectItem value="quarterly" className="text-xs">Quarterly</SelectItem>
                      <SelectItem value="annually" className="text-xs">Annually</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              </div>
              <p className="text-[10px] text-gray-500">
                Current blended yield: <span className="text-emerald-400 font-medium">{(summary.avgDivYield * 100).toFixed(2)}%</span>
              </p>
            </TabsContent>

            {/* Cash Flow */}
            <TabsContent value="cashflow" className="p-4 space-y-3 mt-0">
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <div className="flex items-center justify-between mb-2">
                    <Label className="text-[11px] text-gray-500">Deposits</Label>
                    <Button size="sm" variant="ghost" className="h-6 text-[10px] text-emerald-400" onClick={addDeposit}>
                      <Plus className="h-3 w-3 mr-0.5" /> Add
                    </Button>
                  </div>
                  {deposits.length === 0 ? (
                    <p className="text-[10px] text-gray-600 italic">No scheduled deposits</p>
                  ) : (
                    deposits.map((d, i) => (
                      <div key={i} className="flex items-center gap-1 mb-1.5">
                        <Input type="date" value={d.date} onChange={e => updateDeposit(i, "date", e.target.value)}
                          className="w-28 h-7 text-[10px] bg-[#0a0e17] border-gray-700 text-gray-200" />
                        <Input type="number" value={d.amount} onChange={e => updateDeposit(i, "amount", Number(e.target.value))}
                          className="w-20 h-7 text-[10px] bg-[#0a0e17] border-gray-700 text-gray-200" />
                        <button onClick={() => removeDeposit(i)} className="p-1 text-gray-600 hover:text-red-400"><Trash2 className="h-3 w-3" /></button>
                      </div>
                    ))
                  )}
                </div>
                <div>
                  <div className="flex items-center justify-between mb-2">
                    <Label className="text-[11px] text-gray-500">Withdrawals</Label>
                    <Button size="sm" variant="ghost" className="h-6 text-[10px] text-red-400" onClick={addWithdrawal}>
                      <Plus className="h-3 w-3 mr-0.5" /> Add
                    </Button>
                  </div>
                  {withdrawals.length === 0 ? (
                    <p className="text-[10px] text-gray-600 italic">No scheduled withdrawals</p>
                  ) : (
                    withdrawals.map((w, i) => (
                      <div key={i} className="flex items-center gap-1 mb-1.5">
                        <Input type="date" value={w.date} onChange={e => updateWithdrawal(i, "date", e.target.value)}
                          className="w-28 h-7 text-[10px] bg-[#0a0e17] border-gray-700 text-gray-200" />
                        <Input type="number" value={w.amount} onChange={e => updateWithdrawal(i, "amount", Number(e.target.value))}
                          className="w-20 h-7 text-[10px] bg-[#0a0e17] border-gray-700 text-gray-200" />
                        <button onClick={() => removeWithdrawal(i)} className="p-1 text-gray-600 hover:text-red-400"><Trash2 className="h-3 w-3" /></button>
                      </div>
                    ))
                  )}
                </div>
              </div>
            </TabsContent>
          </Tabs>
        </Card>

        {/* Error */}
        {error && <p className="text-xs text-red-400">{error}</p>}

        {/* Run */}
        <Button size="sm" onClick={handleRun} disabled={running || assets.length === 0}
          className="w-full h-9 text-xs bg-blue-500/20 text-blue-400 border border-blue-500/30 hover:bg-blue-500/30">
          {running ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : <Play className="h-4 w-4 mr-2" />}
          {running ? "Running Portfolio Backtest..." : "▶ Run Portfolio Backtest"}
        </Button>
      </div>

      {/* ── Right: Summary Sidebar ── */}
      <div className="space-y-3">
        <Card className="bg-[#0d1321] border-gray-800/60">
          <CardHeader className="pb-2">
            <CardTitle className="text-xs font-semibold text-gray-100 flex items-center gap-2">
              <BarChart4 className="h-3.5 w-3.5 text-blue-400/70" />
              Portfolio Summary
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-2 text-[11px]">
            <div className="flex justify-between"><span className="text-gray-500">Assets</span><span className="text-gray-200">{summary.assetCount}</span></div>
            <div className="flex justify-between"><span className="text-gray-500">Total Weight</span>
              <span className={Math.abs(summary.totalWeight - 100) <= 1 ? "text-emerald-400" : "text-red-400"}>{summary.totalWeight.toFixed(0)}%</span>
            </div>
            <div className="flex justify-between"><span className="text-gray-500">Blended Yield</span><span className="text-emerald-400">{(summary.avgDivYield * 100).toFixed(2)}%</span></div>
            <Separator className="bg-gray-800/60" />
            <div className="flex justify-between"><span className="text-gray-500">Initial Cash</span><span className="text-gray-200">${initialCash.toLocaleString()}</span></div>
            <div className="flex justify-between"><span className="text-gray-500">Margin Target</span><span className="text-gray-200">{marginTarget}%</span></div>
            <div className="flex justify-between"><span className="text-gray-500">Margin Rate</span><span className="text-amber-400">{marginRate}%</span></div>
            <div className="flex justify-between"><span className="text-gray-500">Buffer</span><span className="text-gray-200">${interestFreeBuffer.toLocaleString()}</span></div>
            <div className="flex justify-between"><span className="text-gray-500">MMR</span><span className="text-gray-200">{maintenanceReq}%</span></div>
            <Separator className="bg-gray-800/60" />
            <div className="flex justify-between"><span className="text-gray-500">Dividends</span><span className="text-gray-200">{dripEnabled ? "DRIP" : "Pay down margin"}</span></div>
            <div className="flex justify-between"><span className="text-gray-500">Rebalance</span><span className="text-gray-200">{rebalanceFreq}</span></div>
            <div className="flex justify-between"><span className="text-gray-500">Period</span><span className="text-gray-200">{startYear}–{endYear}</span></div>
            {summary.totalDeposits > 0 && (
              <>
                <Separator className="bg-gray-800/60" />
                <div className="flex justify-between"><span className="text-gray-500">Deposits</span><span className="text-emerald-400">+${summary.totalDeposits.toLocaleString()}</span></div>
                <div className="flex justify-between"><span className="text-gray-500">Withdrawals</span><span className="text-red-400">-${summary.totalWithdrawals.toLocaleString()}</span></div>
                <div className="flex justify-between"><span className="text-gray-500">Net Flow</span>
                  <span className={summary.netCashFlow >= 0 ? "text-emerald-400" : "text-red-400"}>
                    {summary.netCashFlow >= 0 ? "+" : ""}${summary.netCashFlow.toLocaleString()}
                  </span>
                </div>
              </>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}

import { useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table";
import {
  Plus, Trash2, Play, Loader2, BarChart4, History, TrendingUp,
  DollarSign, Percent,
} from "lucide-react";
import {
  LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Area, AreaChart,
} from "recharts";
import api from "@/lib/api";

/* ── Types ── */

interface PortfolioAsset {
  ticker: string;
  weight: number;
  dividend_yield: number;
}

interface PortfolioMetrics {
  total_return: number;
  total_return_pct: number;
  cagr_pct: number;
  sharpe_ratio: number;
  max_drawdown_pct: number;
  total_dividends_collected: number;
  total_margin_interest_paid: number;
  net_yield_spread: number;
  margin_call_count: number;
  avg_distance_to_call_pct: number;
  final_equity: number;
  final_margin_debt: number;
}

interface PortfolioResult {
  success: boolean;
  metrics: PortfolioMetrics;
  equity_curve: {
    date: string;
    portfolio_value: number;
    equity: number;
    margin_debt: number;
    dividends_collected: number;
    interest_accrued: number;
    distance_to_call_pct: number;
    margin_call: boolean;
  }[];
  ledger: {
    date: string;
    type: string;
    amount: number;
    description: string;
    cash_after: number;
    margin_after: number;
  }[];
}

/* ── Config Panel ── */

interface ConfigPanelProps {
  onResult: (result: PortfolioResult) => void;
}

export function PortfolioConfigPanel({ onResult }: ConfigPanelProps) {
  const [assets, setAssets] = useState<PortfolioAsset[]>([
    { ticker: "SPY", weight: 60, dividend_yield: 0.013 },
    { ticker: "TLT", weight: 40, dividend_yield: 0.042 },
  ]);
  const [initialCash, setInitialCash] = useState(100000);
  const [marginTarget, setMarginTarget] = useState(0);
  const [marginRate, setMarginRate] = useState(6.5);
  const [dripEnabled, setDripEnabled] = useState(true);
  const [startYear, setStartYear] = useState(2020);
  const [endYear, setEndYear] = useState(2025);
  const [running, setRunning] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const updateAsset = (i: number, field: keyof PortfolioAsset, value: string | number) => {
    setAssets(prev => prev.map((a, idx) => idx === i ? { ...a, [field]: value } : a));
  };

  const addAsset = () => setAssets(prev => [...prev, { ticker: "", weight: 0, dividend_yield: 0 }]);
  const removeAsset = (i: number) => setAssets(prev => prev.filter((_, idx) => idx !== i));

  const runBacktest = async () => {
    if (running || assets.length === 0) return;
    setRunning(true);
    setError(null);
    try {
      const result = await api.post<PortfolioResult>("/api/portfolio/backtest", {
        assets: assets.filter(a => a.ticker.trim()),
        initial_cash: initialCash,
        margin_target: marginTarget,
        margin_rate: marginRate / 100,
        drip_enabled: dripEnabled,
        start_date: `${startYear}-01-01`,
        end_date: `${endYear}-12-31`,
      });
      onResult(result);
    } catch (e: any) {
      setError(e?.detail || "Portfolio backtest failed");
    } finally {
      setRunning(false);
    }
  };

  return (
    <Card className="bg-[#0d1321] border-gray-800/60">
      <CardHeader className="pb-2">
        <CardTitle className="text-sm font-semibold text-gray-100 flex items-center gap-2">
          <BarChart4 className="h-4 w-4 text-blue-400/70" />
          Portfolio Configuration
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        {/* Assets */}
        <div>
          <div className="flex items-center justify-between mb-2">
            <Label className="text-[11px] text-gray-500">Assets</Label>
            <Button size="sm" variant="ghost" className="h-6 text-[10px] text-blue-400" onClick={addAsset}>
              <Plus className="h-3 w-3 mr-0.5" /> Add Asset
            </Button>
          </div>
          <div className="space-y-1.5">
            {assets.map((asset, i) => (
              <div key={i} className="flex items-center gap-2 bg-[#0a0e17] rounded-lg px-3 py-2 border border-gray-800/40">
                <span className="text-[10px] text-gray-600 w-5">{i + 1}.</span>
                <Input
                  value={asset.ticker}
                  onChange={(e) => updateAsset(i, "ticker", e.target.value.toUpperCase())}
                  placeholder="Ticker"
                  className="w-20 h-7 text-xs bg-[#0a0e17] border-gray-700 text-gray-200"
                />
                <div className="flex items-center gap-1">
                  <Label className="text-[9px] text-gray-600">Wt%</Label>
                  <Input
                    type="number"
                    value={asset.weight || ""}
                    onChange={(e) => updateAsset(i, "weight", Number(e.target.value))}
                    className="w-16 h-7 text-xs bg-[#0a0e17] border-gray-700 text-gray-200"
                  />
                </div>
                <div className="flex items-center gap-1">
                  <Label className="text-[9px] text-gray-600">Div%</Label>
                  <Input
                    type="number"
                    value={asset.dividend_yield ? (asset.dividend_yield * 100).toFixed(1) : ""}
                    onChange={(e) => updateAsset(i, "dividend_yield", Number(e.target.value) / 100)}
                    step={0.1}
                    className="w-16 h-7 text-xs bg-[#0a0e17] border-gray-700 text-gray-200"
                  />
                </div>
                <button onClick={() => removeAsset(i)} className="p-1 text-gray-600 hover:text-red-400">
                  <Trash2 className="h-3 w-3" />
                </button>
              </div>
            ))}
          </div>
        </div>

        {/* Parameters */}
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
          <div className="space-y-1">
            <Label className="text-[10px] text-gray-500">Initial Cash</Label>
            <Input type="number" value={initialCash} onChange={(e) => setInitialCash(Number(e.target.value))}
              className="h-7 text-xs bg-[#0a0e17] border-gray-700 text-gray-200" />
          </div>
          <div className="space-y-1">
            <Label className="text-[10px] text-gray-500">Margin Target %</Label>
            <Input type="number" value={marginTarget} onChange={(e) => setMarginTarget(Number(e.target.value))}
              className="h-7 text-xs bg-[#0a0e17] border-gray-700 text-gray-200" />
          </div>
          <div className="space-y-1">
            <Label className="text-[10px] text-gray-500">Margin Rate %</Label>
            <Input type="number" value={marginRate} onChange={(e) => setMarginRate(Number(e.target.value))} step={0.1}
              className="h-7 text-xs bg-[#0a0e17] border-gray-700 text-gray-200" />
          </div>
          <div className="space-y-1">
            <Label className="text-[10px] text-gray-500">Year Range</Label>
            <div className="flex items-center gap-1">
              <Input type="number" value={startYear} onChange={(e) => setStartYear(Number(e.target.value))}
                className="h-7 text-xs bg-[#0a0e17] border-gray-700 text-gray-200" />
              <span className="text-gray-600 text-[10px]">→</span>
              <Input type="number" value={endYear} onChange={(e) => setEndYear(Number(e.target.value))}
                className="h-7 text-xs bg-[#0a0e17] border-gray-700 text-gray-200" />
            </div>
          </div>
        </div>

        {/* DRIP toggle */}
        <label className="flex items-center gap-2 text-xs text-gray-400 cursor-pointer">
          <input type="checkbox" checked={dripEnabled} onChange={(e) => setDripEnabled(e.target.checked)}
            className="rounded border-gray-700 bg-[#0a0e17]" />
          DRIP — Reinvest dividends into assets
        </label>

        {error && <p className="text-xs text-red-400">{error}</p>}

        <Button size="sm" onClick={runBacktest} disabled={running || assets.length === 0}
          className="h-8 text-xs bg-blue-500/20 text-blue-400 border border-blue-500/30 hover:bg-blue-500/30">
          {running ? <Loader2 className="h-3.5 w-3.5 animate-spin mr-1.5" /> : <Play className="h-3.5 w-3.5 mr-1.5" />}
          {running ? "Running..." : "Run Portfolio Backtest"}
        </Button>
      </CardContent>
    </Card>
  );
}

/* ── Metrics Display ── */

function fmtCurrency(n: number): string {
  return n >= 0 ? `$${n.toLocaleString(undefined, { minimumFractionDigits: 2 })}` : `-$${Math.abs(n).toLocaleString(undefined, { minimumFractionDigits: 2 })}`;
}

export function PortfolioMetricsBar({ metrics }: { metrics: PortfolioMetrics }) {
  const items = [
    { label: "Total Return", value: fmtCurrency(metrics.total_return), color: metrics.total_return >= 0 ? "text-emerald-400" : "text-red-400" },
    { label: "Return %", value: `${metrics.total_return_pct.toFixed(1)}%`, color: metrics.total_return_pct >= 0 ? "text-emerald-400" : "text-red-400" },
    { label: "CAGR", value: `${metrics.cagr_pct.toFixed(1)}%`, color: "text-emerald-400" },
    { label: "Sharpe", value: metrics.sharpe_ratio.toFixed(2), color: metrics.sharpe_ratio >= 1 ? "text-emerald-400" : "text-amber-400" },
    { label: "Max DD", value: `${metrics.max_drawdown_pct.toFixed(1)}%`, color: metrics.max_drawdown_pct < 15 ? "text-emerald-400" : "text-red-400" },
    { label: "Dividends", value: fmtCurrency(metrics.total_dividends_collected), color: "text-emerald-400" },
    { label: "Margin Interest", value: fmtCurrency(metrics.total_margin_interest_paid), color: "text-red-400" },
    { label: "Net Yield Spread", value: `${metrics.net_yield_spread.toFixed(2)}%`, color: metrics.net_yield_spread > 0 ? "text-emerald-400" : "text-red-400" },
    { label: "Margin Calls", value: metrics.margin_call_count.toString(), color: metrics.margin_call_count === 0 ? "text-emerald-400" : "text-red-400" },
    { label: "Avg Distance to Call", value: `${metrics.avg_distance_to_call_pct.toFixed(1)}%`, color: metrics.avg_distance_to_call_pct > 20 ? "text-emerald-400" : "text-amber-400" },
    { label: "Final Equity", value: fmtCurrency(metrics.final_equity), color: "text-blue-400" },
    { label: "Final Margin Debt", value: fmtCurrency(metrics.final_margin_debt), color: metrics.final_margin_debt > 0 ? "text-amber-400" : "text-gray-400" },
  ];

  return (
    <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3">
      {items.map((item) => (
        <div key={item.label} className="bg-[#0a0e17] rounded-lg p-3 border border-gray-800/40">
          <div className="text-[10px] text-gray-500 uppercase tracking-wider mb-1">{item.label}</div>
          <div className={`text-sm font-semibold tabular-mono ${item.color}`}>{item.value}</div>
        </div>
      ))}
    </div>
  );
}

/* ── Portfolio Chart ── */

interface PortfolioChartProps {
  data: PortfolioResult["equity_curve"];
}

export function PortfolioChart({ data }: PortfolioChartProps) {
  if (!data || data.length === 0) {
    return <div className="text-center py-12 text-sm text-gray-500">No equity curve data</div>;
  }

  return (
    <Card className="bg-[#0d1321] border-gray-800/60">
      <CardHeader className="pb-2">
        <CardTitle className="text-sm font-semibold text-gray-100 flex items-center gap-2">
          <TrendingUp className="h-4 w-4 text-blue-400/70" />
          Portfolio Value & Margin Debt
        </CardTitle>
      </CardHeader>
      <CardContent>
        <div className="h-[400px] w-full">
          <ResponsiveContainer width="100%" height="100%">
            <AreaChart data={data} margin={{ top: 10, right: 20, left: 20, bottom: 10 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="#1e293b" />
              <XAxis dataKey="date" tick={{ fill: "#64748b", fontSize: 10 }} tickLine={false} axisLine={{ stroke: "#1e293b" }}
                tickFormatter={(v: string) => v.slice(5, 10)} />
              <YAxis yAxisId="value" tick={{ fill: "#64748b", fontSize: 10 }} tickLine={false} axisLine={{ stroke: "#1e293b" }}
                tickFormatter={(v: number) => `$${(v / 1000).toFixed(0)}k`} />
              <YAxis yAxisId="pct" orientation="right" tick={{ fill: "#64748b", fontSize: 10 }} tickLine={false} axisLine={{ stroke: "#1e293b" }}
                tickFormatter={(v: number) => `${v.toFixed(0)}%`} domain={[0, 200]} hide />
              <Tooltip contentStyle={{ backgroundColor: "#0d1321", border: "1px solid #1e293b", borderRadius: "8px", fontSize: "12px" }}
                labelStyle={{ color: "#94a3b8" }}
                formatter={(value: number) => [`$${value.toLocaleString(undefined, { minimumFractionDigits: 2 })}`, ""]} />
              <Area yAxisId="value" type="monotone" dataKey="portfolio_value" stroke="#3b82f6" fill="#3b82f6" fillOpacity={0.1} strokeWidth={2} dot={false} name="Portfolio Value" />
              <Area yAxisId="value" type="monotone" dataKey="equity" stroke="#22c55e" fill="#22c55e" fillOpacity={0.05} strokeWidth={2} dot={false} name="Equity" />
              <Line yAxisId="value" type="monotone" dataKey="margin_debt" stroke="#ef4444" strokeWidth={1.5} dot={false} strokeDasharray="4 4" name="Margin Debt" />
            </AreaChart>
          </ResponsiveContainer>
        </div>
        <div className="flex gap-4 mt-3 text-xs text-gray-500">
          <span className="flex items-center gap-1"><span className="w-3 h-0.5 bg-blue-400 inline-block" /> Portfolio Value</span>
          <span className="flex items-center gap-1"><span className="w-3 h-0.5 bg-emerald-400 inline-block" /> Equity</span>
          <span className="flex items-center gap-1"><span className="w-3 h-0.5 bg-red-400 inline-block" /> Margin Debt</span>
        </div>
      </CardContent>
    </Card>
  );
}

/* ── Ledger Table ── */

export function PortfolioLedger({ ledger }: { ledger: PortfolioResult["ledger"] }) {
  if (!ledger || ledger.length === 0) {
    return <div className="text-center py-12 text-sm text-gray-500">No ledger entries</div>;
  }

  return (
    <Card className="bg-[#0d1321] border-gray-800/60">
      <CardHeader className="pb-2">
        <CardTitle className="text-sm font-semibold text-gray-100 flex items-center gap-2">
          <History className="h-4 w-4 text-blue-400/70" />
          Portfolio Ledger
        </CardTitle>
      </CardHeader>
      <CardContent className="p-0">
        <div className="overflow-x-auto max-h-[500px] overflow-y-auto">
          <Table>
            <TableHeader>
              <TableRow className="border-gray-800/60 hover:bg-transparent">
                <TableHead className="text-[10px] text-gray-600 uppercase tracking-wider h-8">Date</TableHead>
                <TableHead className="text-[10px] text-gray-600 uppercase tracking-wider h-8">Type</TableHead>
                <TableHead className="text-[10px] text-gray-600 uppercase tracking-wider h-8 text-right">Amount</TableHead>
                <TableHead className="text-[10px] text-gray-600 uppercase tracking-wider h-8">Description</TableHead>
                <TableHead className="text-[10px] text-gray-600 uppercase tracking-wider h-8 text-right">Cash After</TableHead>
                <TableHead className="text-[10px] text-gray-600 uppercase tracking-wider h-8 text-right">Margin After</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {ledger.map((entry, i) => (
                <TableRow key={i} className="border-gray-800/40 hover:bg-white/[0.02]">
                  <TableCell className="text-xs text-gray-300 h-7">{entry.date}</TableCell>
                  <TableCell className="text-xs h-7">
                    <Badge className={`text-[10px] ${
                      entry.type === "dividend" ? "bg-emerald-900/30 text-emerald-400" :
                      entry.type === "deposit" ? "bg-blue-900/30 text-blue-400" :
                      "bg-red-900/30 text-red-400"
                    }`}>
                      {entry.type}
                    </Badge>
                  </TableCell>
                  <TableCell className={`text-xs h-7 text-right tabular-mono font-medium ${
                    entry.amount >= 0 ? "text-emerald-400" : "text-red-400"
                  }`}>
                    {entry.amount >= 0 ? "+" : ""}${entry.amount.toFixed(2)}
                  </TableCell>
                  <TableCell className="text-xs text-gray-400 h-7">{entry.description}</TableCell>
                  <TableCell className="text-xs text-gray-300 h-7 text-right tabular-mono">${entry.cash_after.toFixed(2)}</TableCell>
                  <TableCell className="text-xs text-gray-300 h-7 text-right tabular-mono">${entry.margin_after.toFixed(2)}</TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      </CardContent>
    </Card>
  );
}

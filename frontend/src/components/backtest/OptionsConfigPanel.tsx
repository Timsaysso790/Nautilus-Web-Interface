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
import {
  Tabs, TabsContent, TabsList, TabsTrigger,
} from "@/components/ui/tabs";
import {
  Plus, Trash2, X, Play, Save, Loader2, Settings2,
  TrendingUp, TrendingDown, Activity, DollarSign,
} from "lucide-react";
import { TickerSelect } from "./TickerSelect";

/* ── Types ── */

interface Leg {
  strike: number;
  right: "C" | "P";
  action: "buy" | "sell";
  qty: number;
}

interface OptionsConfig {
  ticker: string;
  legs: Leg[];
  dte_min: number;
  dte_max: number;
  hold_until_dte: number;
  entry_frequency: string;
  year_range: [number, number];
  delta_min: number;
  delta_max: number;
  allow_overlapping: boolean;
  slippage_model: string;
  slippage_pct: number;
  profit_target_pct: number;
  stop_loss_pct: number;
  max_days_in_trade: number;
}

interface Props {
  onRun: (config: OptionsConfig) => void;
  running: boolean;
}

const PRESETS: Record<string, Leg[]> = {
  "Put Credit Spread": [
    { strike: 0, right: "P", action: "sell", qty: 1 },
    { strike: 0, right: "P", action: "buy", qty: 1 },
  ],
  "Iron Condor": [
    { strike: 0, right: "P", action: "sell", qty: 1 },
    { strike: 0, right: "P", action: "buy", qty: 1 },
    { strike: 0, right: "C", action: "sell", qty: 1 },
    { strike: 0, right: "C", action: "buy", qty: 1 },
  ],
  "Call Debit Spread": [
    { strike: 0, right: "C", action: "buy", qty: 1 },
    { strike: 0, right: "C", action: "sell", qty: 1 },
  ],
  "Naked Put": [
    { strike: 0, right: "P", action: "sell", qty: 1 },
  ],
};

/* ── Component ── */

export default function OptionsConfigPanel({ onRun, running }: Props) {
  const [ticker, setTicker] = useState("SPY");
  const [legs, setLegs] = useState<Leg[]>([{ strike: 0, right: "P", action: "sell", qty: 1 }]);
  const [dteMin, setDteMin] = useState(30);
  const [dteMax, setDteMax] = useState(45);
  const [holdUntilDte, setHoldUntilDte] = useState(10);
  const [entryFrequency, setEntryFrequency] = useState("weekly");
  const [yearStart, setYearStart] = useState(2020);
  const [yearEnd, setYearEnd] = useState(2025);
  const [deltaMin, setDeltaMin] = useState(0.16);
  const [deltaMax, setDeltaMax] = useState(0.20);
  const [allowOverlap, setAllowOverlap] = useState(false);
  const [slippageModel, setSlippageModel] = useState("mid");
  const [slippagePct, setSlippagePct] = useState(10);
  const [profitTarget, setProfitTarget] = useState(50);
  const [stopLoss, setStopLoss] = useState(100);
  const [maxDays, setMaxDays] = useState(60);
  const [activeTab, setActiveTab] = useState("entry");

  /* ── Leg helpers ── */
  const updateLeg = (i: number, field: keyof Leg, value: number | string) => {
    setLegs(prev => prev.map((l, idx) => idx === i ? { ...l, [field]: value } : l));
  };
  const addLeg = () => setLegs(prev => [...prev, { strike: 0, right: "C", action: "buy", qty: 1 }]);
  const removeLeg = (i: number) => setLegs(prev => prev.filter((_, idx) => idx !== i));
  const applyPreset = (name: string) => {
    const template = PRESETS[name];
    if (template) setLegs(template.map(l => ({ ...l })));
  };

  /* ── Strategy summary ── */
  const summary = useMemo(() => {
    const legs_ = legs;
    const sellQty = legs_.filter(l => l.action === "sell").reduce((s, l) => s + l.qty, 0);
    const buyQty = legs_.filter(l => l.action === "buy").reduce((s, l) => s + l.qty, 0);
    const isCredit = legs_.filter(l => l.action === "sell").length > 0;
    const avgStrike = legs_.filter(l => l.strike > 0).reduce((s, l) => s + l.strike, 0) / Math.max(legs_.filter(l => l.strike > 0).length, 1);
    const spreadWidth = (() => {
      if (legs_.length < 2) return 0;
      const shorts = legs_.filter(l => l.action === "sell").map(l => l.strike);
      const longs = legs_.filter(l => l.action === "buy").map(l => l.strike);
      if (shorts.length && longs.length) return Math.abs(shorts[0] - longs[0]);
      return 0;
    })();
    return { sellQty, buyQty, isCredit, avgStrike, spreadWidth, legCount: legs_.length };
  }, [legs]);

  const buildConfig = (): OptionsConfig => ({
    ticker, legs,
    dte_min: dteMin, dte_max: dteMax,
    hold_until_dte: holdUntilDte, entry_frequency: entryFrequency,
    year_range: [yearStart, yearEnd],
    delta_min: deltaMin, delta_max: deltaMax,
    allow_overlapping: allowOverlap,
    slippage_model: slippageModel, slippage_pct: slippagePct / 100,
    profit_target_pct: profitTarget, stop_loss_pct: stopLoss,
    max_days_in_trade: maxDays,
  });

  const handleRun = () => onRun(buildConfig());

  return (
    <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
      {/* ── Left: Config Panel ── */}
      <div className="lg:col-span-2 space-y-4">
        {/* Header: Ticker + Presets */}
        <Card className="bg-[#0d1321] border-gray-800/60">
          <CardContent className="p-3">
            <div className="flex items-center gap-3 flex-wrap">
              <div className="space-y-1">
                <Label className="text-[10px] text-gray-500">Ticker</Label>
                <TickerSelect value={ticker} onChange={setTicker} className="w-28" />
              </div>
              <div className="space-y-1">
                <Label className="text-[10px] text-gray-500">Presets</Label>
                <div className="flex gap-1.5">
                  {Object.keys(PRESETS).map(name => (
                    <Button key={name} size="sm" variant="outline"
                      className="text-[10px] h-6 border-gray-700 text-gray-400 hover:text-amber-400"
                      onClick={() => applyPreset(name)}>
                      {name}
                    </Button>
                  ))}
                </div>
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Parameter Tabs */}
        <Card className="bg-[#0d1321] border-gray-800/60">
          <Tabs value={activeTab} onValueChange={setActiveTab}>
            <TabsList className="h-8 bg-[#0a0e17] border-b border-gray-800/60 w-full justify-start rounded-none px-3 gap-4">
              <TabsTrigger value="entry" className="text-[11px] h-7 px-2 data-[state=active]:text-amber-400">Entry Rules</TabsTrigger>
              <TabsTrigger value="exit" className="text-[11px] h-7 px-2 data-[state=active]:text-amber-400">Exit Triggers</TabsTrigger>
              <TabsTrigger value="execution" className="text-[11px] h-7 px-2 data-[state=active]:text-amber-400">Execution</TabsTrigger>
              <TabsTrigger value="legs" className="text-[11px] h-7 px-2 data-[state=active]:text-amber-400">Leg Builder</TabsTrigger>
            </TabsList>

            {/* Entry Rules */}
            <TabsContent value="entry" className="p-4 space-y-4 mt-0">
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                <div className="space-y-1">
                  <Label className="text-[10px] text-gray-500">Min DTE</Label>
                  <Input type="number" value={dteMin} onChange={e => setDteMin(Number(e.target.value))}
                    className="h-7 text-xs bg-[#0a0e17] border-gray-700 text-gray-200" min={1} />
                </div>
                <div className="space-y-1">
                  <Label className="text-[10px] text-gray-500">Max DTE</Label>
                  <Input type="number" value={dteMax} onChange={e => setDteMax(Number(e.target.value))}
                    className="h-7 text-xs bg-[#0a0e17] border-gray-700 text-gray-200" min={1} />
                </div>
                <div className="space-y-1">
                  <Label className="text-[10px] text-gray-500">Min Δ</Label>
                  <Input type="number" value={deltaMin} onChange={e => setDeltaMin(Number(e.target.value))}
                    className="h-7 text-xs bg-[#0a0e17] border-gray-700 text-gray-200" step={0.01} min={0} max={1} />
                </div>
                <div className="space-y-1">
                  <Label className="text-[10px] text-gray-500">Max Δ</Label>
                  <Input type="number" value={deltaMax} onChange={e => setDeltaMax(Number(e.target.value))}
                    className="h-7 text-xs bg-[#0a0e17] border-gray-700 text-gray-200" step={0.01} min={0} max={1} />
                </div>
              </div>

              <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
                <div className="space-y-1">
                  <Label className="text-[10px] text-gray-500">Entry Frequency</Label>
                  <Select value={entryFrequency} onValueChange={setEntryFrequency}>
                    <SelectTrigger className="h-7 text-xs bg-[#0a0e17] border-gray-700 text-gray-200">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent className="bg-[#0d1321] border-gray-700 text-gray-200">
                      <SelectItem value="daily" className="text-xs">Every 1 day</SelectItem>
                      <SelectItem value="weekly" className="text-xs">Every 7 days</SelectItem>
                      <SelectItem value="biweekly" className="text-xs">Every 14 days</SelectItem>
                      <SelectItem value="monthly" className="text-xs">Every 30 days</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-1">
                  <Label className="text-[10px] text-gray-500">Year Start</Label>
                  <Input type="number" value={yearStart} onChange={e => setYearStart(Number(e.target.value))}
                    className="h-7 text-xs bg-[#0a0e17] border-gray-700 text-gray-200" />
                </div>
                <div className="space-y-1">
                  <Label className="text-[10px] text-gray-500">Year End</Label>
                  <Input type="number" value={yearEnd} onChange={e => setYearEnd(Number(e.target.value))}
                    className="h-7 text-xs bg-[#0a0e17] border-gray-700 text-gray-200" />
                </div>
              </div>

              <div className="flex items-center gap-2 pt-1">
                <Switch checked={allowOverlap} onCheckedChange={setAllowOverlap} />
                <Label className="text-[11px] text-gray-400 cursor-pointer">Allow overlapping positions (concurrent trades)</Label>
              </div>
            </TabsContent>

            {/* Exit Triggers */}
            <TabsContent value="exit" className="p-4 space-y-4 mt-0">
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                <div className="space-y-1">
                  <Label className="text-[10px] text-gray-500">Profit Target %</Label>
                  <Input type="number" value={profitTarget} onChange={e => setProfitTarget(Number(e.target.value))}
                    className="h-7 text-xs bg-[#0a0e17] border-gray-700 text-gray-200" min={0} />
                  <p className="text-[9px] text-gray-600">Exit when P&L ≥ {profitTarget}% of credit</p>
                </div>
                <div className="space-y-1">
                  <Label className="text-[10px] text-gray-500">Stop Loss %</Label>
                  <Input type="number" value={stopLoss} onChange={e => setStopLoss(Number(e.target.value))}
                    className="h-7 text-xs bg-[#0a0e17] border-gray-700 text-gray-200" min={0} />
                  <p className="text-[9px] text-gray-600">Exit when P&L ≤ -{stopLoss}% of credit</p>
                </div>
                <div className="space-y-1">
                  <Label className="text-[10px] text-gray-500">Hold Until DTE</Label>
                  <Input type="number" value={holdUntilDte} onChange={e => setHoldUntilDte(Number(e.target.value))}
                    className="h-7 text-xs bg-[#0a0e17] border-gray-700 text-gray-200" min={0} />
                </div>
                <div className="space-y-1">
                  <Label className="text-[10px] text-gray-500">Max Days in Trade</Label>
                  <Input type="number" value={maxDays} onChange={e => setMaxDays(Number(e.target.value))}
                    className="h-7 text-xs bg-[#0a0e17] border-gray-700 text-gray-200" min={1} />
                </div>
              </div>
              <p className="text-[10px] text-gray-600">Exits trigger on first condition met: profit target, stop loss, DTE threshold, or max hold time.</p>
            </TabsContent>

            {/* Execution */}
            <TabsContent value="execution" className="p-4 space-y-4 mt-0">
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                <div className="space-y-1">
                  <Label className="text-[10px] text-gray-500">Slippage Model</Label>
                  <Select value={slippageModel} onValueChange={setSlippageModel}>
                    <SelectTrigger className="h-7 text-xs bg-[#0a0e17] border-gray-700 text-gray-200">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent className="bg-[#0d1321] border-gray-700 text-gray-200">
                      <SelectItem value="mid" className="text-xs">Mid (no slippage)</SelectItem>
                      <SelectItem value="spread_pct" className="text-xs">Spread % penalty</SelectItem>
                      <SelectItem value="aggressive" className="text-xs">Aggressive (worst side)</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-1">
                  <Label className="text-[10px] text-gray-500">Spread Penalty %</Label>
                  <Input type="number" value={slippagePct} onChange={e => setSlippagePct(Number(e.target.value))}
                    className="h-7 text-xs bg-[#0a0e17] border-gray-700 text-gray-200" min={0} max={100} />
                </div>
                <div className="space-y-1">
                  <Label className="text-[10px] text-gray-500">Commission</Label>
                  <div className="h-7 flex items-center text-xs text-gray-400">$0.65 / contract</div>
                </div>
                <div className="space-y-1">
                  <Label className="text-[10px] text-gray-500">Contract Multiplier</Label>
                  <div className="h-7 flex items-center text-xs text-gray-400">100 (standard)</div>
                </div>
              </div>
            </TabsContent>

            {/* Leg Builder */}
            <TabsContent value="legs" className="p-4 space-y-3 mt-0">
              <div className="flex items-center justify-between">
                <Label className="text-[11px] text-gray-500">Strategy Legs</Label>
                <Button size="sm" variant="ghost" className="h-6 text-[10px] text-amber-400" onClick={addLeg}>
                  <Plus className="h-3 w-3 mr-0.5" /> Add Leg
                </Button>
              </div>
              {legs.map((leg, i) => (
                <div key={i} className="flex items-center gap-2 bg-[#0a0e17] rounded-lg px-3 py-2 border border-gray-800/40">
                  <span className="text-[10px] text-gray-600 w-5">{i + 1}.</span>
                  <Select value={leg.action} onValueChange={v => updateLeg(i, "action", v)}>
                    <SelectTrigger className="w-16 h-7 text-[11px] bg-[#0d1321] border-gray-700 text-gray-300"><SelectValue /></SelectTrigger>
                    <SelectContent className="bg-[#0d1321] border-gray-700 text-gray-300">
                      <SelectItem value="buy" className="text-xs"><span className="text-emerald-400">Buy</span></SelectItem>
                      <SelectItem value="sell" className="text-xs"><span className="text-red-400">Sell</span></SelectItem>
                    </SelectContent>
                  </Select>
                  <Select value={leg.right} onValueChange={v => updateLeg(i, "right", v)}>
                    <SelectTrigger className="w-14 h-7 text-[11px] bg-[#0d1321] border-gray-700 text-gray-300"><SelectValue /></SelectTrigger>
                    <SelectContent className="bg-[#0d1321] border-gray-700 text-gray-300">
                      <SelectItem value="C" className="text-xs"><span className="text-emerald-400">C</span></SelectItem>
                      <SelectItem value="P" className="text-xs"><span className="text-red-400">P</span></SelectItem>
                    </SelectContent>
                  </Select>
                  <div className="flex items-center gap-1 flex-1">
                    <Label className="text-[9px] text-gray-600">Strike</Label>
                    <Input type="number" value={leg.strike || ""} onChange={e => updateLeg(i, "strike", Number(e.target.value))}
                      className="w-20 h-7 text-[11px] bg-[#0a0e17] border-gray-700 text-gray-200" placeholder="0" />
                  </div>
                  <div className="flex items-center gap-1">
                    <Label className="text-[9px] text-gray-600">Qty</Label>
                    <Input type="number" value={leg.qty} onChange={e => updateLeg(i, "qty", Number(e.target.value))}
                      className="w-14 h-7 text-[11px] bg-[#0a0e17] border-gray-700 text-gray-200" min={1} />
                  </div>
                  <button onClick={() => removeLeg(i)} className="p-1 text-gray-600 hover:text-red-400"><X className="h-3 w-3" /></button>
                </div>
              ))}
            </TabsContent>
          </Tabs>
        </Card>

        {/* Run Button */}
        <Button size="sm" onClick={handleRun} disabled={running || legs.length === 0}
          className="w-full h-9 text-xs bg-amber-500/20 text-amber-400 border border-amber-500/30 hover:bg-amber-500/30">
          {running ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : <Play className="h-4 w-4 mr-2" />}
          {running ? "Running Backtest..." : "▶ Run Options Backtest"}
        </Button>
      </div>

      {/* ── Right: Strategy Summary ── */}
      <div className="space-y-3">
        <Card className="bg-[#0d1321] border-gray-800/60">
          <CardHeader className="pb-2">
            <CardTitle className="text-xs font-semibold text-gray-100 flex items-center gap-2">
              <Activity className="h-3.5 w-3.5 text-amber-400/70" />
              Strategy Summary
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-2 text-[11px]">
            <div className="flex justify-between"><span className="text-gray-500">Ticker</span><span className="text-gray-200 font-medium">{ticker}</span></div>
            <div className="flex justify-between"><span className="text-gray-500">Legs</span><span className="text-gray-200">{summary.legCount}</span></div>
            <div className="flex justify-between"><span className="text-gray-500">Type</span>
              <Badge className={`text-[10px] ${summary.isCredit ? "bg-emerald-900/30 text-emerald-400" : "bg-red-900/30 text-red-400"}`}>
                {summary.isCredit ? "Credit" : "Debit"}
              </Badge>
            </div>
            <Separator className="bg-gray-800/60" />
            <div className="flex justify-between"><span className="text-gray-500">DTE Range</span><span className="text-gray-200">{dteMin}–{dteMax} days</span></div>
            <div className="flex justify-between"><span className="text-gray-500">Δ Range</span><span className="text-gray-200">{deltaMin.toFixed(2)}–{deltaMax.toFixed(2)}</span></div>
            <div className="flex justify-between"><span className="text-gray-500">Rollover</span><span className="text-gray-200">{allowOverlap ? "Overlapping" : "Sequential"}</span></div>
            <Separator className="bg-gray-800/60" />
            <div className="flex justify-between"><span className="text-gray-500">Profit Target</span><span className="text-emerald-400">{profitTarget}%</span></div>
            <div className="flex justify-between"><span className="text-gray-500">Stop Loss</span><span className="text-red-400">{stopLoss}%</span></div>
            <div className="flex justify-between"><span className="text-gray-500">Slippage</span><span className="text-gray-400">{slippageModel === "mid" ? "None" : `${slippagePct}% spread`}</span></div>
            <Separator className="bg-gray-800/60" />
            <div className="flex justify-between"><span className="text-gray-500">Period</span><span className="text-gray-200">{yearStart}–{yearEnd}</span></div>
            <div className="flex justify-between"><span className="text-gray-500">Frequency</span><span className="text-gray-200">{entryFrequency}</span></div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}

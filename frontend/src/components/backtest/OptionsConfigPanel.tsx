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
  Play, Loader2, Activity,
  TrendingDown, TrendingUp,
} from "lucide-react";
import { TickerSelect } from "./TickerSelect";

/* ── Types ── */

interface Leg {
  target_delta: number;  // 0.16 = 16-delta
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

/* ── Delta-based strategy presets ── */

interface Preset {
  name: string;
  description: string;
  legs: Leg[];
  widthMode?: "delta" | "dollar";
}

const PRESETS: Preset[] = [
  {
    name: "Put Credit Spread",
    description: "Sell 16Δ put, buy 10Δ put — 30-45 DTE",
    legs: [
      { target_delta: 0.16, right: "P", action: "sell", qty: 1 },
      { target_delta: 0.10, right: "P", action: "buy", qty: 1 },
    ],
    widthMode: "delta" as const,
  },
  {
    name: "Call Credit Spread",
    description: "Sell 16Δ call, buy 10Δ call — 30-45 DTE",
    legs: [
      { target_delta: 0.16, right: "C", action: "sell", qty: 1 },
      { target_delta: 0.10, right: "C", action: "buy", qty: 1 },
    ],
    widthMode: "delta" as const,
  },
  {
    name: "Iron Condor",
    description: "16Δ put spread + 16Δ call spread",
    legs: [
      { target_delta: 0.16, right: "P", action: "sell", qty: 1 },
      { target_delta: 0.10, right: "P", action: "buy", qty: 1 },
      { target_delta: 0.16, right: "C", action: "sell", qty: 1 },
      { target_delta: 0.10, right: "C", action: "buy", qty: 1 },
    ],
    widthMode: "delta" as const,
  },
  {
    name: "Naked Put",
    description: "Sell 20Δ put — 30-45 DTE",
    legs: [
      { target_delta: 0.20, right: "P", action: "sell", qty: 1 },
    ],
    widthMode: "delta" as const,
  },
  {
    name: "Jade Lizard",
    description: "Sell 16Δ put + sell 10Δ call (no upside risk)",
    legs: [
      { target_delta: 0.16, right: "P", action: "sell", qty: 1 },
      { target_delta: 0.10, right: "C", action: "sell", qty: 1 },
    ],
    widthMode: "delta" as const,
  },
];

const DELTA_PRESETS = [0.05, 0.10, 0.16, 0.20, 0.25, 0.30, 0.40, 0.50];

/* ── Component ── */

export default function OptionsConfigPanel({ onRun, running }: Props) {
  const [ticker, setTicker] = useState("SPY");
  const [selectedPreset, setSelectedPreset] = useState<string>("Put Credit Spread");
  const [legs, setLegs] = useState<Leg[]>(PRESETS[0].legs.map(l => ({ ...l })));
  const [widthMode, setWidthMode] = useState<"delta" | "dollar">("delta");
  const [dollarWidth, setDollarWidth] = useState(5);
  const [dteMin, setDteMin] = useState(30);
  const [dteMax, setDteMax] = useState(45);
  const [holdUntilDte, setHoldUntilDte] = useState(21);
  const [entryFrequency, setEntryFrequency] = useState("weekly");
  const [entryTriggerMode, setEntryTriggerMode] = useState<"calendar" | "technical">("calendar");
  const [indicatorType, setIndicatorType] = useState("rsi");
  const [indicatorThreshold, setIndicatorThreshold] = useState(30);
  const [yearStart, setYearStart] = useState(2020);
  const [yearEnd, setYearEnd] = useState(2025);
  const [tickerInfo, setTickerInfo] = useState<any>(null);
  const [allowOverlap, setAllowOverlap] = useState(false);
  const [slippageModel, setSlippageModel] = useState("mid");
  const [slippagePct, setSlippagePct] = useState(10);
  const [profitTarget, setProfitTarget] = useState(50);
  const [stopLoss, setStopLoss] = useState(100);
  const [maxDays, setMaxDays] = useState(60);

  /* ── Delta helpers ── */
  const updateLegDelta = (i: number, delta: number) => {
    setLegs(prev => prev.map((l, idx) => idx === i ? { ...l, target_delta: delta } : l));
  };
  const toggleLegRight = (i: number) => {
    setLegs(prev => prev.map((l, idx) => idx === i ? { ...l, right: l.right === "C" ? "P" : "C" } : l));
  };
  const toggleLegAction = (i: number) => {
    setLegs(prev => prev.map((l, idx) => idx === i ? { ...l, action: l.action === "buy" ? "sell" : "buy" } : l));
  };
  const removeLeg = (i: number) => setLegs(prev => prev.filter((_, idx) => idx !== i));

  const applyPreset = (name: string) => {
    const preset = PRESETS.find(p => p.name === name);
    if (preset) {
      setSelectedPreset(name);
      setLegs(preset.legs.map(l => ({ ...l })));
    }
  };

  /* ── Strategy summary ── */
  const summary = useMemo(() => {
    const sellLegs = legs.filter(l => l.action === "sell");
    const buyLegs = legs.filter(l => l.action === "buy");
    const isCredit = sellLegs.length > 0;
    const avgShortDelta = sellLegs.length > 0
      ? sellLegs.reduce((s, l) => s + l.target_delta, 0) / sellLegs.length
      : 0;
    return { sellCount: sellLegs.length, buyCount: buyLegs.length, isCredit, avgShortDelta };
  }, [legs]);

  const buildConfig = (): OptionsConfig => {
    const finalLegs = widthMode === "dollar" ? [
      // Short leg at target delta
      { ...legs.find(l => l.action === "sell") || legs[0] },
      // Auto-calculated long leg: same right, buy action, approx delta = short * 0.6
      {
        target_delta: (legs.find(l => l.action === "sell")?.target_delta || 0.16) * 0.6,
        right: legs.find(l => l.action === "sell")?.right || "P",
        action: "buy" as const,
        qty: 1,
      },
    ] : legs;
    return {
      ticker, legs: finalLegs,
      dte_min: dteMin, dte_max: dteMax,
      hold_until_dte: holdUntilDte, entry_frequency: entryFrequency,
      year_range: [yearStart, yearEnd],
      delta_min: 0, delta_max: 1,
      allow_overlapping: allowOverlap,
      slippage_model: slippageModel, slippage_pct: slippagePct / 100,
      profit_target_pct: profitTarget, stop_loss_pct: stopLoss,
      max_days_in_trade: maxDays,
    };
  };

  const handleRun = () => onRun(buildConfig());

  return (
    <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
      {/* ── Left: Config Panel ── */}
      <div className="lg:col-span-2 space-y-4">
        {/* Ticker + Presets */}
        <Card className="bg-[#0d1321] border-gray-800/60 options-config-scroll">
          <CardContent className="p-3">
            <div className="flex items-center gap-3 flex-wrap">
              <div className="space-y-1">
                <Label className="text-[10px] text-gray-500">Ticker</Label>
                <TickerSelect
                  value={ticker}
                  onChange={(t) => { setTicker(t); }}
                  onTickerInfo={(info) => {
                    setTickerInfo(info);
                    if (info && info.min_year && info.max_year) {
                      setYearStart(Math.max(info.min_year, 2020));
                      setYearEnd(info.max_year);
                    }
                  }}
                  className="w-36"
                />
                {tickerInfo && (
                  <p className="text-[9px] text-gray-500">
                    Data: {tickerInfo.min_year}–{tickerInfo.max_year} ({tickerInfo.file_count} years)
                  </p>
                )}
              </div>
              <div className="space-y-1 flex-1">
                <Label className="text-[10px] text-gray-500">Strategy Preset</Label>
                <div className="flex flex-wrap gap-1.5">
                  {PRESETS.map(p => (
                    <Button key={p.name} size="sm" variant="outline"
                      className={`text-[10px] h-7 border-gray-700 transition-colors ${
                        selectedPreset === p.name
                          ? "border-amber-500/50 text-amber-400 bg-amber-400/10"
                          : "text-gray-400 hover:text-amber-400"
                      }`}
                      onClick={() => applyPreset(p.name)}
                      title={p.description}>
                      {p.name}
                    </Button>
                  ))}
                </div>
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Parameter Tabs */}
        <Card className="bg-[#0d1321] border-gray-800/60">
          <Tabs defaultValue="legs">
            <TabsList className="h-8 bg-[#0a0e17] border-b border-gray-800/60 w-full justify-start rounded-none px-3 gap-4">
              <TabsTrigger value="legs" className="text-[11px] h-7 px-2 data-[state=active]:text-amber-400">Strategy Legs</TabsTrigger>
              <TabsTrigger value="entry" className="text-[11px] h-7 px-2 data-[state=active]:text-amber-400">Entry Rules</TabsTrigger>
              <TabsTrigger value="exit" className="text-[11px] h-7 px-2 data-[state=active]:text-amber-400">Exit Triggers</TabsTrigger>
              <TabsTrigger value="execution" className="text-[11px] h-7 px-2 data-[state=active]:text-amber-400">Execution</TabsTrigger>
            </TabsList>

            {/* Strategy Legs — Delta-based */}
            <TabsContent value="legs" className="p-4 space-y-3 mt-0">
              {/* Width mode toggle */}
              <div className="flex items-center gap-3">
                <span className="text-[10px] text-gray-500">Width mode:</span>
                <div className="flex bg-[#0a0e17] rounded-md border border-gray-700 p-0.5">
                  <button onClick={() => setWidthMode("delta")}
                    className={`px-3 py-1 rounded text-[10px] font-medium transition-colors ${
                      widthMode === "delta" ? "bg-amber-400/20 text-amber-400" : "text-gray-500 hover:text-gray-300"
                    }`}>
                    Delta Spread
                  </button>
                  <button onClick={() => setWidthMode("dollar")}
                    className={`px-3 py-1 rounded text-[10px] font-medium transition-colors ${
                      widthMode === "dollar" ? "bg-amber-400/20 text-amber-400" : "text-gray-500 hover:text-gray-300"
                    }`}>
                    $ Width
                  </button>
                </div>
                {widthMode === "dollar" && (
                  <div className="flex items-center gap-2">
                    <span className="text-[10px] text-gray-500">$</span>
                    <Input type="number" value={dollarWidth}
                      onChange={e => setDollarWidth(Number(e.target.value))}
                      className="w-16 h-7 text-[11px] bg-[#0a0e17] border-gray-700 text-gray-200 [appearance:textfield] [&::-webkit-inner-spin-button]:appearance-none [&::-webkit-outer-spin-button]:appearance-none"
                      min={1} step={1} />
                    <span className="text-[10px] text-gray-600">wide</span>
                  </div>
                )}
              </div>

              <p className="text-[10px] text-gray-500">
                {widthMode === "delta"
                  ? "Define each leg by its target delta. The engine resolves strikes at entry time."
                  : `Short leg at target delta, long leg $${dollarWidth} wide. Engine resolves exact strikes at entry.`}
              </p>

              {/* Show only short leg in dollar mode, all legs in delta mode */}
              {(widthMode === "dollar" ? legs.filter(l => l.action === "sell") : legs).map((leg, i) => {
                const actualIndex = widthMode === "dollar" ? legs.findIndex(l => l === leg) : i;
                return (
                <div key={i} className="flex items-center gap-2 bg-[#0a0e17] rounded-lg px-3 py-2.5 border border-gray-800/40">
                  <span className="text-[10px] text-gray-600 w-5">{i + 1}.</span>

                  {/* Action toggle */}
                  <button onClick={() => toggleLegAction(actualIndex)}
                    className={`w-14 h-7 rounded text-[11px] font-medium border transition-colors ${
                      leg.action === "sell"
                        ? "bg-red-900/20 border-red-500/30 text-red-400"
                        : "bg-emerald-900/20 border-emerald-500/30 text-emerald-400"
                    }`}>
                    {leg.action === "sell" ? "SELL" : "BUY"}
                  </button>

                  {/* Right toggle */}
                  <button onClick={() => toggleLegRight(actualIndex)}
                    className="w-10 h-7 rounded text-[11px] font-medium bg-[#0d1321] border border-gray-700 text-gray-300 hover:border-gray-500 transition-colors">
                    {leg.right}
                  </button>

                  {/* Delta selector */}
                  <div className="flex items-center gap-1 flex-1">
                    <Label className="text-[9px] text-gray-600 shrink-0">Δ</Label>
                    <div className="flex flex-wrap gap-1">
                      {DELTA_PRESETS.map(d => (
                        <button key={d} onClick={() => updateLegDelta(actualIndex, d)}
                          className={`px-1.5 py-0.5 rounded text-[10px] font-mono font-medium transition-colors ${
                            leg.target_delta === d
                              ? "bg-amber-400/20 text-amber-400 border border-amber-500/40"
                              : "text-gray-500 hover:text-gray-300 border border-transparent hover:border-gray-700"
                          }`}>
                          {(d * 100).toFixed(0)}
                        </button>
                      ))}
                    </div>
                    <Input type="number" value={leg.target_delta || ""}
                      onChange={e => updateLegDelta(actualIndex, Number(e.target.value))}
                      className="w-[68px] h-7 text-[11px] bg-[#0a0e17] border-gray-700 text-gray-200 ml-1 [appearance:textfield] [&::-webkit-inner-spin-button]:appearance-none [&::-webkit-outer-spin-button]:appearance-none"
                      step={0.01} min={0.01} max={1} placeholder="0.16" />
                  </div>

                  {/* Qty */}
                  <div className="flex items-center gap-1 shrink-0">
                    <Label className="text-[9px] text-gray-600">×</Label>
                    <span className="text-[11px] text-gray-400 w-4 text-center">{leg.qty}</span>
                  </div>

                  {widthMode === "delta" && legs.length > 1 && (
                    <button onClick={() => removeLeg(actualIndex)} className="p-1 text-gray-600 hover:text-red-400 ml-1">
                      <span className="text-xs">✕</span>
                    </button>
                  )}
                </div>
                );
              })}

              {/* Dollar mode: show calculated long leg */}
              {widthMode === "dollar" && (
                <div className="flex items-center gap-2 bg-[#0a0e17] rounded-lg px-3 py-2.5 border border-emerald-500/20 border-dashed">
                  <span className="text-[10px] text-gray-600 w-5">2.</span>
                  <span className="w-14 h-7 rounded text-[11px] font-medium bg-emerald-900/20 border border-emerald-500/30 text-emerald-400 flex items-center justify-center">BUY</span>
                  <span className="w-10 h-7 rounded text-[11px] font-medium bg-[#0d1321] border border-gray-700 text-gray-300 flex items-center justify-center">{legs[0]?.right || "P"}</span>
                  <div className="flex items-center gap-1 flex-1">
                    <Label className="text-[9px] text-gray-600 shrink-0">Δ</Label>
                    <span className="text-[11px] text-emerald-400 font-mono">~{(legs[0]?.target_delta * 0.6).toFixed(2)}</span>
                    <span className="text-[9px] text-gray-600 ml-2">${dollarWidth} wide protection</span>
                  </div>
                  <span className="text-[10px] text-emerald-400/60 italic text-right shrink-0">auto</span>
                </div>
              )}

              {/* Quick delta summary */}
              {legs.length >= 2 && (
                <div className="flex items-center gap-2 text-[10px] text-gray-500 pt-1">
                  <span>Spread: </span>
                  {widthMode === "dollar" ? (
                    <>
                      <Badge className="text-[10px] bg-red-900/20 text-red-400 border-red-500/30">
                        Sell {(legs[0]?.target_delta * 100).toFixed(0)}Δ {legs[0]?.right}
                      </Badge>
                      <Badge className="text-[10px] bg-emerald-900/20 text-emerald-400 border-emerald-500/30">
                        Buy ~{(legs[0]?.target_delta * 0.6 * 100).toFixed(0)}Δ {legs[0]?.right} (${dollarWidth} wide)
                      </Badge>
                    </>
                  ) : (
                    <>
                      {legs.filter(l => l.action === "sell").map((l, i) => (
                        <Badge key={i} className="text-[10px] bg-red-900/20 text-red-400 border-red-500/30">
                          Sell {(l.target_delta * 100).toFixed(0)}Δ {l.right}
                        </Badge>
                      ))}
                      {legs.filter(l => l.action === "buy").map((l, i) => (
                        <Badge key={i} className="text-[10px] bg-emerald-900/20 text-emerald-400 border-emerald-500/30">
                          Buy {(l.target_delta * 100).toFixed(0)}Δ {l.right}
                        </Badge>
                      ))}
                    </>
                  )}
                </div>
              )}
            </TabsContent>

            {/* Entry Rules */}
            <TabsContent value="entry" className="p-4 space-y-4 mt-0">
              {/* DTE + Timeframe */}
              <div>
                <Label className="text-[10px] text-gray-500 uppercase tracking-wider mb-2 block">DTE Range</Label>
                <div className="grid grid-cols-2 gap-3">
                  <div className="space-y-1">
                    <Label className="text-[10px] text-gray-500">Min DTE</Label>
                    <Input type="number" value={dteMin} onChange={e => setDteMin(Number(e.target.value))}
                      className="h-8 text-xs bg-[#0a0e17] border-gray-700 text-gray-200 [appearance:textfield] [&::-webkit-inner-spin-button]:appearance-none [&::-webkit-outer-spin-button]:appearance-none" min={1} />
                  </div>
                  <div className="space-y-1">
                    <Label className="text-[10px] text-gray-500">Max DTE</Label>
                    <Input type="number" value={dteMax} onChange={e => setDteMax(Number(e.target.value))}
                      className="h-8 text-xs bg-[#0a0e17] border-gray-700 text-gray-200 [appearance:textfield] [&::-webkit-inner-spin-button]:appearance-none [&::-webkit-outer-spin-button]:appearance-none" min={1} />
                  </div>
                </div>
              </div>

              <Separator className="bg-gray-800/60" />

              {/* Entry Trigger */}
              <div>
                <Label className="text-[10px] text-gray-500 uppercase tracking-wider mb-2 block">Entry Trigger</Label>
                <div className="flex items-center gap-2 mb-3">
                  <button onClick={() => setEntryTriggerMode("calendar")}
                    className={`px-3 py-1 rounded text-[10px] font-medium transition-colors border ${
                      entryTriggerMode === "calendar"
                        ? "bg-amber-400/10 text-amber-400 border-amber-500/40"
                        : "text-gray-500 border-gray-700 hover:text-gray-300"
                    }`}>
                    Calendar
                  </button>
                  <button onClick={() => setEntryTriggerMode("technical")}
                    className={`px-3 py-1 rounded text-[10px] font-medium transition-colors border ${
                      entryTriggerMode === "technical"
                        ? "bg-amber-400/10 text-amber-400 border-amber-500/40"
                        : "text-gray-500 border-gray-700 hover:text-gray-300"
                    }`}>
                    Technical
                  </button>
                </div>

                {entryTriggerMode === "calendar" ? (
                  <div className="space-y-1">
                    <Label className="text-[10px] text-gray-500">Check for new entries every</Label>
                    <Select value={entryFrequency} onValueChange={setEntryFrequency}>
                      <SelectTrigger className="h-8 text-xs bg-[#0a0e17] border-gray-700 text-gray-200 w-[160px]">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent className="bg-[#0d1321] border-gray-700 text-gray-200">
                        <SelectItem value="daily" className="text-xs">Every day</SelectItem>
                        <SelectItem value="weekly" className="text-xs">Every 7 days</SelectItem>
                        <SelectItem value="biweekly" className="text-xs">Every 14 days</SelectItem>
                        <SelectItem value="monthly" className="text-xs">Every 30 days</SelectItem>
                      </SelectContent>
                    </Select>
                    <p className="text-[9px] text-gray-600">Simple time-based: checks for entry every N days. If no eligible trade exists, waits for the next window.</p>
                  </div>
                ) : (
                  <div className="space-y-3">
                    <div className="flex items-center gap-3">
                      <div className="space-y-1">
                        <Label className="text-[10px] text-gray-500">Indicator</Label>
                        <Select value={indicatorType} onValueChange={setIndicatorType}>
                          <SelectTrigger className="h-8 text-xs bg-[#0a0e17] border-gray-700 text-gray-200 w-[140px]">
                            <SelectValue />
                          </SelectTrigger>
                          <SelectContent className="bg-[#0d1321] border-gray-700 text-gray-200">
                            <SelectItem value="rsi" className="text-xs">RSI &lt; threshold</SelectItem>
                            <SelectItem value="rsi_above" className="text-xs">RSI &gt; threshold</SelectItem>
                            <SelectItem value="bb_lower" className="text-xs">Price &lt; BB lower</SelectItem>
                            <SelectItem value="sma_below" className="text-xs">Price &lt; SMA(50)</SelectItem>
                            <SelectItem value="sma_above" className="text-xs">Price &gt; SMA(200)</SelectItem>
                          </SelectContent>
                        </Select>
                      </div>
                      {(indicatorType === "rsi" || indicatorType === "rsi_above") && (
                        <div className="space-y-1">
                          <Label className="text-[10px] text-gray-500">Threshold</Label>
                          <Input type="number" value={indicatorThreshold}
                            onChange={e => setIndicatorThreshold(Number(e.target.value))}
                            className="h-8 text-xs bg-[#0a0e17] border-gray-700 text-gray-200 w-[80px] [appearance:textfield] [&::-webkit-inner-spin-button]:appearance-none [&::-webkit-outer-spin-button]:appearance-none"
                            min={0} max={100} />
                        </div>
                      )}
                    </div>
                    <p className="text-[9px] text-gray-600">
                      {indicatorType === "rsi" && `Enter only when RSI drops below ${indicatorThreshold} (oversold). Checks weekly for signal + eligible DTE/Δ.`}
                      {indicatorType === "rsi_above" && `Enter only when RSI rises above ${indicatorThreshold} (momentum). Checks weekly for signal + eligible DTE/Δ.`}
                      {indicatorType === "bb_lower" && "Enter only when price touches/crosses below lower Bollinger Band. Checks weekly."}
                      {indicatorType === "sma_below" && "Enter only when price is below 50-day SMA (trend pullback). Checks weekly."}
                      {indicatorType === "sma_above" && "Enter only when price is above 200-day SMA (bull trend). Checks weekly."}
                    </p>
                  </div>
                )}
              </div>

              <Separator className="bg-gray-800/60" />

              {/* Backtest Period */}
              <div>
                <Label className="text-[10px] text-gray-500 uppercase tracking-wider mb-2 block">Backtest Period</Label>
                <div className="flex items-center gap-1.5">
                  <Input type="number" value={yearStart} onChange={e => setYearStart(Number(e.target.value))}
                    className="h-8 text-xs bg-[#0a0e17] border-gray-700 text-gray-200 w-[80px] [appearance:textfield] [&::-webkit-inner-spin-button]:appearance-none [&::-webkit-outer-spin-button]:appearance-none"
                    min={tickerInfo?.min_year || 2018} max={tickerInfo?.max_year || 2026} />
                  <span className="text-gray-600 text-xs">–</span>
                  <Input type="number" value={yearEnd} onChange={e => setYearEnd(Number(e.target.value))}
                    className="h-8 text-xs bg-[#0a0e17] border-gray-700 text-gray-200 w-[80px] [appearance:textfield] [&::-webkit-inner-spin-button]:appearance-none [&::-webkit-outer-spin-button]:appearance-none"
                    min={tickerInfo?.min_year || 2018} max={tickerInfo?.max_year || 2026} />
                  <span className="text-[10px] text-gray-600 ml-2">— loads {yearEnd - yearStart + 1} years of data</span>
                </div>
                <p className="text-[9px] text-gray-600 mt-1">The engine loads ticker data for these years and simulates trading across the entire period.</p>
              </div>

              <div className="flex items-center gap-2 pt-1">
                <Switch checked={allowOverlap} onCheckedChange={setAllowOverlap} />
                <Label className="text-[11px] text-gray-400 cursor-pointer">Allow overlapping positions (run multiple trades at once)</Label>
              </div>
            </TabsContent>

            {/* Exit Triggers */}
            <TabsContent value="exit" className="p-4 space-y-4 mt-0">
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                <div className="space-y-1">
                  <Label className="text-[10px] text-gray-500">Profit Target %</Label>
                  <Input type="number" value={profitTarget} onChange={e => setProfitTarget(Number(e.target.value))}
                    className="h-8 text-xs bg-[#0a0e17] border-gray-700 text-emerald-400 [appearance:textfield] [&::-webkit-inner-spin-button]:appearance-none [&::-webkit-outer-spin-button]:appearance-none" min={0} />
                  <p className="text-[9px] text-gray-600">Exit at +{profitTarget}% of credit</p>
                </div>
                <div className="space-y-1">
                  <Label className="text-[10px] text-gray-500">Stop Loss %</Label>
                  <Input type="number" value={stopLoss} onChange={e => setStopLoss(Number(e.target.value))}
                    className="h-8 text-xs bg-[#0a0e17] border-gray-700 text-red-400 [appearance:textfield] [&::-webkit-inner-spin-button]:appearance-none [&::-webkit-outer-spin-button]:appearance-none" min={0} />
                  <p className="text-[9px] text-gray-600">Exit at -{stopLoss}% of credit</p>
                </div>
                <div className="space-y-1">
                  <Label className="text-[10px] text-gray-500">Hold Until DTE</Label>
                  <Input type="number" value={holdUntilDte} onChange={e => setHoldUntilDte(Number(e.target.value))}
                    className="h-8 text-xs bg-[#0a0e17] border-gray-700 text-gray-200 [appearance:textfield] [&::-webkit-inner-spin-button]:appearance-none [&::-webkit-outer-spin-button]:appearance-none" min={0} />
                  <p className="text-[9px] text-gray-600">21 = standard tastytrade</p>
                </div>
                <div className="space-y-1">
                  <Label className="text-[10px] text-gray-500">Max Days</Label>
                  <Input type="number" value={maxDays} onChange={e => setMaxDays(Number(e.target.value))}
                    className="h-8 text-xs bg-[#0a0e17] border-gray-700 text-gray-200 [appearance:textfield] [&::-webkit-inner-spin-button]:appearance-none [&::-webkit-outer-spin-button]:appearance-none" min={1} />
                </div>
              </div>
              <p className="text-[10px] text-gray-600">First condition triggered wins: profit target → stop loss → DTE → max days.</p>
            </TabsContent>

            {/* Execution */}
            <TabsContent value="execution" className="p-4 space-y-4 mt-0">
              <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
                <div className="space-y-1">
                  <Label className="text-[10px] text-gray-500">Slippage Model</Label>
                  <Select value={slippageModel} onValueChange={setSlippageModel}>
                    <SelectTrigger className="h-7 text-xs bg-[#0a0e17] border-gray-700 text-gray-200">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent className="bg-[#0d1321] border-gray-700 text-gray-200">
                      <SelectItem value="mid" className="text-xs">Mid (no slippage)</SelectItem>
                      <SelectItem value="spread_pct" className="text-xs">Spread % penalty</SelectItem>
                      <SelectItem value="aggressive" className="text-xs">Aggressive</SelectItem>
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
              </div>
            </TabsContent>
          </Tabs>
        </Card>

        {/* Run Button */}
        <Button size="sm" onClick={handleRun} disabled={running || legs.length === 0}
          className="w-full h-10 text-sm bg-amber-500/20 text-amber-400 border border-amber-500/30 hover:bg-amber-500/30">
          {running ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : <Play className="h-4 w-4 mr-2" />}
          {running ? "Running..." : "▶ Run Backtest"}
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
            <div className="flex justify-between"><span className="text-gray-500">Preset</span><span className="text-amber-400">{selectedPreset}</span></div>
            <div className="flex justify-between"><span className="text-gray-500">Type</span>
              <Badge className={`text-[10px] ${summary.isCredit ? "bg-emerald-900/30 text-emerald-400" : "bg-red-900/30 text-red-400"}`}>
                {summary.isCredit ? "Credit" : "Debit"}
              </Badge>
            </div>
            <Separator className="bg-gray-800/60" />
            <div className="flex justify-between"><span className="text-gray-500">Short Δ</span>
              <span className="text-gray-200">{(summary.avgShortDelta * 100).toFixed(0)}Δ avg</span>
            </div>
            <div className="flex justify-between"><span className="text-gray-500">DTE Range</span><span className="text-gray-200">{dteMin}–{dteMax}d</span></div>
            <div className="flex justify-between"><span className="text-gray-500">Rollover</span><span className="text-gray-200">{allowOverlap ? "Overlapping" : "Sequential"}</span></div>
            <Separator className="bg-gray-800/60" />
            <div className="flex justify-between"><span className="text-gray-500">Profit Target</span><span className="text-emerald-400">+{profitTarget}%</span></div>
            <div className="flex justify-between"><span className="text-gray-500">Stop Loss</span><span className="text-red-400">-{stopLoss}%</span></div>
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

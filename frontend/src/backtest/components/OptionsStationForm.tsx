import { useState, useEffect, useCallback, forwardRef, useImperativeHandle } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Label } from "@/components/ui/label";
import { Plus, Trash2, Lock, Unlock } from "lucide-react";
import type { OptionLeg, ExitRules, ConditionGroup, CompiledStrategy } from "../types";
import { ConditionTriggerEngine } from "./ConditionTriggerEngine";
import { ExitRulesPanel } from "./ExitRulesPanel";

interface Props {
  projectId: string;
  projectName: string;
  templateConfig: CompiledStrategy | null;
}

const DEFAULT_EXIT_RULES: ExitRules = {
  profitTargetPct: null,
  stopLossPct: null,
  trailingStopPct: null,
  trailingStopActivationPct: 0,
  earlyExitDte: null,
  intradayCutoff: "",
  conflictResolution: "first_hit",
  closeRollDteEnabled: false,
  closeRollDte: 21,
};

const DEFAULT_CONDITIONS: ConditionGroup = {
  logic: "all",
  conditions: [],
};

const SIZING_STRATEGIES = [
  { value: "contracts", label: "Contracts" },
  { value: "dollars", label: "Dollars" },
  { value: "nav_pct", label: "% of NAV" },
];

const FILL_MODELS = [
  { value: "mid", label: "Mid-Price (Theoretical)" },
  { value: "natural", label: "Natural (Bid/Ask) (Worst Case)" },
  { value: "linear_split", label: "Linear Split (50/50) (Realistic)" },
];

const STRIKE_MODELS = [
  { value: "atm", label: "ATM" },
  { value: "otm", label: "OTM" },
  { value: "itm", label: "ITM" },
  { value: "delta", label: "Delta" },
  { value: "fixed", label: "Fixed" },
  { value: "locked_offset", label: "Locked Offset" },
];

const RESOLUTIONS = [
  { value: "1m", label: "1 Minute" },
  { value: "5m", label: "5 Minute" },
  { value: "daily", label: "Daily" },
];

function createLeg(parentId?: string): OptionLeg {
  return {
    id: `leg-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
    action: "buy",
    right: "call",
    quantity: 1,
    dte: 45,
    strikeModel: "atm",
    strikeValue: 0,
    parentLegId: parentId || null,
    lockedOffset: false,
  };
}

export interface OptionsStationFormHandle {
  getCurrentConfig: () => CompiledStrategy;
}

export const OptionsStationForm = forwardRef<OptionsStationFormHandle, Props>(
  function OptionsStationForm({ projectId, projectName, templateConfig }, ref) {
  const [symbol, setSymbol] = useState("SPY");
  const [startDate, setStartDate] = useState("2024-01-01");
  const [endDate, setEndDate] = useState(new Date().toISOString().slice(0, 10));
  const [initialCapital, setInitialCapital] = useState(50000);
  const [sizingStrategy, setSizingStrategy] = useState<"contracts" | "dollars" | "nav_pct">("contracts");
  const [sizingValue, setSizingValue] = useState(1);
  const [slippageBps, setSlippageBps] = useState(0);
  const [dataResolution, setDataResolution] = useState<"1m" | "5m" | "daily">("daily");
  const [fillModel, setFillModel] = useState<"mid" | "natural" | "linear_split">("mid");
  const [legs, setLegs] = useState<OptionLeg[]>([createLeg()]);
  const [entryConditions, setEntryConditions] = useState<ConditionGroup>(DEFAULT_CONDITIONS);
  const [exitRules, setExitRules] = useState<ExitRules>(DEFAULT_EXIT_RULES);

  useEffect(() => {
    if (sizingStrategy === "contracts") setSizingValue(1);
    else if (sizingStrategy === "dollars") setSizingValue(1000);
    else setSizingValue(10);
  }, [sizingStrategy]);

  useEffect(() => {
    if (templateConfig) {
      setSymbol(templateConfig.global.symbol);
      setStartDate(templateConfig.global.dateRange.start);
      setEndDate(templateConfig.global.dateRange.end);
      setInitialCapital(templateConfig.global.initialCapital);
      setSizingStrategy(templateConfig.global.sizing.strategy);
      setSizingValue(templateConfig.global.sizing.value);
      setSlippageBps(templateConfig.global.slippageBps);
      setDataResolution(templateConfig.global.dataResolution);
      setFillModel(templateConfig.global.fillModel || "mid");
      setLegs(templateConfig.legs.map(l => ({ ...l })));
      setEntryConditions({ ...templateConfig.entryConditions });
      setExitRules({
        ...templateConfig.exitRules,
        closeRollDteEnabled: templateConfig.exitRules.closeRollDteEnabled ?? false,
        closeRollDte: templateConfig.exitRules.closeRollDte ?? 21,
      });
    }
  }, [templateConfig]);

  const updateLeg = useCallback((idx: number, field: keyof OptionLeg, value: any) => {
    setLegs(prev => prev.map((l, i) => {
      if (i !== idx) return l;
      const updated = { ...l, [field]: value };
      if (field === "lockedOffset" && value === true) {
        updated.strikeModel = "locked_offset";
        updated.strikeValue = 0;
      }
      if (field === "lockedOffset" && value === false && l.strikeModel === "locked_offset") {
        updated.strikeModel = "fixed";
      }
      return updated;
    }));
  }, []);

  const addLeg = useCallback(() => {
    setLegs(prev => [...prev, createLeg()]);
  }, []);

  const removeLeg = useCallback((idx: number) => {
    const removeId = legs[idx].id;
    setLegs(prev =>
      prev
        .filter((_, i) => i !== idx)
        .map(l => l.parentLegId === removeId ? { ...l, parentLegId: null, lockedOffset: false, strikeModel: "atm" as const } : l)
    );
  }, [legs]);

  const siblingLegs = (currentIdx: number) =>
    legs.filter((_, i) => i !== currentIdx);

  useImperativeHandle(ref, () => ({
    getCurrentConfig: () => ({
      projectId,
      projectName,
      global: {
        symbol,
        dateRange: { start: startDate, end: endDate },
        initialCapital,
        sizing: { strategy: sizingStrategy, value: sizingValue },
        slippageBps,
        dataResolution,
        fillModel,
      },
      legs,
      entryConditions,
      exitRules,
    }),
  }));

  return (
    <div className="space-y-4">
      {/* ── Global Environment ── */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-lg font-semibold tracking-tight text-foreground">Global Environment</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-1">
              <Label className="text-xs font-medium text-muted-foreground">Symbol</Label>
              <Input value={symbol} onChange={e => setSymbol(e.target.value.toUpperCase())} className="h-8 text-xs" />
            </div>
            <div className="space-y-1">
              <Label className="text-xs font-medium text-muted-foreground">Data Resolution</Label>
              <Select value={dataResolution} onValueChange={(v: any) => setDataResolution(v)}>
                <SelectTrigger className="h-8 text-xs">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {RESOLUTIONS.map(r => (
                    <SelectItem key={r.value} value={r.value}>{r.label}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1">
              <Label className="text-xs font-medium text-muted-foreground">Start Date</Label>
              <Input type="date" value={startDate} onChange={e => setStartDate(e.target.value)} className="h-8 text-xs" />
            </div>
            <div className="space-y-1">
              <Label className="text-xs font-medium text-muted-foreground">End Date</Label>
              <Input type="date" value={endDate} onChange={e => setEndDate(e.target.value)} className="h-8 text-xs" />
            </div>
            <div className="space-y-1">
              <Label className="text-xs font-medium text-muted-foreground">Initial Capital</Label>
              <Input type="number" value={initialCapital} onChange={e => setInitialCapital(Number(e.target.value))} className="h-8 text-xs" />
            </div>
            <div className="space-y-1">
              <Label className="text-xs font-medium text-muted-foreground">Slippage (bps)</Label>
              <Input type="number" value={slippageBps} onChange={e => setSlippageBps(Number(e.target.value))} className="h-8 text-xs" />
            </div>
            <div className="space-y-1">
              <Label className="text-xs font-medium text-muted-foreground">Execution Fill Model</Label>
              <Select value={fillModel} onValueChange={(v: any) => setFillModel(v)}>
                <SelectTrigger className="h-8 text-xs">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {FILL_MODELS.map(f => (
                    <SelectItem key={f.value} value={f.value}>{f.label}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1">
              <Label className="text-xs font-medium text-muted-foreground">Sizing Strategy</Label>
              <Select value={sizingStrategy} onValueChange={(v: any) => setSizingStrategy(v)}>
                <SelectTrigger className="h-8 text-xs">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {SIZING_STRATEGIES.map(s => (
                    <SelectItem key={s.value} value={s.value}>{s.label}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1">
              <Label className="text-xs font-medium text-muted-foreground">Sizing Value</Label>
              <Input type="number" value={sizingValue} onChange={e => setSizingValue(Number(e.target.value))} className="h-8 text-xs" />
            </div>
          </div>
        </CardContent>
      </Card>

      {/* ── Multi-Leg Builder ── */}
      <Card>
        <CardHeader className="pb-3">
          <div className="flex items-center justify-between">
            <CardTitle className="text-lg font-semibold tracking-tight text-foreground">Multi-Leg Builder</CardTitle>
            <button
              type="button"
              onClick={addLeg}
              className="inline-flex items-center gap-1 h-7 px-2 text-xs font-medium rounded-md border border-border bg-background hover:bg-muted/50 transition-colors"
            >
              <Plus className="h-3 w-3" /> Add Leg
            </button>
          </div>
        </CardHeader>
        <CardContent className="space-y-3">
          {legs.map((leg, idx) => {
            const siblings = siblingLegs(idx);
            return (
              <div key={leg.id} className="border border-border rounded-md p-3 space-y-3 bg-muted/10">
                <div className="flex items-center justify-between">
                  <span className="text-xs font-medium text-muted-foreground">Leg {idx + 1}</span>
                  <div className="flex items-center gap-0.5">
                    <button
                      type="button"
                      onClick={() => updateLeg(idx, "lockedOffset", !leg.lockedOffset)}
                      className={`p-1 rounded ${leg.lockedOffset ? "text-primary" : "text-muted-foreground"} hover:bg-muted/50 transition-colors`}
                      title={leg.lockedOffset ? "Unlock offset" : "Lock offset to parent"}
                      disabled={!leg.parentLegId}
                    >
                      {leg.lockedOffset ? <Lock className="h-3.5 w-3.5" /> : <Unlock className="h-3.5 w-3.5" />}
                    </button>
                    <button
                      type="button"
                      className="p-1 rounded text-destructive hover:bg-destructive/10 transition-colors"
                      onClick={() => removeLeg(idx)}
                    >
                      <Trash2 className="h-3.5 w-3.5" />
                    </button>
                  </div>
                </div>
                <div className="grid grid-cols-4 gap-3">
                  <div className="space-y-1">
                    <Label className="text-[10px] text-muted-foreground">Action</Label>
                    <Select value={leg.action} onValueChange={(v: "buy" | "sell") => updateLeg(idx, "action", v)}>
                      <SelectTrigger className="h-7 text-xs">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="buy">Buy</SelectItem>
                        <SelectItem value="sell">Sell</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="space-y-1">
                    <Label className="text-[10px] text-muted-foreground">Right</Label>
                    <Select value={leg.right} onValueChange={(v: "call" | "put") => updateLeg(idx, "right", v)}>
                      <SelectTrigger className="h-7 text-xs">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="call">Call</SelectItem>
                        <SelectItem value="put">Put</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="space-y-1">
                    <Label className="text-[10px] text-muted-foreground">Qty</Label>
                    <Input
                      type="number"
                      value={leg.quantity}
                      onChange={e => updateLeg(idx, "quantity", Number(e.target.value))}
                      className="h-7 text-xs"
                    />
                  </div>
                  <div className="space-y-1">
                    <Label className="text-[10px] text-muted-foreground">DTE</Label>
                    <Input
                      type="number"
                      value={leg.dte}
                      onChange={e => updateLeg(idx, "dte", Number(e.target.value))}
                      className="h-7 text-xs"
                    />
                  </div>
                </div>
                <div className="grid grid-cols-4 gap-2">
                  <div className="space-y-1">
                    <Label className="text-[10px] text-muted-foreground">Strike Model</Label>
                    <Select
                      value={leg.strikeModel}
                      onValueChange={(v: OptionLeg["strikeModel"]) => updateLeg(idx, "strikeModel", v)}
                    >
                      <SelectTrigger className="h-7 text-xs">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        {STRIKE_MODELS.filter(m => !(leg.lockedOffset && m.value === "locked_offset") || m.value === "locked_offset").map(m => (
                          <SelectItem key={m.value} value={m.value}>{m.label}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="space-y-1">
                    <Label className="text-[10px] text-muted-foreground">Strike Value</Label>
                    <Input
                      type="number"
                      step={leg.strikeModel === "delta" ? 0.01 : 1}
                      value={leg.strikeValue}
                      onChange={e => updateLeg(idx, "strikeValue", Number(e.target.value))}
                      className="h-7 text-xs"
                      disabled={leg.strikeModel === "atm"}
                    />
                  </div>
                  <div className="space-y-1">
                    <Label className="text-[10px] text-muted-foreground">Parent Leg</Label>
                    <Select
                      value={leg.parentLegId || "none"}
                      onValueChange={(v) => updateLeg(idx, "parentLegId", v === "none" ? null : v)}
                    >
                      <SelectTrigger className="h-7 text-xs">
                        <SelectValue placeholder="None" />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="none">None</SelectItem>
                        {siblings.map(s => (
                          <SelectItem key={s.id} value={s.id}>Leg {legs.indexOf(s) + 1}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="space-y-1">
                    <Label className="text-[10px] text-muted-foreground">Offset</Label>
                    <Input
                      type="number"
                      value={leg.strikeModel === "locked_offset" ? leg.strikeValue : 0}
                      onChange={e => updateLeg(idx, "strikeValue", Number(e.target.value))}
                      className="h-7 text-xs"
                      disabled={!leg.lockedOffset}
                      placeholder={leg.lockedOffset ? "$ from parent" : "Lock first"}
                    />
                  </div>
                </div>
              </div>
            );
          })}
        </CardContent>
      </Card>

      {/* ── Entry Conditions ── */}
      <ConditionTriggerEngine value={entryConditions} onChange={setEntryConditions} />

      {/* ── Exit Rules ── */}
      <ExitRulesPanel value={exitRules} onChange={setExitRules} />

    </div>
  );
});

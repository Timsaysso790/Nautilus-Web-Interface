import { useState, useEffect } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { optionBacktestService, type OptionStrategyDef, type OptionLegRequest } from "@/services/optionBacktestService";

interface Props {
  onRun: (params: any) => void;
  running: boolean;
}

const STRATEGY_META: Record<string, { legs: { label: string; right: string; action: string }[] }> = {
  credit_spread: {
    legs: [
      { label: "Short Put (sold)", right: "put", action: "sell" },
      { label: "Long Put (bought)", right: "put", action: "buy" },
    ],
  },
  debit_spread: {
    legs: [
      { label: "Long Call (bought)", right: "call", action: "buy" },
      { label: "Short Call (sold)", right: "call", action: "sell" },
    ],
  },
  iron_condor: {
    legs: [
      { label: "Short Put", right: "put", action: "sell" },
      { label: "Long Put", right: "put", action: "buy" },
      { label: "Short Call", right: "call", action: "sell" },
      { label: "Long Call", right: "call", action: "buy" },
    ],
  },
  calendar_spread: {
    legs: [
      { label: "Short-dated (sold)", right: "call", action: "sell" },
      { label: "Long-dated (bought)", right: "call", action: "buy" },
    ],
  },
  ratio_spread: {
    legs: [
      { label: "Long (bought)", right: "call", action: "buy" },
      { label: "Short x2 (sold)", right: "call", action: "sell" },
    ],
  },
  straddle: {
    legs: [
      { label: "Long Call", right: "call", action: "buy" },
      { label: "Long Put", right: "put", action: "buy" },
    ],
  },
  strangle: {
    legs: [
      { label: "Long Put (OTM)", right: "put", action: "buy" },
      { label: "Long Call (OTM)", right: "call", action: "buy" },
    ],
  },
  covered_call: {
    legs: [
      { label: "Short Call (sold)", right: "call", action: "sell" },
    ],
  },
  protective_put: {
    legs: [
      { label: "Long Put (bought)", right: "put", action: "buy" },
    ],
  },
};

export function OptionBacktestForm({ onRun, running }: Props) {
  const [strategies, setStrategies] = useState<OptionStrategyDef[]>([]);
  const [strategyType, setStrategyType] = useState("credit_spread");
  const [symbol, setSymbol] = useState("SPY");
  const [entryDte, setEntryDte] = useState(45);
  const [holdUntilDte, setHoldUntilDte] = useState(21);
  const [entryFreq, setEntryFreq] = useState(7);
  const [startDate, setStartDate] = useState("2023-01-01");
  const [endDate, setEndDate] = useState(new Date().toISOString().slice(0, 10));
  const [balance, setBalance] = useState(50000);
  const [commission, setCommission] = useState(0.65);
  const [legs, setLegs] = useState<OptionLegRequest[]>([]);

  useEffect(() => {
    optionBacktestService.listStrategies().then(res => setStrategies(res.strategies)).catch(() => {});
  }, []);

  useEffect(() => {
    if (strategyType) {
      const meta = STRATEGY_META[strategyType];
      if (meta) {
        setLegs(meta.legs.map(l => ({ strike: 0, right: l.right as "call" | "put", quantity: 1, action: l.action as "buy" | "sell" })));
      }
    }
  }, [strategyType]);

  const updateLeg = (idx: number, field: keyof OptionLegRequest, value: number | string) => {
    setLegs(prev => prev.map((l, i) => i === idx ? { ...l, [field]: value } : l));
  };

  const handleRun = () => {
    onRun({
      symbol,
      strategy_type: strategyType,
      legs: legs.map(l => ({ ...l, strike: l.strike || 0 })),
      entry_dte: entryDte,
      hold_until_dte: holdUntilDte,
      entry_frequency_days: entryFreq,
      start_date: startDate,
      end_date: endDate,
      starting_balance: balance,
      commission_per_contract: commission,
      risk_free_rate: 0.05,
    });
  };

  const selectedDef = strategies.find(s => s.id === strategyType);

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">Option Backtest Config</CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="grid grid-cols-2 gap-4">
          <div className="space-y-1">
            <label className="text-xs text-muted-foreground">Symbol</label>
            <Input value={symbol} onChange={e => setSymbol(e.target.value.toUpperCase())} />
          </div>
          <div className="space-y-1">
            <label className="text-xs text-muted-foreground">Strategy</label>
            <Select value={strategyType} onValueChange={setStrategyType}>
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {strategies.map(s => (
                  <SelectItem key={s.id} value={s.id}>{s.label}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </div>

        {selectedDef && (
          <p className="text-xs text-muted-foreground bg-muted/30 rounded p-2">{selectedDef.description}</p>
        )}

        <div className="grid grid-cols-3 gap-4">
          <div className="space-y-1">
            <label className="text-xs text-muted-foreground">Entry DTE</label>
            <Input type="number" value={entryDte} onChange={e => setEntryDte(Number(e.target.value))} />
          </div>
          <div className="space-y-1">
            <label className="text-xs text-muted-foreground">Exit DTE</label>
            <Input type="number" value={holdUntilDte} onChange={e => setHoldUntilDte(Number(e.target.value))} />
          </div>
          <div className="space-y-1">
            <label className="text-xs text-muted-foreground">Frequency (days)</label>
            <Input type="number" value={entryFreq} onChange={e => setEntryFreq(Number(e.target.value))} />
          </div>
        </div>

        <div className="grid grid-cols-2 gap-4">
          <div className="space-y-1">
            <label className="text-xs text-muted-foreground">Start</label>
            <Input type="date" value={startDate} onChange={e => setStartDate(e.target.value)} />
          </div>
          <div className="space-y-1">
            <label className="text-xs text-muted-foreground">End</label>
            <Input type="date" value={endDate} onChange={e => setEndDate(e.target.value)} />
          </div>
        </div>

        <div className="grid grid-cols-2 gap-4">
          <div className="space-y-1">
            <label className="text-xs text-muted-foreground">Starting Balance</label>
            <Input type="number" value={balance} onChange={e => setBalance(Number(e.target.value))} />
          </div>
          <div className="space-y-1">
            <label className="text-xs text-muted-foreground">Commission/contract</label>
            <Input type="number" step={0.01} value={commission} onChange={e => setCommission(Number(e.target.value))} />
          </div>
        </div>

        {legs.length > 0 && (
          <div className="space-y-2">
            <p className="text-xs font-medium text-muted-foreground">Leg Strikes (0 = auto ATM)</p>
            {legs.map((leg, i) => (
              <div key={i} className="flex items-center gap-2 text-sm">
                <span className="w-32 text-muted-foreground">{STRATEGY_META[strategyType]?.legs[i]?.label || `${leg.action} ${leg.right}`}</span>
                <Input
                  type="number"
                  step={1}
                  value={leg.strike || ""}
                  onChange={e => updateLeg(i, "strike", Number(e.target.value))}
                  placeholder="Auto"
                  className="w-24"
                />
                <span className="text-muted-foreground">x</span>
                <Input
                  type="number"
                  value={leg.quantity}
                  onChange={e => updateLeg(i, "quantity", Number(e.target.value))}
                  className="w-16"
                />
              </div>
            ))}
          </div>
        )}

        <Button onClick={handleRun} disabled={running} className="w-full">
          {running ? "Running..." : "Run Backtest"}
        </Button>
      </CardContent>
    </Card>
  );
}

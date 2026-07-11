import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Plus, Trash2 } from "lucide-react";
import type { Condition, ConditionGroup } from "../types";

interface Props {
  value: ConditionGroup;
  onChange: (group: ConditionGroup) => void;
}

const SOURCES = [
  { value: "underlying_price", label: "Underlying Price" },
  { value: "days_to_expiry", label: "Days to Expiry" },
  { value: "iv", label: "IV" },
  { value: "theta", label: "Theta" },
  { value: "delta", label: "Delta" },
  { value: "rsi", label: "RSI" },
  { value: "sma", label: "SMA" },
  { value: "bb_position", label: "BB Position" },
];

const OPERATORS = [
  { value: "gt", label: ">" },
  { value: "gte", label: "\u2265" },
  { value: "lt", label: "<" },
  { value: "lte", label: "\u2264" },
  { value: "eq", label: "=" },
  { value: "crosses_above", label: "Crosses Above" },
  { value: "crosses_below", label: "Crosses Below" },
];

export function ConditionTriggerEngine({ value, onChange }: Props) {
  const addCondition = () => {
    const newCondition: Condition = {
      id: `cond-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
      source: "underlying_price",
      operator: "gt",
      target: { type: "value", value: 0 },
    };
    onChange({
      ...value,
      conditions: [...value.conditions, newCondition],
    });
  };

  const removeCondition = (id: string) => {
    onChange({
      ...value,
      conditions: value.conditions.filter(c => c.id !== id),
    });
  };

  const updateCondition = (id: string, field: string, val: any) => {
    onChange({
      ...value,
      conditions: value.conditions.map(c =>
        c.id === id ? { ...c, [field]: val } : c
      ),
    });
  };

  const updateTarget = (id: string, field: string, val: any) => {
    onChange({
      ...value,
      conditions: value.conditions.map(c =>
        c.id === id ? { ...c, target: { ...c.target, [field]: val } } : c
      ),
    });
  };

  return (
    <Card>
      <CardHeader className="pb-3">
        <div className="flex items-center justify-between">
          <CardTitle className="text-base">Condition Trigger Engine</CardTitle>
          <Select
            value={value.logic}
            onValueChange={(v) => onChange({ ...value, logic: v as "all" | "any" })}
          >
            <SelectTrigger className="w-20 h-7 text-xs">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">ALL</SelectItem>
              <SelectItem value="any">ANY</SelectItem>
            </SelectContent>
          </Select>
        </div>
        <p className="text-xs text-muted-foreground">
          {value.logic === "all" ? "All conditions must be true" : "Any condition can be true"}
        </p>
      </CardHeader>
      <CardContent className="space-y-3">
        {value.conditions.length === 0 && (
          <div className="text-center py-4 text-sm text-muted-foreground">
            No entry conditions — position opens immediately on bar 1.
          </div>
        )}
        {value.conditions.map((cond, idx) => (
          <div key={cond.id} className="flex items-center gap-2 text-sm bg-muted/20 rounded p-2">
            <span className="text-xs text-muted-foreground w-5">{idx + 1}.</span>
            <Select
              value={cond.source}
              onValueChange={(v) => updateCondition(cond.id, "source", v)}
            >
              <SelectTrigger className="w-36 h-7 text-xs">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {SOURCES.map(s => (
                  <SelectItem key={s.value} value={s.value}>{s.label}</SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Select
              value={cond.operator}
              onValueChange={(v) => updateCondition(cond.id, "operator", v)}
            >
              <SelectTrigger className="w-28 h-7 text-xs">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {OPERATORS.map(o => (
                  <SelectItem key={o.value} value={o.value}>{o.label}</SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Select
              value={cond.target.type}
              onValueChange={(v) => updateTarget(cond.id, "type", v)}
            >
              <SelectTrigger className="w-20 h-7 text-xs">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="value">Value</SelectItem>
                <SelectItem value="indicator">Indicator</SelectItem>
              </SelectContent>
            </Select>
            {cond.target.type === "indicator" ? (
              <Input
                value={cond.target.indicator || ""}
                onChange={e => updateTarget(cond.id, "indicator", e.target.value)}
                placeholder="SMA(20)"
                className="w-24 h-7 text-xs"
              />
            ) : (
              <Input
                type="number"
                value={cond.target.value}
                onChange={e => updateTarget(cond.id, "value", Number(e.target.value))}
                className="w-20 h-7 text-xs"
              />
            )}
            <Button
              variant="ghost"
              size="sm"
              className="h-7 w-7 p-0 text-destructive"
              onClick={() => removeCondition(cond.id)}
            >
              <Trash2 className="h-3.5 w-3.5" />
            </Button>
          </div>
        ))}
        <Button variant="outline" size="sm" onClick={addCondition} className="w-full text-xs">
          <Plus className="h-3.5 w-3.5 mr-1" /> Add Condition
        </Button>
      </CardContent>
    </Card>
  );
}

import { useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import type { ExitRules } from "../types";

interface Props {
  value: ExitRules;
  onChange: (rules: ExitRules) => void;
}

interface ToggleFieldProps {
  label: string;
  value: number | null;
  unit?: string;
  checked: boolean;
  onCheckedChange: (checked: boolean) => void;
  onValueChange: (v: number | null) => void;
}

function ToggleField({ label, value, unit, checked, onCheckedChange, onValueChange }: ToggleFieldProps) {
  return (
    <div className="flex flex-col gap-1.5">
      <label className="flex items-center gap-2 text-sm cursor-pointer">
        <input
          type="checkbox"
          checked={checked}
          onChange={e => {
            onCheckedChange(e.target.checked);
            if (!e.target.checked) onValueChange(null);
          }}
          className="rounded border-border"
        />
        <span className="text-foreground">{label}</span>
      </label>
      {checked && (
        <div className="flex items-center gap-1.5 pl-6">
          <Input
            type="number"
            value={value ?? ""}
            onChange={e => onValueChange(Number(e.target.value))}
            className="w-20 h-7 text-xs"
            placeholder="0"
          />
          {unit && <span className="text-xs text-muted-foreground">{unit}</span>}
        </div>
      )}
    </div>
  );
}

export function ExitRulesPanel({ value, onChange }: Props) {
  return (
    <Card>
      <CardHeader className="pb-3">
        <CardTitle className="text-lg font-semibold tracking-tight text-foreground">Exit Rules</CardTitle>
        <p className="text-xs text-muted-foreground">Configure when to exit a position</p>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="grid grid-cols-2 gap-4">
          <ToggleField
            label="Profit Target"
            value={value.profitTargetPct}
            unit="%"
            checked={value.profitTargetPct !== null}
            onCheckedChange={(checked) => onChange({ ...value, profitTargetPct: checked ? 20 : null })}
            onValueChange={(v) => onChange({ ...value, profitTargetPct: v })}
          />
          <ToggleField
            label="Stop Loss"
            value={value.stopLossPct}
            unit="%"
            checked={value.stopLossPct !== null}
            onCheckedChange={(checked) => onChange({ ...value, stopLossPct: checked ? 20 : null })}
            onValueChange={(v) => onChange({ ...value, stopLossPct: v })}
          />
          <div>
            <ToggleField
              label="Trailing Stop"
              value={value.trailingStopPct}
              unit="%"
              checked={value.trailingStopPct !== null}
              onCheckedChange={(checked) => onChange({ ...value, trailingStopPct: checked ? 10 : null })}
              onValueChange={(v) => onChange({ ...value, trailingStopPct: v })}
            />
            {value.trailingStopPct !== null && (
              <div className="flex items-center gap-1.5 pl-6 mt-1">
                <span className="text-xs text-muted-foreground min-w-24">Activation threshold</span>
                <Input
                  type="number"
                  value={value.trailingStopActivationPct}
                  onChange={e => onChange({ ...value, trailingStopActivationPct: Number(e.target.value) })}
                  className="w-20 h-7 text-xs"
                />
                <span className="text-xs text-muted-foreground">%</span>
              </div>
            )}
          </div>
          <ToggleField
            label="Early Exit DTE"
            value={value.earlyExitDte}
            unit="days"
            checked={value.earlyExitDte !== null}
            onCheckedChange={(checked) => onChange({ ...value, earlyExitDte: checked ? 5 : null })}
            onValueChange={(v) => onChange({ ...value, earlyExitDte: v })}
          />
        </div>

        <div className="flex items-center gap-3">
          <span className="text-sm text-foreground min-w-28">Intraday Cutoff</span>
          <Input
            type="time"
            value={value.intradayCutoff}
            onChange={e => onChange({ ...value, intradayCutoff: e.target.value })}
            className="w-28 h-7 text-xs"
          />
          <span className="text-xs text-muted-foreground">ET (24h)</span>
        </div>
        <div className="flex items-center gap-3">
          <span className="text-sm text-foreground min-w-28">Conflict Resolution</span>
          <Select
            value={value.conflictResolution}
            onValueChange={(v: "first_hit" | "best" | "worst") => onChange({ ...value, conflictResolution: v })}
          >
            <SelectTrigger className="w-28 h-7 text-xs">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="first_hit">First Hit</SelectItem>
              <SelectItem value="best">Best</SelectItem>
              <SelectItem value="worst">Worst</SelectItem>
            </SelectContent>
          </Select>
        </div>

        <div className="border-t border-border pt-4">
          <h3 className="text-sm font-semibold text-foreground mb-3">Management / Rolling Rules</h3>
          <div className="flex flex-col gap-1.5">
            <label className="flex items-center gap-2 text-sm cursor-pointer">
              <input
                type="checkbox"
                checked={value.closeRollDteEnabled}
                onChange={e => onChange({ ...value, closeRollDteEnabled: e.target.checked })}
                className="rounded border-border"
              />
              <span className="text-foreground">Early DTE Management</span>
            </label>
            {value.closeRollDteEnabled && (
              <div className="flex items-center gap-1.5 pl-6">
                <span className="text-xs text-muted-foreground">Close/Roll at</span>
                <Input
                  type="number"
                  value={value.closeRollDte}
                  onChange={e => onChange({ ...value, closeRollDte: Number(e.target.value) })}
                  className="w-20 h-7 text-xs"
                  placeholder="21"
                />
                <span className="text-xs text-muted-foreground">DTE</span>
              </div>
            )}
          </div>
        </div>
      </CardContent>
    </Card>
  );
}

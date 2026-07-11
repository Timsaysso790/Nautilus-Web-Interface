import { useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { ShieldAlert, ArrowUpDown, Zap } from "lucide-react";
import type { VixHedgeConfig, VixRatioBackspreadLeg, SpikeHarvestTrigger } from "../types";

interface Props {
  value: VixHedgeConfig;
  onChange: (v: VixHedgeConfig) => void;
}

function createLeg(): VixRatioBackspreadLeg {
  return { dte: 45, action: "sell", right: "put", quantity: 1, strikeModel: "atm" };
}

export function VixHedgePanel({ value, onChange }: Props) {
  const updateLadder = (
    ladderKey: "ladder45dte" | "ladder90dte",
    legs: VixRatioBackspreadLeg[],
  ) => onChange({ ...value, [ladderKey]: legs });

  const addLeg = (ladderKey: "ladder45dte" | "ladder90dte") => {
    onChange({ ...value, [ladderKey]: [...value[ladderKey], createLeg()] });
  };

  const updateLeg = (
    ladderKey: "ladder45dte" | "ladder90dte",
    idx: number,
    field: keyof VixRatioBackspreadLeg,
    val: any,
  ) => {
    const legs = [...value[ladderKey]];
    legs[idx] = { ...legs[idx], [field]: val };
    updateLadder(ladderKey, legs);
  };

  const removeLeg = (ladderKey: "ladder45dte" | "ladder90dte", idx: number) => {
    updateLadder(ladderKey, value[ladderKey].filter((_, i) => i !== idx));
  };

  return (
    <Card>
      <CardHeader className="pb-3">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <ShieldAlert className="h-4 w-4 text-muted-foreground" />
            <CardTitle className="text-base">VIX Hedge</CardTitle>
            <Badge variant={value.enabled ? "default" : "secondary"} className="text-[10px] h-5">
              {value.enabled ? "Active" : "Off"}
            </Badge>
          </div>
          <Switch checked={value.enabled} onCheckedChange={v => onChange({ ...value, enabled: v })} />
        </div>
      </CardHeader>
      <CardContent className="space-y-4">
        {!value.enabled && (
          <p className="text-xs text-muted-foreground text-center py-2">VIX hedge disabled.</p>
        )}
        {value.enabled && (
          <>
            {/* 45 DTE Ladder */}
            <LadderCard
              title="45 DTE Ladder"
              legs={value.ladder45dte}
              onAdd={() => addLeg("ladder45dte")}
              onUpdate={(i, f, v) => updateLeg("ladder45dte", i, f, v)}
              onRemove={i => removeLeg("ladder45dte", i)}
            />

            {/* 90 DTE Ladder */}
            <LadderCard
              title="90 DTE Ladder"
              legs={value.ladder90dte}
              onAdd={() => addLeg("ladder90dte")}
              onUpdate={(i, f, v) => updateLeg("ladder90dte", i, f, v)}
              onRemove={i => removeLeg("ladder90dte", i)}
            />

            {/* Roll Thresholds */}
            <div className="border border-border rounded-md p-3 bg-muted/10 space-y-2">
              <div className="flex items-center gap-2">
                <ArrowUpDown className="h-4 w-4 text-muted-foreground" />
                <span className="text-xs font-medium text-muted-foreground">Roll Settings</span>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1">
                  <Label className="text-[10px] text-muted-foreground">Systematic Roll (DTE)</Label>
                  <Input
                    type="number"
                    value={value.systematicRollThreshold}
                    onChange={e => onChange({ ...value, systematicRollThreshold: Number(e.target.value) })}
                    className="h-7 text-xs"
                  />
                </div>
                <div className="space-y-1">
                  <Label className="text-[10px] text-muted-foreground">Opp. Roll VIX Min</Label>
                  <Input
                    type="number"
                    step={0.5}
                    value={value.opportunisticRollVixMin}
                    onChange={e => onChange({ ...value, opportunisticRollVixMin: Number(e.target.value) })}
                    className="h-7 text-xs"
                  />
                </div>
              </div>
            </div>

            {/* Spike Harvest */}
            <SpikeHarvestCard
              value={value.spikeHarvest}
              onChange={sh => onChange({ ...value, spikeHarvest: sh })}
            />
          </>
        )}
      </CardContent>
    </Card>
  );
}

function LadderCard({
  title, legs, onAdd, onUpdate, onRemove,
}: {
  title: string;
  legs: VixRatioBackspreadLeg[];
  onAdd: () => void;
  onUpdate: (idx: number, field: keyof VixRatioBackspreadLeg, val: any) => void;
  onRemove: (idx: number) => void;
}) {
  return (
    <div className="border border-border rounded-md p-3 space-y-2 bg-muted/10">
      <div className="flex items-center justify-between">
        <span className="text-xs font-medium text-muted-foreground">{title}</span>
        <Button variant="outline" size="sm" className="h-5 text-[10px] gap-1" onClick={onAdd}>
          + Leg
        </Button>
      </div>
      {legs.map((leg, idx) => (
        <div key={idx} className="grid grid-cols-5 gap-1 items-end">
          <div className="space-y-1">
            <Label className="text-[9px] text-muted-foreground">Act</Label>
            <Select value={leg.action} onValueChange={(v: any) => onUpdate(idx, "action", v)}>
              <SelectTrigger className="h-6 text-[10px]">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="buy">Buy</SelectItem>
                <SelectItem value="sell">Sell</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1">
            <Label className="text-[9px] text-muted-foreground">R</Label>
            <Select value={leg.right} onValueChange={(v: any) => onUpdate(idx, "right", v)}>
              <SelectTrigger className="h-6 text-[10px]">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="call">C</SelectItem>
                <SelectItem value="put">P</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1">
            <Label className="text-[9px] text-muted-foreground">Qty</Label>
            <Input type="number" value={leg.quantity} onChange={e => onUpdate(idx, "quantity", Number(e.target.value))} className="h-6 text-[10px]" />
          </div>
          <div className="space-y-1">
            <Label className="text-[9px] text-muted-foreground">Strike</Label>
            <Select value={leg.strikeModel} onValueChange={(v: any) => onUpdate(idx, "strikeModel", v)}>
              <SelectTrigger className="h-6 text-[10px]">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="atm">ATM</SelectItem>
                <SelectItem value="otm">OTM</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <Button variant="ghost" size="sm" className="h-6 w-6 p-0 text-destructive" onClick={() => onRemove(idx)}>
            ✕
          </Button>
        </div>
      ))}
    </div>
  );
}

function SpikeHarvestCard({
  value, onChange,
}: {
  value: SpikeHarvestTrigger;
  onChange: (v: SpikeHarvestTrigger) => void;
}) {
  return (
    <div className="border border-border rounded-md p-3 bg-muted/10 space-y-2">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Zap className="h-4 w-4 text-muted-foreground" />
          <span className="text-xs font-medium text-muted-foreground">Spike Harvest</span>
        </div>
        <Switch checked={value.enabled} onCheckedChange={v => onChange({ ...value, enabled: v })} />
      </div>
      {value.enabled && (
        <div className="grid grid-cols-3 gap-2">
          <div className="space-y-1">
            <Label className="text-[10px] text-muted-foreground">VIX × Multiplier</Label>
            <Input
              type="number"
              step={0.5}
              value={value.vixSpikeMultiplier}
              onChange={e => onChange({ ...value, vixSpikeMultiplier: Number(e.target.value) })}
              className="h-7 text-xs"
            />
          </div>
          <div className="space-y-1">
            <Label className="text-[10px] text-muted-foreground">VIX MA Period</Label>
            <Input
              type="number"
              value={value.vixMaPeriod}
              onChange={e => onChange({ ...value, vixMaPeriod: Number(e.target.value) })}
              className="h-7 text-xs"
            />
          </div>
          <div className="space-y-1">
            <Label className="text-[10px] text-muted-foreground">Re-entry VIX ≤</Label>
            <Input
              type="number"
              step={0.5}
              value={value.reentryVixThreshold}
              onChange={e => onChange({ ...value, reentryVixThreshold: Number(e.target.value) })}
              className="h-7 text-xs"
            />
          </div>
        </div>
      )}
    </div>
  );
}

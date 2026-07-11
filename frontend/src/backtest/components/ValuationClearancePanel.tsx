import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Slider } from "@/components/ui/slider";
import { Badge } from "@/components/ui/badge";
import { Activity, TrendingDown } from "lucide-react";
import type { ValuationClearanceConfig } from "../types";

interface Props {
  value: ValuationClearanceConfig;
  onChange: (v: ValuationClearanceConfig) => void;
}

export function ValuationClearancePanel({ value, onChange }: Props) {
  return (
    <Card>
      <CardHeader className="pb-3">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Activity className="h-4 w-4 text-muted-foreground" />
            <CardTitle className="text-base">Valuation Clearance</CardTitle>
            <Badge variant={value.enabled ? "default" : "secondary"} className="text-[10px] h-5">
              {value.enabled ? "Enabled" : "Disabled"}
            </Badge>
          </div>
          <Switch checked={value.enabled} onCheckedChange={v => onChange({ ...value, enabled: v })} />
        </div>
      </CardHeader>
      <CardContent className="space-y-4">
        {!value.enabled && (
          <p className="text-xs text-muted-foreground text-center py-2">Clearance system disabled.</p>
        )}
        {value.enabled && (
          <>
            {/* RSI Threshold */}
            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <Label className="text-xs text-muted-foreground">RSI Threshold</Label>
                <span className="text-xs font-mono">{value.rsiThreshold}</span>
              </div>
              <Slider
                value={[value.rsiThreshold]}
                onValueChange={([v]) => onChange({ ...value, rsiThreshold: v })}
                min={20}
                max={60}
                step={1}
              />
              <p className="text-[10px] text-muted-foreground">
                Triggers clearance when QQQ or IWM RSI ≤ threshold
              </p>
            </div>

            {/* BB Period */}
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1">
                <Label className="text-xs text-muted-foreground">BB Period</Label>
                <Input
                  type="number"
                  value={value.bbPeriod}
                  onChange={e => onChange({ ...value, bbPeriod: Number(e.target.value) })}
                  className="h-7 text-xs"
                />
              </div>
              <div className="space-y-1">
                <Label className="text-xs text-muted-foreground">BB Std Dev</Label>
                <Input
                  type="number"
                  step={0.1}
                  value={value.bbStdDev}
                  onChange={e => onChange({ ...value, bbStdDev: Number(e.target.value) })}
                  className="h-7 text-xs"
                />
              </div>
            </div>

            {/* Time-Machine */}
            <div className="border border-border rounded-md p-3 bg-muted/10 space-y-2">
              <div className="flex items-center gap-2">
                <TrendingDown className="h-4 w-4 text-muted-foreground" />
                <span className="text-xs font-medium text-muted-foreground">Time-Machine Forward Load</span>
              </div>
              <div className="space-y-1">
                <Label className="text-[10px] text-muted-foreground">Forward Look (months)</Label>
                <Input
                  type="number"
                  min={1}
                  max={12}
                  value={value.frontLoadMonths}
                  onChange={e => onChange({ ...value, frontLoadMonths: Number(e.target.value) })}
                  className="h-7 text-xs"
                />
              </div>
              <p className="text-[10px] text-muted-foreground">
                Buys assets at NAV trough using 3-month forward purchasing power
              </p>
            </div>
          </>
        )}
      </CardContent>
    </Card>
  );
}

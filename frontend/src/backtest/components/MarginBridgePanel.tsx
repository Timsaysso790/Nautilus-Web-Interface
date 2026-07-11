import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Slider } from "@/components/ui/slider";
import { Progress } from "@/components/ui/progress";
import { Badge } from "@/components/ui/badge";
import { Banknote, Snowflake, Gauge } from "lucide-react";
import type { MarginBridgeConfig, MarginState } from "../types";

interface Props {
  value: MarginBridgeConfig;
  onChange: (v: MarginBridgeConfig) => void;
  liveState?: MarginState | null;
}

export function MarginBridgePanel({ value, onChange, liveState }: Props) {
  const utilPct = liveState ? liveState.utilization : 0;

  return (
    <Card>
      <CardHeader className="pb-3">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Banknote className="h-4 w-4 text-muted-foreground" />
            <CardTitle className="text-base">Elastic Margin Bridge</CardTitle>
            <Badge variant={value.enabled ? "default" : "secondary"} className="text-[10px] h-5">
              {value.enabled ? "Enabled" : "Disabled"}
            </Badge>
          </div>
          <Switch checked={value.enabled} onCheckedChange={v => onChange({ ...value, enabled: v })} />
        </div>
      </CardHeader>
      <CardContent className="space-y-4">
        {!value.enabled && (
          <p className="text-xs text-muted-foreground text-center py-2">Margin bridge disabled.</p>
        )}
        {value.enabled && (
          <>
            {/* Utilization Gauge */}
            <div className="border border-border rounded-md p-3 bg-muted/10 space-y-2">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <Gauge className="h-4 w-4 text-muted-foreground" />
                  <span className="text-xs font-medium text-muted-foreground">Utilization</span>
                </div>
                {liveState?.isFrozen && (
                  <Badge variant="destructive" className="text-[10px] h-5 gap-1">
                    <Snowflake className="h-3 w-3" /> FROZEN
                  </Badge>
                )}
              </div>
              <Progress
                value={Math.min(utilPct * (liveState ? 1 : 0), 100)}
                className={`h-3 ${utilPct > (liveState ? value.debtGovernorPct : 20) ? "bg-destructive/20" : ""}`}
              />
              <div className="flex justify-between text-[10px] text-muted-foreground">
                <span>{utilPct.toFixed(1)}% utilized</span>
                <span>Governor: {value.debtGovernorPct}%</span>
              </div>
            </div>

            {/* Leverage Config */}
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1">
                <Label className="text-xs text-muted-foreground">Max Leverage</Label>
                <Input
                  type="number"
                  step={0.1}
                  value={value.maxLeverage}
                  onChange={e => onChange({ ...value, maxLeverage: Number(e.target.value) })}
                  className="h-7 text-xs"
                />
              </div>
              <div className="space-y-1">
                <Label className="text-xs text-muted-foreground">Maintenance Rate</Label>
                <Input
                  type="number"
                  step={0.01}
                  value={value.maintenanceRate}
                  onChange={e => onChange({ ...value, maintenanceRate: Number(e.target.value) })}
                  className="h-7 text-xs"
                />
              </div>
              <div className="space-y-1">
                <Label className="text-xs text-muted-foreground">Borrow Rate (APR)</Label>
                <Input
                  type="number"
                  step={0.001}
                  value={value.borrowRate}
                  onChange={e => onChange({ ...value, borrowRate: Number(e.target.value) })}
                  className="h-7 text-xs"
                />
              </div>
              <div className="space-y-1">
                <Label className="text-xs text-muted-foreground">Freeze Days</Label>
                <Input
                  type="number"
                  value={value.freezeDays}
                  onChange={e => onChange({ ...value, freezeDays: Number(e.target.value) })}
                  className="h-7 text-xs"
                />
              </div>
            </div>

            {/* Debt Governor */}
            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <Label className="text-xs text-muted-foreground">Debt Governor</Label>
                <span className="text-xs font-mono">{value.debtGovernorPct}%</span>
              </div>
              <Slider
                value={[value.debtGovernorPct]}
                onValueChange={([v]) => onChange({ ...value, debtGovernorPct: v })}
                min={5}
                max={50}
                step={1}
              />
              <p className="text-[10px] text-muted-foreground">
                Margin debt never exceeds this % of total assets
              </p>
            </div>
          </>
        )}
      </CardContent>
    </Card>
  );
}

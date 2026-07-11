import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { ScrollArea } from "@/components/ui/scroll-area";
import type { PortfolioConfig } from "../types";

interface Props {
  config: PortfolioConfig;
}

export function PortfolioContextCard({ config }: Props) {
  const assetCount = config.assets.length;
  const totalAlloc = config.assets.reduce((s, a) => s + a.allocation, 0);
  const activeSystems = [];

  if (config.cashSchedule.enabled) activeSystems.push("Cash Schedule");
  if (config.clearanceConfig.enabled) activeSystems.push("Valuation Clearance");
  if (config.marginConfig.enabled) activeSystems.push("Margin Bridge");
  if (config.vixConfig.enabled) activeSystems.push("VIX Hedge");

  return (
    <Card>
      <CardHeader className="pb-3">
        <CardTitle className="text-base">Portfolio Context</CardTitle>
      </CardHeader>
      <CardContent className="space-y-3">
        <div className="flex flex-wrap gap-1">
          {activeSystems.map(s => (
            <Badge key={s} variant="secondary" className="text-[10px]">{s}</Badge>
          ))}
          {activeSystems.length === 0 && (
            <span className="text-xs text-muted-foreground">No systems enabled</span>
          )}
        </div>

        <div className="space-y-1 text-xs text-muted-foreground">
          <div className="flex justify-between">
            <span>Assets</span>
            <span className="font-medium text-foreground">{assetCount} tickers</span>
          </div>
          <div className="flex justify-between">
            <span>Allocation</span>
            <span className={`font-medium ${totalAlloc > 100 ? "text-destructive" : "text-foreground"}`}>
              {totalAlloc.toFixed(0)}%
            </span>
          </div>
          <div className="flex justify-between">
            <span>Initial Cash</span>
            <span className="font-medium text-foreground">${config.initialCash.toLocaleString()}</span>
          </div>
          <div className="flex justify-between">
            <span>Date Range</span>
            <span className="font-medium text-foreground">
              {config.startDate} → {config.endDate || "now"}
            </span>
          </div>
          <div className="flex justify-between">
            <span>Paycheck</span>
            <span className="font-medium text-foreground">
              {config.cashSchedule.enabled
                ? `$${config.cashSchedule.paycheckAmount}/${config.cashSchedule.paycheckFrequency}`
                : "Off"}
            </span>
          </div>
          <div className="flex justify-between">
            <span>Debt Governor</span>
            <span className="font-medium text-foreground">
              {config.marginConfig.enabled ? `${config.marginConfig.debtGovernorPct}%` : "Off"}
            </span>
          </div>
        </div>

        <ScrollArea className="h-24">
          <div className="space-y-1">
            {config.assets.filter(a => a.ticker).map(a => (
              <div key={a.ticker} className="flex justify-between text-[10px] text-muted-foreground">
                <span>{a.ticker}</span>
                <span>{a.allocation}% {a.dripEnabled ? "(DRIP)" : ""}</span>
              </div>
            ))}
          </div>
        </ScrollArea>
      </CardContent>
    </Card>
  );
}

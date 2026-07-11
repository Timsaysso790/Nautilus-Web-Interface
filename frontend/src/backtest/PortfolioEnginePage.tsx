import { useState, useCallback, useMemo } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { useNotification } from "@/contexts/NotificationContext";
import { optionBacktestService } from "@/services/optionBacktestService";
import { PortfolioAssetGrid } from "./components/PortfolioAssetGrid";
import { CashSchedulePanel } from "./components/CashSchedulePanel";
import { ValuationClearancePanel } from "./components/ValuationClearancePanel";
import { MarginBridgePanel } from "./components/MarginBridgePanel";
import { VixHedgePanel } from "./components/VixHedgePanel";
import { PortfolioContextCard } from "./components/PortfolioContextCard";
import { ProcessingModal } from "./components/ProcessingModal";
import type {
  PortfolioAsset, CashSchedule, ValuationClearanceConfig, MarginBridgeConfig,
  VixHedgeConfig, PortfolioConfig, PortfolioBacktestResult,
} from "./types";

const DEFAULT_ASSETS: PortfolioAsset[] = [
  { ticker: "QDTE", allocation: 30, dripEnabled: true },
  { ticker: "RDTE", allocation: 30, dripEnabled: true },
  { ticker: "XDTE", allocation: 40, dripEnabled: true },
];

const DEFAULT_CASH_SCHEDULE: CashSchedule = {
  enabled: true,
  paycheckAmount: 1200,
  paycheckFrequency: "monthly",
  lumpSumInjections: [],
};

const DEFAULT_CLEARANCE: ValuationClearanceConfig = {
  enabled: true,
  rsiThreshold: 40,
  bbPeriod: 20,
  bbStdDev: 2.0,
  frontLoadMonths: 3,
};

const DEFAULT_MARGIN: MarginBridgeConfig = {
  enabled: true,
  maxLeverage: 5.0,
  maintenanceRate: 0.25,
  borrowRate: 0.06,
  debtGovernorPct: 20,
  freezeDays: 60,
};

const DEFAULT_VIX: VixHedgeConfig = {
  enabled: false,
  vixTicker: "^VIX",
  ladder45dte: [
    { dte: 45, action: "sell", right: "put", quantity: 1, strikeModel: "atm" },
    { dte: 45, action: "buy", right: "put", quantity: 2, strikeModel: "otm" },
  ],
  ladder90dte: [
    { dte: 90, action: "sell", right: "put", quantity: 1, strikeModel: "atm" },
    { dte: 90, action: "buy", right: "put", quantity: 2, strikeModel: "otm" },
  ],
  systematicRollThreshold: 10,
  opportunisticRollVixMin: 18,
  spikeHarvest: {
    enabled: true,
    vixSpikeMultiplier: 3,
    vixMaPeriod: 20,
    reentryVixThreshold: 20,
  },
};

export default function PortfolioEnginePage() {
  const { success, error: notifyError } = useNotification();
  const [assets, setAssets] = useState<PortfolioAsset[]>(DEFAULT_ASSETS);
  const [cashSchedule, setCashSchedule] = useState<CashSchedule>(DEFAULT_CASH_SCHEDULE);
  const [clearanceConfig, setClearanceConfig] = useState<ValuationClearanceConfig>(DEFAULT_CLEARANCE);
  const [marginConfig, setMarginConfig] = useState<MarginBridgeConfig>(DEFAULT_MARGIN);
  const [vixConfig, setVixConfig] = useState<VixHedgeConfig>(DEFAULT_VIX);
  const [startDate, setStartDate] = useState("2024-01-01");
  const [endDate, setEndDate] = useState(new Date().toISOString().slice(0, 10));
  const [initialCash, setInitialCash] = useState(50000);
  const [running, setRunning] = useState(false);
  const [result, setResult] = useState<PortfolioBacktestResult | null>(null);
  const [modalState, setModalState] = useState<"idle" | "submitting" | "success" | "error">("idle");
  const [modalError, setModalError] = useState("");
  const [jsonPreview, setJsonPreview] = useState("");

  const config: PortfolioConfig = useMemo(() => ({
    assets,
    cashSchedule,
    clearanceConfig,
    marginConfig,
    vixConfig,
    startDate,
    endDate,
    initialCash,
  }), [assets, cashSchedule, clearanceConfig, marginConfig, vixConfig, startDate, endDate, initialCash]);

  const handleRun = useCallback(async () => {
    const tickers = assets.filter(a => a.ticker);
    if (tickers.length === 0) {
      notifyError("Add at least one asset");
      return;
    }
    const totalAlloc = tickers.reduce((s, a) => s + a.allocation, 0);
    if (Math.abs(totalAlloc - 100) > 1) {
      notifyError(`Allocation totals ${totalAlloc}%, must be ~100%`);
      return;
    }

    setJsonPreview(JSON.stringify(config, null, 2));
    setModalState("submitting");
    setRunning(true);

    try {
      const res = await optionBacktestService.runPortfolioBacktest(config);
      setResult(res);
      setModalState("success");
      success(
        `Portfolio backtest complete: ${res.summary.totalReturnPct >= 0 ? "+" : ""}${res.summary.totalReturnPct}% return`
      );
    } catch (e: any) {
      setModalError(e?.detail || "Portfolio backtest failed");
      setModalState("error");
      notifyError(e?.detail || "Portfolio backtest failed");
    } finally {
      setRunning(false);
    }
  }, [config, success, notifyError]);

  const handleModalClose = useCallback(() => {
    setModalState("idle");
    setJsonPreview("");
  }, []);

  return (
    <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
      {/* Left Column: Configuration */}
      <div className="lg:col-span-1 space-y-4">
        {/* Global params */}
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-base">Global Settings</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1">
                <label className="text-xs text-muted-foreground">Start Date</label>
                <Input
                  type="date"
                  value={startDate}
                  onChange={e => setStartDate(e.target.value)}
                  className="h-8 text-xs"
                />
              </div>
              <div className="space-y-1">
                <label className="text-xs text-muted-foreground">End Date</label>
                <Input
                  type="date"
                  value={endDate}
                  onChange={e => setEndDate(e.target.value)}
                  className="h-8 text-xs"
                />
              </div>
            </div>
            <div className="space-y-1">
              <label className="text-xs text-muted-foreground">Initial Cash ($)</label>
              <Input
                type="number"
                value={initialCash}
                onChange={e => setInitialCash(Number(e.target.value))}
                className="h-8 text-xs"
              />
            </div>
          </CardContent>
        </Card>

        <PortfolioAssetGrid assets={assets} onChange={setAssets} />
        <CashSchedulePanel value={cashSchedule} onChange={setCashSchedule} />
        <ValuationClearancePanel value={clearanceConfig} onChange={setClearanceConfig} />
        <MarginBridgePanel value={marginConfig} onChange={setMarginConfig} />
        <VixHedgePanel value={vixConfig} onChange={setVixConfig} />
        <PortfolioContextCard config={config} />

        <Button onClick={handleRun} className="w-full" disabled={running}>
          {running ? "Running..." : "Run Portfolio Backtest"}
        </Button>
      </div>

      {/* Right Column: Results */}
      <div className="lg:col-span-2 space-y-4">
        {!result && !running && (
          <div className="text-center py-16 text-muted-foreground">
            <p className="text-lg">Configure your portfolio and run the backtest.</p>
            <p className="text-sm mt-2">
              Supports 30-40 ticker equity matrix with dividend automation, macro-hedged
              clearance buying, elastic margin with 20% debt governor, and dual-ladder VIX hedge.
            </p>
          </div>
        )}

        {running && (
          <div className="space-y-4">
            <div className="h-32 bg-card border rounded-lg animate-pulse" />
            <div className="h-64 bg-card border rounded-lg animate-pulse" />
          </div>
        )}

        {result && (
          <>
            {/* Summary Card */}
            <Card>
              <CardHeader className="pb-3">
                <CardTitle className="text-base">Portfolio Results</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                  <MetricBox
                    label="Total Return"
                    value={`${result.summary.totalReturnPct >= 0 ? "+" : ""}${result.summary.totalReturnPct}%`}
                    positive={result.summary.totalReturnPct >= 0}
                  />
                  <MetricBox
                    label="Dividends Collected"
                    value={`$${result.summary.totalDividendsCollected.toLocaleString()}`}
                    positive={true}
                  />
                  <MetricBox
                    label="Margin Interest"
                    value={`$${result.summary.totalMarginInterestPaid.toLocaleString()}`}
                    positive={false}
                  />
                  <MetricBox
                    label="Max Utilization"
                    value={`${result.summary.maxUtilization}%`}
                    positive={result.summary.maxUtilization <= 20}
                  />
                  <MetricBox
                    label="Avg Utilization"
                    value={`${result.summary.avgUtilization}%`}
                    positive={result.summary.avgUtilization <= 15}
                  />
                  <MetricBox
                    label="Clearance Events"
                    value={`${result.summary.clearanceEntryCount}`}
                    positive={true}
                  />
                  <MetricBox
                    label="Spike Harvests"
                    value={`${result.summary.spikeHarvestCount}`}
                    positive={result.summary.spikeHarvestCount > 0}
                  />
                  <MetricBox
                    label="Final NAV"
                    value={`$${(result.summary.finalCash + result.summary.finalEquityValue - result.summary.finalDebt).toLocaleString()}`}
                    positive={(result.summary.finalCash + result.summary.finalEquityValue - result.summary.finalDebt) > config.initialCash}
                  />
                </div>
              </CardContent>
            </Card>

            {/* Equity Curve */}
            <Card>
              <CardHeader className="pb-3">
                <CardTitle className="text-base">Equity Curve</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="space-y-1 max-h-80 overflow-y-auto">
                  {result.equityCurve.map((pt, i) => (
                    <div key={i} className="flex justify-between text-[10px] font-mono text-muted-foreground hover:bg-muted/20 px-1 rounded">
                      <span className="w-24">{pt.date}</span>
                      <span className="w-24 text-right">Cash ${pt.cash.toFixed(0)}</span>
                      <span className="w-24 text-right">Equity ${pt.equityValue.toFixed(0)}</span>
                      <span className="w-20 text-right">Debt ${pt.totalDebt.toFixed(0)}</span>
                      <span className="w-20 text-right font-semibold text-foreground">NAV ${pt.nav.toFixed(0)}</span>
                      <Badge variant={pt.clearance === "CLEARANCE_ACTIVE" ? "destructive" : "secondary"} className="text-[8px] h-4">
                        {pt.clearance === "CLEARANCE_ACTIVE" ? "DIP" : "NORM"}
                      </Badge>
                    </div>
                  ))}
                </div>
              </CardContent>
            </Card>

            {/* Positions */}
            {result.positions.length > 0 && (
              <Card>
                <CardHeader className="pb-3">
                  <CardTitle className="text-base">Final Positions</CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="space-y-1">
                    {result.positions.map(p => (
                      <div key={p.ticker} className="flex justify-between text-xs text-muted-foreground">
                        <span className="font-medium text-foreground">{p.ticker}</span>
                        <span>{p.shares.toFixed(2)} shares @ ${p.avgCost}</span>
                      </div>
                    ))}
                  </div>
                </CardContent>
              </Card>
            )}

            {/* Margin History */}
            {result.marginHistory.length > 0 && (
              <Card>
                <CardHeader className="pb-3">
                  <CardTitle className="text-base">Margin History</CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="space-y-1 max-h-40 overflow-y-auto">
                    {result.marginHistory.filter((_, i) => i % Math.max(1, Math.floor(result.marginHistory.length / 30)) === 0).map((m, i) => (
                      <div key={i} className="flex justify-between text-[10px] font-mono text-muted-foreground">
                        <span>{m.date}</span>
                        <span>Util {m.utilization}%</span>
                        <Badge variant={m.isFrozen ? "destructive" : "secondary"} className="text-[8px] h-4">
                          {m.isFrozen ? "FROZEN" : "OK"}
                        </Badge>
                        <span>Debt ${m.debt.toFixed(0)}</span>
                      </div>
                    ))}
                  </div>
                </CardContent>
              </Card>
            )}

            {/* Clearance Events */}
            {result.clearanceEvents.length > 0 && (
              <Card>
                <CardHeader className="pb-3">
                  <CardTitle className="text-base">Clearance Events</CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="space-y-1 max-h-40 overflow-y-auto">
                    {result.clearanceEvents.map((ev, i) => (
                      <div key={i} className="text-[10px] text-muted-foreground border-l-2 border-primary pl-2 py-0.5">
                        <span className="font-medium text-foreground">{ev.date}</span> — <Badge variant="outline" className="text-[8px] h-4">{ev.type}</Badge>
                        <p className="text-[9px] text-muted-foreground mt-0.5">{ev.detail}</p>
                      </div>
                    ))}
                  </div>
                </CardContent>
              </Card>
            )}

            {/* VIX Ladder History */}
            {result.vixLadderHistory.length > 0 && (
              <Card>
                <CardHeader className="pb-3">
                  <CardTitle className="text-base">VIX Ladder History</CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="space-y-1 max-h-40 overflow-y-auto">
                    {result.vixLadderHistory.map((v, i) => (
                      <div key={i} className="flex justify-between text-[10px] font-mono text-muted-foreground">
                        <span>{v.date}</span>
                        <span>{v.ladderDte}DTE</span>
                        <Badge variant={
                          v.status === "HARVESTED" ? "destructive" :
                          v.status === "ROLLED" ? "default" : "secondary"
                        } className="text-[8px] h-4">{v.status}</Badge>
                        <span>PnL ${v.pnl.toFixed(0)}</span>
                      </div>
                    ))}
                  </div>
                </CardContent>
              </Card>
            )}
          </>
        )}
      </div>

      <ProcessingModal
        state={modalState}
        errorMessage={modalError}
        jsonPreview={jsonPreview}
        onClose={handleModalClose}
        onSubmit={() => {}}
      />
    </div>
  );
}

function MetricBox({ label, value, positive }: { label: string; value: string; positive: boolean }) {
  return (
    <div className="border border-border rounded-md p-3 bg-muted/10">
      <p className="text-[10px] text-muted-foreground">{label}</p>
      <p className={`text-sm font-bold ${positive ? "text-green-500" : "text-destructive"}`}>
        {value}
      </p>
    </div>
  );
}

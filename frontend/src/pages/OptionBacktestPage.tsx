import { useState } from "react";
import { Button } from "@/components/ui/button";
import { OptionBacktestForm } from "@/components/OptionBacktestForm";
import { OptionBacktestResults } from "@/components/OptionBacktestResults";
import { useNotification } from "@/contexts/NotificationContext";
import { optionBacktestService, type OptionBacktestResult } from "@/services/optionBacktestService";

export default function OptionBacktestPage() {
  const { success, error: notifyError } = useNotification();
  const [running, setRunning] = useState(false);
  const [result, setResult] = useState<OptionBacktestResult | null>(null);

  const handleRun = async (params: any) => {
    setRunning(true);
    setResult(null);
    try {
      const res = await optionBacktestService.runBacktest(params);
      setResult(res);
      success(`Backtest complete: ${res.summary.total_trades} trades, P&L ${res.summary.total_pnl >= 0 ? "+" : ""}$${res.summary.total_pnl}`);
    } catch (e: any) {
      notifyError(e?.detail || "Backtest failed");
    } finally {
      setRunning(false);
    }
  };

  return (
    <div className="min-h-screen bg-background">
      <header className="bg-card border-b border-border">
        <div className="container mx-auto px-4 py-4">
          <div className="flex items-center justify-between">
            <div>
              <h1 className="text-2xl font-bold text-foreground">Option Strategy Backtest</h1>
              <p className="text-sm text-muted-foreground">Backtest multi-leg option strategies on historical data</p>
            </div>
            <Button variant="outline" onClick={() => window.location.href = '/trader'}>
              Back to Trader
            </Button>
          </div>
        </div>
      </header>

      <main className="container mx-auto px-4 py-8">
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          <div className="lg:col-span-1">
            <OptionBacktestForm onRun={handleRun} running={running} />
          </div>
          <div className="lg:col-span-2">
            {!result && !running && (
              <div className="text-center py-16 text-muted-foreground">
                <p className="text-lg">Configure an option strategy and run the backtest.</p>
                <p className="text-sm mt-2">Supports: credit spreads, iron condors, calendar spreads, ratio spreads, straddles, strangles, covered calls, and protective puts.</p>
              </div>
            )}
            {running && (
              <div className="space-y-4">
                <div className="h-32 bg-card border rounded-lg animate-pulse" />
                <div className="h-64 bg-card border rounded-lg animate-pulse" />
              </div>
            )}
            {result && <OptionBacktestResults result={result} />}
          </div>
        </div>
      </main>
    </div>
  );
}

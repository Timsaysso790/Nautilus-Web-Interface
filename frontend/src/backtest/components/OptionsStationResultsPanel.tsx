import { useMemo } from "react";
import { Button } from "@/components/ui/button";
import { Play, Loader2 } from "lucide-react";
import {
  AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip,
  ResponsiveContainer, ReferenceLine,
} from "recharts";
import type { BacktestResult } from "../types";

interface Props {
  running: boolean;
  result: BacktestResult | null;
  onRun: () => void;
}

function formatCurrency(v: number) {
  const s = v.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  return v >= 0 ? `$${s}` : `-$${Math.abs(v).toLocaleString("en-US", { minimumFractionDigits: 2 })}`;
}

export default function OptionsStationResultsPanel({ running, result, onRun }: Props) {
  const metrics = useMemo(() => {
    if (!result) return null;
    const { summary, equity_curve, trades } = result;

    const winRate = `${summary.win_rate}%`;

    const winningPnL = trades.filter(t => t.pnl > 0).reduce((s, t) => s + t.pnl, 0);
    const losingPnL = Math.abs(trades.filter(t => t.pnl < 0).reduce((s, t) => s + t.pnl, 0));
    const profitFactor = losingPnL > 0
      ? (winningPnL / losingPnL).toFixed(2)
      : winningPnL > 0 ? "∞" : "0.00";

    const totalTrades = String(summary.total_trades);

    let peak = equity_curve[0]?.equity || 0;
    let maxDD = 0;
    for (const pt of equity_curve) {
      if (pt.equity > peak) peak = pt.equity;
      const dd = peak - pt.equity;
      if (dd > maxDD) maxDD = dd;
    }
    const maxDrawdown = formatCurrency(-maxDD);

    return { winRate, profitFactor, totalTrades, maxDrawdown };
  }, [result]);

  if (running) {
    return (
      <div className="sticky top-6 bg-card border rounded-xl p-6 shadow-sm space-y-6 opacity-50 pointer-events-none">
        <div className="flex flex-col items-center justify-center py-8 space-y-3">
          <Loader2 className="h-6 w-6 animate-spin text-primary" />
          <p className="text-sm text-muted-foreground text-center">
            Compiling strategy and calculating option contract fills...
          </p>
        </div>
      </div>
    );
  }

  if (result && metrics) {
    const { summary, equity_curve, trades } = result;
    const symbol = result.config.global.symbol;

    return (
      <div className="sticky top-6 bg-card border rounded-xl p-5 shadow-sm space-y-5">
        <h2 className="text-lg font-semibold tracking-tight text-foreground">Performance Summary</h2>

        <div className="grid grid-cols-2 gap-3">
          <div className="bg-muted/30 rounded-lg p-3">
            <p className="text-xs text-muted-foreground">Win Rate</p>
            <p className="text-lg font-semibold text-green-500">{metrics.winRate}</p>
          </div>
          <div className="bg-muted/30 rounded-lg p-3">
            <p className="text-xs text-muted-foreground">Profit Factor</p>
            <p className="text-lg font-semibold text-foreground">{metrics.profitFactor}</p>
          </div>
          <div className="bg-muted/30 rounded-lg p-3">
            <p className="text-xs text-muted-foreground">Total Trades</p>
            <p className="text-lg font-semibold text-foreground">{metrics.totalTrades}</p>
          </div>
          <div className="bg-muted/30 rounded-lg p-3">
            <p className="text-xs text-muted-foreground">Max Drawdown</p>
            <p className="text-lg font-semibold text-red-500">{metrics.maxDrawdown}</p>
          </div>
        </div>

        <div>
          <p className="text-xs font-medium text-muted-foreground mb-2">Equity Curve</p>
          <ResponsiveContainer width="100%" height={200}>
            <AreaChart data={equity_curve} margin={{ top: 5, right: 5, bottom: 5, left: 5 }}>
              <defs>
                <linearGradient id="eqGradPanel" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="5%" stopColor="hsl(var(--primary))" stopOpacity={0.25} />
                  <stop offset="95%" stopColor="hsl(var(--primary))" stopOpacity={0} />
                </linearGradient>
              </defs>
              <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
              <XAxis dataKey="date" tick={{ fontSize: 9, fill: "hsl(var(--muted-foreground))" }} tickLine={false} axisLine={false} />
              <YAxis
                domain={["auto", "auto"]}
                tick={{ fontSize: 9, fill: "hsl(var(--muted-foreground))" }}
                tickLine={false}
                axisLine={false}
                tickFormatter={(v: number) => `$${(v / 1000).toFixed(0)}K`}
                width={40}
              />
              <Tooltip
                contentStyle={{ backgroundColor: "hsl(var(--card))", border: "1px solid hsl(var(--border))", borderRadius: "8px", fontSize: "11px" }}
                formatter={(v: number) => [formatCurrency(v)]}
              />
              <ReferenceLine y={equity_curve[0]?.equity || 0} stroke="hsl(var(--muted-foreground))" strokeDasharray="4 4" />
              <Area type="monotone" dataKey="equity" stroke="hsl(var(--primary))" strokeWidth={2} fill="url(#eqGradPanel)" dot={false} />
            </AreaChart>
          </ResponsiveContainer>
        </div>

        <div>
          <p className="text-xs font-medium text-muted-foreground mb-2">
            Trade Log ({trades.length} trades)
          </p>
          <div className="max-h-60 overflow-y-auto border border-border rounded-md">
            <table className="w-full text-xs">
              <thead>
                <tr className="bg-muted/20 border-b border-border sticky top-0">
                  <th className="px-2 py-1.5 text-left text-muted-foreground font-medium">Entry</th>
                  <th className="px-2 py-1.5 text-left text-muted-foreground font-medium">Exit</th>
                  <th className="px-2 py-1.5 text-right text-muted-foreground font-medium">P&L</th>
                </tr>
              </thead>
              <tbody>
                {trades.slice(-100).reverse().map((t, i) => (
                  <tr key={i} className="border-b border-border hover:bg-muted/20">
                    <td className="px-2 py-1 text-foreground">{t.entry_date}</td>
                    <td className="px-2 py-1 text-foreground">{t.exit_date}</td>
                    <td className={`px-2 py-1 text-right font-mono ${t.pnl >= 0 ? "text-green-500" : "text-red-500"}`}>
                      {formatCurrency(t.pnl)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>

        <Button onClick={onRun} className="w-full gap-2">
          <Play className="h-4 w-4" /> Run Again
        </Button>
      </div>
    );
  }

  return (
    <div className="sticky top-6 bg-card border rounded-xl p-6 shadow-sm space-y-6">
      <h2 className="text-lg font-semibold tracking-tight text-foreground">Backtest Controls</h2>
      <Button onClick={onRun} className="w-full gap-2">
        <Play className="h-4 w-4" /> Compile &amp; Run
      </Button>
      <p className="text-xs text-muted-foreground text-center">
        Configure your strategy and run a backtest to see performance metrics here.
      </p>
    </div>
  );
}

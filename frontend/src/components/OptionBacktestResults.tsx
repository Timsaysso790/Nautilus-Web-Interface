import {
  AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip,
  ResponsiveContainer, ReferenceLine,
} from "recharts";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import type { OptionBacktestResult } from "@/services/optionBacktestService";

interface Props {
  result: OptionBacktestResult;
}

const METRIC = (label: string, value: string, color?: string) => (
  <div className="bg-muted/30 rounded-lg p-3">
    <p className="text-xs text-muted-foreground">{label}</p>
    <p className={`text-lg font-semibold ${color || 'text-foreground'}`}>{value}</p>
  </div>
);

export function OptionBacktestResults({ result }: Props) {
  const { summary, equity_curve, trades } = result;

  const formatCurrency = (v: number) => {
    const s = v.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
    return v >= 0 ? `$${s}` : `-$${Math.abs(v).toLocaleString("en-US", { minimumFractionDigits: 2 })}`;
  };

  return (
    <div className="space-y-6">
      {/* Summary metrics grid */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        {METRIC("Total P&L", formatCurrency(summary.total_pnl), summary.total_pnl >= 0 ? "text-green-500" : "text-red-500")}
        {METRIC("Net P&L (after comm.)", formatCurrency(summary.net_pnl), summary.net_pnl >= 0 ? "text-green-500" : "text-red-500")}
        {METRIC("Return", `${summary.return_pct >= 0 ? "+" : ""}${summary.return_pct}%`, summary.return_pct >= 0 ? "text-green-500" : "text-red-500")}
        {METRIC("Sharpe Ratio", summary.sharpe_ratio > 0 ? summary.sharpe_ratio.toFixed(2) : "N/A")}
        {METRIC("Win Rate", `${summary.win_rate}%`)}
        {METRIC("Total Trades", String(summary.total_trades))}
        {METRIC("Max Drawdown", `${summary.max_drawdown_pct}%`, "text-red-500")}
        {METRIC("Avg P&L / Trade", formatCurrency(summary.avg_pnl_per_trade), summary.avg_pnl_per_trade >= 0 ? "text-green-500" : "text-red-500")}
        {METRIC("Avg Margin / Trade", formatCurrency(summary.avg_margin_per_trade))}
        {METRIC("Total Commission", formatCurrency(summary.total_commission))}
      </div>

      {/* P&L Attribution */}
      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-sm">P&L Attribution (Greeks-based)</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-5 gap-2 text-center text-sm">
            {[
              { key: "delta", label: "Δ Delta", color: "text-blue-500" },
              { key: "gamma", label: "Γ Gamma", color: "text-purple-500" },
              { key: "theta", label: "Θ Theta", color: "text-green-500" },
              { key: "vega", label: "ν Vega", color: "text-orange-500" },
              { key: "unexplained", label: "Other", color: "text-muted-foreground" },
            ].map(m => (
              <div key={m.key}>
                <p className={`text-lg font-bold ${m.color}`}>
                  {formatCurrency((summary.pnl_attribution as any)[m.key] || 0)}
                </p>
                <p className="text-xs text-muted-foreground">{m.label}</p>
              </div>
            ))}
          </div>
        </CardContent>
      </Card>

      {/* Equity curve */}
      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-sm">Equity Curve</CardTitle>
        </CardHeader>
        <CardContent>
          <ResponsiveContainer width="100%" height={280}>
            <AreaChart data={equity_curve} margin={{ top: 5, right: 10, bottom: 5, left: 10 }}>
              <defs>
                <linearGradient id="eqGrad" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="5%" stopColor="hsl(var(--primary))" stopOpacity={0.3} />
                  <stop offset="95%" stopColor="hsl(var(--primary))" stopOpacity={0} />
                </linearGradient>
              </defs>
              <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
              <XAxis dataKey="date" tick={{ fontSize: 10, fill: "hsl(var(--muted-foreground))" }} tickLine={false} axisLine={false} />
              <YAxis
                domain={['auto', 'auto']}
                tick={{ fontSize: 10, fill: "hsl(var(--muted-foreground))" }}
                tickLine={false}
                axisLine={false}
                tickFormatter={(v: number) => `$${(v / 1000).toFixed(0)}K`}
                width={50}
              />
              <Tooltip
                contentStyle={{ backgroundColor: "hsl(var(--card))", border: "1px solid hsl(var(--border))", borderRadius: "8px", fontSize: "12px" }}
                formatter={(v: number) => [formatCurrency(v)]}
              />
              <ReferenceLine y={equity_curve[0]?.equity || 0} stroke="hsl(var(--muted-foreground))" strokeDasharray="4 4" />
              <Area type="monotone" dataKey="equity" stroke="hsl(var(--primary))" strokeWidth={2} fill="url(#eqGrad)" dot={false} />
            </AreaChart>
          </ResponsiveContainer>
        </CardContent>
      </Card>

      {/* Recent trades table */}
      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-sm">Recent Trades ({trades.length} total)</CardTitle>
        </CardHeader>
        <CardContent className="p-0">
          <div className="overflow-x-auto max-h-64 overflow-y-auto">
            <table className="w-full text-xs">
              <thead>
                <tr className="border-b border-border">
                  <th className="px-3 py-2 text-left text-muted-foreground">Entry</th>
                  <th className="px-3 py-2 text-left text-muted-foreground">Exit</th>
                  <th className="px-3 py-2 text-right text-muted-foreground">P&L</th>
                  <th className="px-3 py-2 text-right text-muted-foreground">Credit</th>
                  <th className="px-3 py-2 text-right text-muted-foreground">Comm.</th>
                  <th className="px-3 py-2 text-right text-muted-foreground">Margin</th>
                  <th className="px-3 py-2 text-right text-muted-foreground">IV</th>
                </tr>
              </thead>
              <tbody>
                {trades.slice(-50).reverse().map((t, i) => (
                  <tr key={i} className="border-b border-border hover:bg-muted/30">
                    <td className="px-3 py-1.5 text-foreground">{t.entry_date}</td>
                    <td className="px-3 py-1.5 text-foreground">{t.exit_date}</td>
                    <td className={`px-3 py-1.5 text-right font-mono ${t.pnl >= 0 ? "text-green-500" : "text-red-500"}`}>
                      {formatCurrency(t.pnl)}
                    </td>
                    <td className="px-3 py-1.5 text-right font-mono text-foreground">{formatCurrency(t.net_credit)}</td>
                    <td className="px-3 py-1.5 text-right font-mono text-foreground">{formatCurrency(t.commission)}</td>
                    <td className="px-3 py-1.5 text-right font-mono text-foreground">{formatCurrency(t.margin)}</td>
                    <td className="px-3 py-1.5 text-right font-mono text-foreground">{(t.iv * 100).toFixed(1)}%</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}

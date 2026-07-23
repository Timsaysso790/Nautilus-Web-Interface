import { useState, useEffect } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import ChartView from "@/components/ChartView";
import {
  BarChart3, TrendingUp, TrendingDown, Loader2, ExternalLink,
} from "lucide-react";
import api from "@/lib/api";

interface BacktestResult {
  id?: string;
  ticker: string;
  strategy: string;
  metrics: {
    total_trades: number;
    winning_trades: number;
    losing_trades: number;
    win_rate: number;
    total_pnl: number;
    avg_pnl: number;
    profit_factor: number;
    sharpe_ratio: number;
    max_drawdown_pct: number;
    avg_days_held: number;
  };
  trades: {
    entry_date: string;
    exit_date: string;
    expiration: string;
    dte_at_entry: number;
    dte_at_exit: number;
    days_held: number;
    pnl: number;
    exit_reason: string;
  }[];
}

export default function BacktestDetail() {
  const [results, setResults] = useState<BacktestResult[]>([]);
  const [selectedIdx, setSelectedIdx] = useState(0);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    // Try to load the most recent backtest result from cache
    const loadRecent = async () => {
      try {
        // First try running a quick backtest
        const data = await api.post<BacktestResult>("/api/backtest/options/run", {
          ticker: "SPY",
          legs: [{ strike: 620, right: "P", action: "sell", quantity: 1 }, { strike: 615, right: "P", action: "buy", quantity: 1 }],
          entry_dte_min: 30, entry_dte_max: 45, hold_until_dte: 21, start_year: 2025, end_year: 2025,
        });
        setResults([data]);
      } catch {
        // Use empty state
        setResults([]);
      }
      setLoading(false);
    };
    loadRecent();
  }, []);

  const result = results[selectedIdx];

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-lg font-semibold text-gray-100 flex items-center gap-2">
            <BarChart3 className="h-5 w-5 text-amber-400" />
            Backtest Visualizer
          </h1>
          <p className="text-xs text-gray-500 mt-0.5">See trade entries and exits on price charts with indicators</p>
        </div>
      </div>

      {loading ? (
        <div className="flex items-center justify-center p-12">
          <Loader2 className="h-6 w-6 text-amber-400 animate-spin" />
        </div>
      ) : !result ? (
        <Card className="bg-[#0d1321] border-gray-800/60 p-8 text-center">
          <div className="text-xs text-gray-500">Run a backtest from the Backtesting page, then view it here.</div>
        </Card>
      ) : (
        <>
          {/* Metrics bar */}
          <div className="grid grid-cols-4 sm:grid-cols-5 lg:grid-cols-7 gap-2">
            <Card className="bg-[#0d1321] border-gray-800/60 p-2">
              <div className="text-[10px] text-gray-500">Trades</div>
              <div className="text-sm font-bold text-gray-200">{result.metrics.total_trades}</div>
            </Card>
            <Card className="bg-[#0d1321] border-gray-800/60 p-2">
              <div className="text-[10px] text-gray-500">Win Rate</div>
              <div className={`text-sm font-bold ${result.metrics.win_rate >= 50 ? "text-emerald-400" : "text-red-400"}`}>
                {result.metrics.win_rate}%
              </div>
            </Card>
            <Card className="bg-[#0d1321] border-gray-800/60 p-2">
              <div className="text-[10px] text-gray-500">PnL</div>
              <div className={`text-sm font-bold ${result.metrics.total_pnl >= 0 ? "text-emerald-400" : "text-red-400"}`}>
                ${result.metrics.total_pnl.toFixed(0)}
              </div>
            </Card>
            <Card className="bg-[#0d1321] border-gray-800/60 p-2">
              <div className="text-[10px] text-gray-500">Sharpe</div>
              <div className={`text-sm font-bold ${result.metrics.sharpe_ratio >= 1 ? "text-emerald-400" : "text-amber-400"}`}>
                {result.metrics.sharpe_ratio.toFixed(1)}
              </div>
            </Card>
            <Card className="bg-[#0d1321] border-gray-800/60 p-2">
              <div className="text-[10px] text-gray-500">Max DD</div>
              <div className="text-sm font-bold text-red-400">{result.metrics.max_drawdown_pct.toFixed(1)}%</div>
            </Card>
            <Card className="bg-[#0d1321] border-gray-800/60 p-2">
              <div className="text-[10px] text-gray-500">Profit Factor</div>
              <div className="text-sm font-bold text-gray-200">{result.metrics.profit_factor.toFixed(1)}</div>
            </Card>
            <Card className="bg-[#0d1321] border-gray-800/60 p-2">
              <div className="text-[10px] text-gray-500">Avg Hold</div>
              <div className="text-sm font-bold text-gray-200">{result.metrics.avg_days_held}d</div>
            </Card>
          </div>

          {/* Chart with trade markers */}
          <ChartView
            ticker={result.ticker}
            height={500}
            indicators="bb,sma20,rsi"
            startDate={`${Math.min(...result.trades.map(t => parseInt(t.entry_date))).toString().substring(0,4)}-01-01`}
            endDate={`${Math.max(...result.trades.map(t => parseInt(t.exit_date))).toString().substring(0,4)}-12-31`}
            trades={result.trades.map(t => ({
              entry_date: t.entry_date,
              exit_date: t.exit_date,
              pnl: t.pnl,
              entry_price: undefined,
              exit_price: undefined,
            }))}
          />

          {/* Trade list */}
          <Card className="bg-[#0d1321] border-gray-800/60">
            <CardHeader className="p-3 pb-0">
              <CardTitle className="text-xs text-gray-400">Trade Log ({result.trades.length} trades)</CardTitle>
            </CardHeader>
            <CardContent className="p-0">
              <div className="overflow-x-auto max-h-60 overflow-y-auto">
                <table className="w-full text-[11px]">
                  <thead>
                    <tr className="border-b border-gray-800/60 text-gray-500">
                      <th className="text-left p-2 font-medium">#</th>
                      <th className="text-left p-2 font-medium">Entry</th>
                      <th className="text-left p-2 font-medium">Exit</th>
                      <th className="text-left p-2 font-medium">DTE</th>
                      <th className="text-left p-2 font-medium">Days</th>
                      <th className="text-right p-2 font-medium">PnL</th>
                      <th className="text-left p-2 font-medium">Exit Reason</th>
                    </tr>
                  </thead>
                  <tbody>
                    {result.trades.map((t, i) => (
                      <tr key={i} className="border-b border-gray-800/40 hover:bg-white/5">
                        <td className="p-2 text-gray-400">{i + 1}</td>
                        <td className="p-2 text-gray-300">{t.entry_date}</td>
                        <td className="p-2 text-gray-300">{t.exit_date}</td>
                        <td className="p-2 text-gray-300">{t.dte_at_entry}→{t.dte_at_exit}</td>
                        <td className="p-2 text-gray-300">{t.days_held}</td>
                        <td className={`p-2 text-right font-medium ${t.pnl >= 0 ? "text-emerald-400" : "text-red-400"}`}>
                          {t.pnl >= 0 ? "+" : ""}${t.pnl.toFixed(0)}
                        </td>
                        <td className="p-2">
                          <Badge className={`text-[10px] ${
                            t.exit_reason === "dte_exit" ? "bg-blue-900/30 text-blue-400" :
                            t.exit_reason === "max_hold" ? "bg-amber-900/30 text-amber-400" :
                            "bg-gray-800 text-gray-400"
                          }`}>
                            {t.exit_reason}
                          </Badge>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </CardContent>
          </Card>
        </>
      )}
    </div>
  );
}

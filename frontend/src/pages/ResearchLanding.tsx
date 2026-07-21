import { useState, useEffect } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  FlaskConical, BarChart3, LineChart, Database, Search,
  TrendingUp, Activity, Clock, ChevronRight, ArrowUpRight, ArrowDownRight
} from "lucide-react";

interface StrategySnapshot {
  name: string;
  type: string;
  pnl: number;
  trades: number;
  winRate: number;
  status: "active" | "idle" | "error";
}

interface RecentBacktest {
  id: string;
  strategy: string;
  pnl: number;
  date: string;
  status: "completed" | "running" | "failed";
}

const QUICK_LINKS = [
  { href: "/research/options-lab", label: "Options Lab", icon: Activity, desc: "Chains, greeks, payoff strategies" },
  { href: "/research/backtesting", label: "Backtesting", icon: BarChart3, desc: "SMA sweeps & historical sims" },
  { href: "/research/portfolio-designer", label: "Portfolio Designer", icon: LineChart, desc: "Allocation & optimization" },
  { href: "/research/data-catalog", label: "Data Catalog", icon: Database, desc: "Browse available market data" },
  { href: "/research/screener", label: "Strategy Screener", icon: Search, desc: "Scan for put credit spreads" },
];

const SAMPLE_STRATEGIES: StrategySnapshot[] = [
  { name: "SMA Crossover", type: "Trend Following", pnl: 4823.50, trades: 47, winRate: 61.7, status: "active" },
  { name: "RSI Mean Reversion", type: "Mean Reversion", pnl: -1250.00, trades: 32, winRate: 43.8, status: "idle" },
  { name: "Put Credit Spread", type: "Options", pnl: 2100.00, trades: 12, winRate: 83.3, status: "active" },
];

const SAMPLE_BACKTESTS: RecentBacktest[] = [
  { id: "bt-001", strategy: "SMA(10,20) Crossover", pnl: 12450.00, date: "2026-07-19 14:32", status: "completed" },
  { id: "bt-002", strategy: "SMA Sweep (5-25, 15-60)", pnl: 18720.50, date: "2026-07-19 11:15", status: "completed" },
  { id: "bt-003", strategy: "RSI Mean Reversion", pnl: -3200.00, date: "2026-07-18 09:45", status: "completed" },
  { id: "bt-004", strategy: "Grid Strategy v2", pnl: 0, date: "2026-07-20", status: "running" },
];

const DATA_SOURCE_BADGES = [
  { name: "SPY Options", count: "14 expirations", days: "7d" },
  { name: "QQQ Options", count: "12 expirations", days: "7d" },
  { name: "E-mini Futures", count: "2 contracts", days: "30d" },
  { name: "FX Majors", count: "6 pairs", days: "90d" },
];

function MetricCard({ label, value, sub, className }: { label: string; value: string; sub?: string; className?: string }) {
  return (
    <div className={`bg-[#0d1321] border border-gray-800/60 rounded-lg p-4 ${className ?? ""}`}>
      <div className="text-[11px] text-gray-500 uppercase tracking-wider mb-1">{label}</div>
      <div className="text-lg font-bold text-gray-100 tabular-mono">{value}</div>
      {sub && <div className="text-[11px] text-gray-600 mt-0.5">{sub}</div>}
    </div>
  );
}

export default function ResearchLanding() {
  const [time, setTime] = useState(new Date());
  useEffect(() => {
    const id = setInterval(() => setTime(new Date()), 1000);
    return () => clearInterval(id);
  }, []);

  return (
    <div className="space-y-6">
      {/* Header bar */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-lg font-semibold text-gray-100 flex items-center gap-2">
            <FlaskConical className="h-5 w-5 text-amber-400" />
            Research Dashboard
          </h1>
          <p className="text-xs text-gray-500 mt-0.5">
            Strategy research, backtesting, and portfolio analysis terminal
          </p>
        </div>
        <div className="flex items-center gap-3 text-xs text-gray-500">
          <Clock className="h-3.5 w-3.5" />
          <span className="tabular-mono">{time.toLocaleTimeString()}</span>
          <span className="w-1.5 h-1.5 rounded-full bg-amber-400/60 animate-pulse" />
        </div>
      </div>

      {/* Quick links */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-5 gap-3">
        {QUICK_LINKS.map((link) => {
          const Icon = link.icon;
          return (
            <a
              key={link.href}
              href={link.href}
              className="group bg-[#0d1321] border border-gray-800/60 hover:border-amber-400/30 rounded-lg p-3 transition-all"
            >
              <div className="flex items-center gap-2 mb-1">
                <Icon className="h-4 w-4 text-amber-400/70 group-hover:text-amber-400 transition-colors" />
                <span className="text-xs font-medium text-gray-300 group-hover:text-amber-400 transition-colors">
                  {link.label}
                </span>
              </div>
              <p className="text-[11px] text-gray-600">{link.desc}</p>
            </a>
          );
        })}
      </div>

      {/* Metrics row */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <MetricCard label="Active Strategies" value="2 / 3" sub="1 idle · 0 errors" />
        <MetricCard label="Backtests (24h)" value="4" sub="3 completed · 1 running" />
        <MetricCard label="Best P&L (30d)" value="+$18,720.50" sub="SMA Sweep (5, 15)" className="text-profit" />
        <MetricCard label="Data Volume" value="30.9 GB" sub="175 tickers · 5 archives" />
      </div>

      {/* Main grid */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Strategy Snapshot */}
        <Card className="bg-[#0d1321] border-gray-800/60">
          <CardHeader className="pb-2 flex-row items-center justify-between">
            <CardTitle className="text-sm font-semibold text-gray-100 flex items-center gap-2">
              <TrendingUp className="h-4 w-4 text-amber-400/70" />
              Strategy Snapshot
            </CardTitle>
            <Badge variant="outline" className="text-[10px] text-gray-500 border-gray-700">Live</Badge>
          </CardHeader>
          <CardContent className="p-0">
            <div className="divide-y divide-gray-800/40">
              {SAMPLE_STRATEGIES.map((s) => (
                <div key={s.name} className="px-4 py-3 flex items-center justify-between hover:bg-white/[0.02] transition-colors">
                  <div className="flex items-center gap-3">
                    <div className={`w-1.5 h-1.5 rounded-full ${
                      s.status === "active" ? "bg-profit" : s.status === "error" ? "bg-loss" : "bg-gray-600"
                    }`} />
                    <div>
                      <div className="text-sm font-medium text-gray-200">{s.name}</div>
                      <div className="text-[11px] text-gray-500">{s.type}</div>
                    </div>
                  </div>
                  <div className="flex items-center gap-4 text-xs tabular-mono">
                    <div className="text-right">
                      <div className={s.pnl >= 0 ? "text-profit" : "text-loss"}>
                        {s.pnl >= 0 ? "+" : ""}${s.pnl.toLocaleString()}
                      </div>
                      <div className="text-gray-600">{s.trades} trades</div>
                    </div>
                    <Badge variant={s.winRate >= 50 ? "default" : "secondary"} className="text-[10px] w-14 justify-center">
                      {s.winRate}%
                    </Badge>
                  </div>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>

        {/* Recent Backtests */}
        <Card className="bg-[#0d1321] border-gray-800/60">
          <CardHeader className="pb-2 flex-row items-center justify-between">
            <CardTitle className="text-sm font-semibold text-gray-100 flex items-center gap-2">
              <BarChart3 className="h-4 w-4 text-amber-400/70" />
              Recent Backtests
            </CardTitle>
            <a href="/research/backtesting" className="text-[11px] text-amber-400/70 hover:text-amber-400 flex items-center gap-1">
              View all <ChevronRight className="h-3 w-3" />
            </a>
          </CardHeader>
          <CardContent className="p-0">
            <div className="divide-y divide-gray-800/40">
              {SAMPLE_BACKTESTS.map((bt) => (
                <div key={bt.id} className="px-4 py-3 flex items-center justify-between hover:bg-white/[0.02] transition-colors">
                  <div className="flex items-center gap-3">
                    <div className={`w-1.5 h-1.5 rounded-full ${
                      bt.status === "completed" ? "bg-profit" : bt.status === "running" ? "bg-amber-400 animate-pulse" : "bg-loss"
                    }`} />
                    <div>
                      <div className="text-sm font-medium text-gray-200">{bt.strategy}</div>
                      <div className="text-[11px] text-gray-600">{bt.date}</div>
                    </div>
                  </div>
                  <div className="tabular-mono text-xs text-right">
                    <div className={bt.pnl > 0 ? "text-profit" : bt.pnl < 0 ? "text-loss" : "text-gray-500"}>
                      {bt.pnl !== 0 ? `${bt.pnl > 0 ? "+" : ""}$${bt.pnl.toLocaleString()}` : "—"}
                    </div>
                    <Badge variant={bt.status === "completed" ? "secondary" : bt.status === "running" ? "default" : "destructive"} className="text-[10px] mt-0.5">
                      {bt.status}
                    </Badge>
                  </div>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Data Sources & System Info */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        <Card className="lg:col-span-2 bg-[#0d1321] border-gray-800/60">
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-semibold text-gray-100 flex items-center gap-2">
              <Database className="h-4 w-4 text-amber-400/70" />
              Available Data Sources
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-2 gap-2">
              {DATA_SOURCE_BADGES.map((ds) => (
                <div key={ds.name} className="bg-gray-900/50 border border-gray-800/40 rounded-lg px-3 py-2 flex items-center justify-between">
                  <div>
                    <div className="text-sm font-medium text-gray-200">{ds.name}</div>
                    <div className="text-[11px] text-gray-600">{ds.count}</div>
                  </div>
                  <Badge variant="outline" className="text-[10px] text-gray-500 border-gray-700">{ds.days}</Badge>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>

        <Card className="bg-[#0d1321] border-gray-800/60">
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-semibold text-gray-100 flex items-center gap-2">
              <Activity className="h-4 w-4 text-amber-400/70" />
              System
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-2 text-xs">
            {[
              ["Engine", "NautilusTrader v1.20.0"],
              ["Data Archive", "Nautilus_Archive5min"],
              ["Storage Backend", "Parquet (S3-compatible)"],
              ["Compute Mode", "Multi-threaded (8 workers)"],
              ["Python Runtime", "3.13.5 / uv managed"],
            ].map(([k, v]) => (
              <div key={k} className="flex items-center justify-between px-2 py-1.5 rounded hover:bg-gray-900/50">
                <span className="text-gray-500">{k}</span>
                <span className="text-gray-300 tabular-mono">{v}</span>
              </div>
            ))}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}

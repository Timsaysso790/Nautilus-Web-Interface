import { useEffect, useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import api from "@/lib/api";
import {
  Zap,
  Crosshair,
  FileText,
  TrendingUp,
  TrendingDown,
  Wallet,
  Radio,
  Activity,
} from "lucide-react";

interface LiveSummary {
  portfolio_value: number;
  day_pnl: number;
  day_pnl_pct: number;
  open_positions: number;
  open_orders: number;
  buying_power: number;
  broker_status: Record<string, { connected: boolean; name: string }>;
}

export default function LiveLanding() {
  const [summary, setSummary] = useState<LiveSummary | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const fetchSummary = async () => {
      try {
        const data = await api.get<LiveSummary>("/api/live/summary");
        setSummary(data);
      } catch {
        // Backend may not be available — show empty state
      } finally {
        setLoading(false);
      }
    };
    fetchSummary();
    const interval = setInterval(fetchSummary, 15000);
    return () => clearInterval(interval);
  }, []);

  const isPositive = (summary?.day_pnl ?? 0) >= 0;
  const formatUSD = (v: number | undefined | null) =>
    v != null ? `$${v.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}` : "$0.00";

  return (
    <div className="space-y-6">
      {/* Page header */}
      <div>
        <h1 className="text-lg font-semibold text-gray-100">Live Dashboard</h1>
        <p className="text-xs text-gray-500 mt-0.5">
          Real-time portfolio overview and broker status
        </p>
      </div>

      {/* Summary cards */}
      {loading ? (
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
          {Array.from({ length: 4 }).map((_, i) => (
            <Card key={i} className="bg-[#0f1624] border-gray-800/60">
              <CardHeader className="pb-2">
                <Skeleton className="h-3 w-20 bg-gray-800" />
              </CardHeader>
              <CardContent>
                <Skeleton className="h-7 w-28 bg-gray-800" />
              </CardContent>
            </Card>
          ))}
        </div>
      ) : summary ? (
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
          <Card className="bg-[#0f1624] border-gray-800/60">
            <CardHeader className="flex flex-row items-center justify-between pb-2">
              <CardTitle className="text-[11px] font-medium text-gray-500 uppercase tracking-wider">
                Portfolio
              </CardTitle>
              <Wallet className="h-4 w-4 text-emerald-400" />
            </CardHeader>
            <CardContent>
              <p className="text-xl font-bold text-gray-100 tabular-nums">
                {formatUSD(summary?.portfolio_value)}
              </p>
            </CardContent>
          </Card>

          <Card className="bg-[#0f1624] border-gray-800/60">
            <CardHeader className="flex flex-row items-center justify-between pb-2">
              <CardTitle className="text-[11px] font-medium text-gray-500 uppercase tracking-wider">
                Day P&L
              </CardTitle>
              {isPositive ? (
                <TrendingUp className="h-4 w-4 text-emerald-400" />
              ) : (
                <TrendingDown className="h-4 w-4 text-red-400" />
              )}
            </CardHeader>
            <CardContent>
              <p
                className={`text-xl font-bold tabular-nums ${
                  isPositive ? "text-emerald-400" : "text-red-400"
                }`}
              >
                {isPositive ? "+" : ""}
                {formatUSD(summary?.day_pnl)}
                <span className="text-sm font-normal ml-1 opacity-70">
                  ({isPositive ? "+" : ""}
                  {summary?.day_pnl_pct?.toFixed(2) ?? "0.00"}%)
                </span>
              </p>
            </CardContent>
          </Card>

          <Card className="bg-[#0f1624] border-gray-800/60">
            <CardHeader className="flex flex-row items-center justify-between pb-2">
              <CardTitle className="text-[11px] font-medium text-gray-500 uppercase tracking-wider">
                Positions
              </CardTitle>
              <Crosshair className="h-4 w-4 text-emerald-400" />
            </CardHeader>
            <CardContent>
              <p className="text-xl font-bold text-gray-100 tabular-nums">
                {summary?.open_positions ?? 0}
              </p>
            </CardContent>
          </Card>

          <Card className="bg-[#0f1624] border-gray-800/60">
            <CardHeader className="flex flex-row items-center justify-between pb-2">
              <CardTitle className="text-[11px] font-medium text-gray-500 uppercase tracking-wider">
                Open Orders
              </CardTitle>
              <FileText className="h-4 w-4 text-emerald-400" />
            </CardHeader>
            <CardContent>
              <p className="text-xl font-bold text-gray-100 tabular-nums">
                {summary?.open_orders ?? 0}
              </p>
            </CardContent>
          </Card>
        </div>
      ) : (
        <Card className="bg-[#0f1624] border-gray-800/60">
          <CardContent className="flex flex-col items-center justify-center py-12 text-gray-500">
            <Activity className="h-8 w-8 mb-3 text-gray-600" />
            <p className="text-sm">No live data available</p>
            <p className="text-xs mt-1">
              Connect a broker to see your portfolio summary
            </p>
          </CardContent>
        </Card>
      )}

      {/* Broker status */}
      <div>
        <h2 className="text-sm font-semibold text-gray-300 mb-3 flex items-center gap-2">
          <Radio className="h-3.5 w-3.5 text-emerald-400" />
          Broker Connections
        </h2>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          {summary && summary.broker_status && Object.keys(summary.broker_status).length > 0 ? (
            Object.entries(summary.broker_status).map(
              ([id, broker]: [string, any]) => (
                <Card
                  key={id}
                  className="bg-[#0f1624] border-gray-800/60"
                >
                  <CardContent className="flex items-center justify-between py-4">
                    <div className="flex items-center gap-3">
                      <span
                        className={`w-2 h-2 rounded-full ${
                          broker.connected
                            ? "bg-emerald-400 shadow-[0_0_6px_rgba(52,211,153,0.4)]"
                            : "bg-red-500"
                        }`}
                      />
                      <div>
                        <p className="text-sm font-medium text-gray-200">
                          {broker.name || id}
                        </p>
                        <p className="text-[11px] text-gray-500">
                          {broker.connected ? "Connected" : "Disconnected"}
                        </p>
                      </div>
                    </div>
                    <Badge
                      variant={broker.connected ? "default" : "destructive"}
                      className={`text-[10px] ${
                        broker.connected
                          ? "bg-emerald-400/10 text-emerald-400 border-emerald-400/20"
                          : "bg-red-400/10 text-red-400 border-red-400/20"
                      }`}
                    >
                      {broker.connected ? "Live" : "Offline"}
                    </Badge>
                  </CardContent>
                </Card>
              )
            )
          ) : (
            <div className="col-span-full">
              <Card className="bg-[#0f1624] border-gray-800/60">
                <CardContent className="flex flex-col items-center justify-center py-8 text-gray-500">
                  <Radio className="h-6 w-6 mb-2 text-gray-600" />
                  <p className="text-sm">No brokers configured</p>
                  <p className="text-xs mt-1">
                    Go to{" "}
                    <a
                      href="/live/brokers"
                      className="text-emerald-400 hover:underline"
                    >
                      Broker Connections
                    </a>{" "}
                    to set one up.
                  </p>
                </CardContent>
              </Card>
            </div>
          )}
        </div>
      </div>

      {/* Quick actions */}
      <div>
        <h2 className="text-sm font-semibold text-gray-300 mb-3 flex items-center gap-2">
          <Zap className="h-3.5 w-3.5 text-emerald-400" />
          Quick Actions
        </h2>
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
          <a
            href="/live/positions"
            className="flex items-center gap-2.5 bg-[#0f1624] border border-gray-800/60 rounded-lg px-4 py-3 hover:border-emerald-400/30 hover:bg-[#111a2a] transition-all"
          >
            <Crosshair className="h-4 w-4 text-emerald-400" />
            <span className="text-xs font-medium text-gray-300">
              Positions
            </span>
          </a>
          <a
            href="/live/orders"
            className="flex items-center gap-2.5 bg-[#0f1624] border border-gray-800/60 rounded-lg px-4 py-3 hover:border-emerald-400/30 hover:bg-[#111a2a] transition-all"
          >
            <FileText className="h-4 w-4 text-emerald-400" />
            <span className="text-xs font-medium text-gray-300">Orders</span>
          </a>
          <a
            href="/live/order-ticket"
            className="flex items-center gap-2.5 bg-[#0f1624] border border-gray-800/60 rounded-lg px-4 py-3 hover:border-emerald-400/30 hover:bg-[#111a2a] transition-all"
          >
            <Activity className="h-4 w-4 text-emerald-400" />
            <span className="text-xs font-medium text-gray-300">
              New Order
            </span>
          </a>
          <a
            href="/live/brokers"
            className="flex items-center gap-2.5 bg-[#0f1624] border border-gray-800/60 rounded-lg px-4 py-3 hover:border-emerald-400/30 hover:bg-[#111a2a] transition-all"
          >
            <Radio className="h-4 w-4 text-emerald-400" />
            <span className="text-xs font-medium text-gray-300">Brokers</span>
          </a>
        </div>
      </div>
    </div>
  );
}

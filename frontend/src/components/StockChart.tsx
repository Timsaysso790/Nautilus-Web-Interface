import { useState } from "react";
import {
  LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip,
  ResponsiveContainer, Area, AreaChart,
} from "recharts";
import type { Bar } from "@/services/stockService";

interface Props {
  symbol: string;
  bars: Bar[];
  loading?: boolean;
}

const INTERVALS = [
  { key: "1d", label: "1D", bars: 1 },
  { key: "5d", label: "5D", bars: 5 },
  { key: "1mo", label: "1M", bars: 21 },
  { key: "3mo", label: "3M", bars: 63 },
  { key: "1y", label: "1Y", bars: 252 },
  { key: "5y", label: "5Y", bars: 1260 },
  { key: "max", label: "Max", bars: 10000 },
];

export function StockChart({ symbol, bars, loading }: Props) {
  const [interval, setInterval] = useState("1mo");

  const chartBars = bars.slice((INTERVALS.find(i => i.key === interval)?.bars ?? 252) * -1);

  if (loading) {
    return (
      <div className="bg-card border rounded-lg p-4 space-y-4">
        <div className="h-8 w-48 bg-muted rounded animate-pulse" />
        <div className="h-64 bg-muted rounded animate-pulse" />
      </div>
    );
  }

  if (!bars.length) {
    return (
      <div className="bg-card border rounded-lg p-6 text-center text-muted-foreground">
        No historical data available for {symbol}.
      </div>
    );
  }

  const data = chartBars.map(b => ({
    ...b,
    time: b.timestamp?.slice(0, 10) || "",
  }));

  const prices = data.map(d => d.close).filter((v): v is number => v != null);
  const minP = Math.min(...prices);
  const maxP = Math.max(...prices);
  const padding = (maxP - minP) * 0.05 || 1;

  return (
    <div className="bg-card border rounded-lg p-4 space-y-4">
      <div className="flex items-center justify-between">
        <h3 className="text-lg font-semibold text-foreground">{symbol}</h3>
        <div className="flex gap-1">
          {INTERVALS.map(iv => (
            <button
              key={iv.key}
              onClick={() => setInterval(iv.key)}
              className={`px-3 py-1 text-xs rounded transition-colors ${
                interval === iv.key
                  ? "bg-primary text-primary-foreground"
                  : "bg-muted text-muted-foreground hover:bg-muted/80"
              }`}
            >
              {iv.label}
            </button>
          ))}
        </div>
      </div>

      <ResponsiveContainer width="100%" height={320}>
        <AreaChart data={data} margin={{ top: 5, right: 5, left: 5, bottom: 5 }}>
          <defs>
            <linearGradient id="colorClose" x1="0" y1="0" x2="0" y2="1">
              <stop offset="5%" stopColor="hsl(var(--primary))" stopOpacity={0.3} />
              <stop offset="95%" stopColor="hsl(var(--primary))" stopOpacity={0} />
            </linearGradient>
          </defs>
          <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
          <XAxis
            dataKey="time"
            tick={{ fontSize: 11, fill: "hsl(var(--muted-foreground))" }}
            tickLine={false}
            axisLine={false}
            tickFormatter={(v: string) => v.slice(5)}
          />
          <YAxis
            domain={[minP - padding, maxP + padding]}
            tick={{ fontSize: 11, fill: "hsl(var(--muted-foreground))" }}
            tickLine={false}
            axisLine={false}
            tickFormatter={(v: number) => `$${v.toFixed(2)}`}
            width={70}
          />
          <Tooltip
            contentStyle={{
              backgroundColor: "hsl(var(--card))",
              border: "1px solid hsl(var(--border))",
              borderRadius: "8px",
              fontSize: "12px",
            }}
            labelFormatter={(label: string) => `Date: ${label}`}
            formatter={(value: number) => [`$${value.toFixed(2)}`, "Close"]}
          />
          <Area
            type="monotone"
            dataKey="close"
            stroke="hsl(var(--primary))"
            strokeWidth={2}
            fillOpacity={1}
            fill="url(#colorClose)"
            dot={false}
            activeDot={{ r: 4, fill: "hsl(var(--primary))" }}
          />
        </AreaChart>
      </ResponsiveContainer>
    </div>
  );
}

import {
  LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip,
  ResponsiveContainer, ReferenceLine, Legend,
} from "recharts";
import type { PayoffPoint } from "@/services/optionsService";

interface Props {
  data: PayoffPoint[];
  breakevens?: number[];
}

export function OptionPayoffChart({ data, breakevens }: Props) {
  if (!data.length) {
    return (
      <div className="bg-card border rounded-lg p-6 text-center text-muted-foreground">
        Add legs to see the payoff diagram.
      </div>
    );
  }

  const pnls = data.map(d => d.pnl);
  const maxPnl = Math.max(...pnls);
  const minPnl = Math.min(...pnls);
  const padding = (maxPnl - minPnl) * 0.1 || 100;

  return (
    <div className="bg-card border rounded-lg p-4">
      <h3 className="text-sm font-semibold text-foreground mb-3">P&L at Expiration</h3>
      <ResponsiveContainer width="100%" height={280}>
        <LineChart data={data} margin={{ top: 5, right: 20, bottom: 5, left: 20 }}>
          <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
          <XAxis
            dataKey="underlying_price"
            tick={{ fontSize: 11, fill: "hsl(var(--muted-foreground))" }}
            tickLine={false}
            axisLine={false}
            tickFormatter={(v: number) => `$${v.toFixed(0)}`}
          />
          <YAxis
            domain={[minPnl - padding, maxPnl + padding]}
            tick={{ fontSize: 11, fill: "hsl(var(--muted-foreground))" }}
            tickLine={false}
            axisLine={false}
            tickFormatter={(v: number) => `$${v.toFixed(0)}`}
            width={60}
          />
          <Tooltip
            contentStyle={{
              backgroundColor: "hsl(var(--card))",
              border: "1px solid hsl(var(--border))",
              borderRadius: "8px",
              fontSize: "12px",
            }}
            labelFormatter={(label: number) => `Price: $${label.toFixed(2)}`}
            formatter={(value: number) => [`$${value.toFixed(2)}`, "P&L"]}
          />
          <ReferenceLine y={0} stroke="hsl(var(--muted-foreground))" strokeDasharray="4 4" />
          {breakevens?.map((be, i) => (
            <ReferenceLine
              key={i}
              x={be}
              stroke="hsl(var(--alert))"
              strokeDasharray="3 3"
              label={{ value: `BE $${be.toFixed(1)}`, position: "top", fontSize: 10, fill: "hsl(var(--muted-foreground))" }}
            />
          ))}
          <Line
            type="monotone"
            dataKey="pnl"
            stroke="hsl(var(--primary))"
            strokeWidth={2}
            dot={false}
            activeDot={{ r: 4 }}
          />
        </LineChart>
      </ResponsiveContainer>
    </div>
  );
}

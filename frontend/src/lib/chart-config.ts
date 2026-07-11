export const chartDefaults = {
  grid: { strokeDasharray: "3 3", stroke: "hsl(var(--border))" },
  axis: { tick: { fontSize: 10, fill: "hsl(var(--muted-foreground))" }, tickLine: false, axisLine: false },
  tooltip: {
    contentStyle: {
      backgroundColor: "hsl(var(--card))",
      border: "1px solid hsl(var(--border))",
      borderRadius: "6px",
      fontSize: "11px",
    },
  },
  profitStroke: "#22c55e",
  lossStroke: "#ef4444",
  primaryStroke: "hsl(var(--primary))",
};

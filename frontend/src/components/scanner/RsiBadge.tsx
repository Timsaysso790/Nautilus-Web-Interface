interface Props {
  rsi: number;
}

function rsiColor(value: number): string {
  if (value < 30) return "#22c55e";
  if (value < 50) return "#f59e0b";
  if (value < 70) return "#f97316";
  return "#ef4444";
}

export function RsiBadge({ rsi }: Props) {
  const color = rsiColor(rsi);
  return (
    <span
      className="inline-flex items-center gap-1.5 px-2 py-0.5 rounded text-xs font-bold tracking-wide"
      style={{ backgroundColor: `${color}18`, color, boxShadow: `0 0 8px ${color}30` }}
    >
      RSI {typeof rsi === "number" ? rsi.toFixed(1) : "—"}
    </span>
  );
}

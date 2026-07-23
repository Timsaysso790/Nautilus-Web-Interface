interface Props {
  price: number;
  lower: number;
  upper: number;
}

export function BBRangeBar({ price, lower, upper }: Props) {
  const range = upper - lower;
  if (range <= 0) return null;

  const pct = ((price - lower) / range) * 100;
  const clamped = Math.max(0, Math.min(100, pct));

  return (
    <div className="w-full space-y-1">
      <div className="flex justify-between text-[11px] text-gray-500">
        <span>{typeof lower === "number" ? lower.toFixed(2) : "—"}</span>
        <span className="text-gray-400 font-medium">
          {typeof price === "number" ? `$${price.toFixed(2)}` : "—"}
        </span>
        <span>{typeof upper === "number" ? upper.toFixed(2) : "—"}</span>
      </div>
      <div className="relative w-full h-2 bg-gray-800 rounded-full overflow-hidden">
        <div className="absolute inset-0 bg-gradient-to-r from-blue-500/30 via-gray-700/50 to-blue-500/30 rounded-full" />
        <div
          className="absolute top-1/2 -translate-y-1/2 w-3 h-3 rounded-full bg-blue-400 border-2 border-[#0a0e17]"
          style={{ left: `calc(${clamped}% - 6px)`, boxShadow: "0 0 6px rgba(59,130,246,0.6)" }}
        />
      </div>
    </div>
  );
}

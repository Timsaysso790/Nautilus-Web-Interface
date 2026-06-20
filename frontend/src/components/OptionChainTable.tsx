import { useState } from "react";
import { Button } from "@/components/ui/button";
import type { OptionContract, PayoffLeg } from "@/services/optionsService";

interface Props {
  contracts: OptionContract[];
  right: "call" | "put";
  underlyingPrice: number | null;
  onAddLeg?: (leg: PayoffLeg) => void;
}

export function OptionChainTable({ contracts, right, underlyingPrice, onAddLeg }: Props) {
  const [sortBy, setSortBy] = useState<string>("strike");
  const [sortDir, setSortDir] = useState<"asc" | "desc">("asc");

  const handleSort = (col: string) => {
    if (sortBy === col) {
      setSortDir(d => d === "asc" ? "desc" : "asc");
    } else {
      setSortBy(col);
      setSortDir("asc");
    }
  };

  const sorted = [...contracts].sort((a, b) => {
    const aVal = (a as any)[sortBy] ?? 0;
    const bVal = (b as any)[sortBy] ?? 0;
    return sortDir === "asc" ? (aVal > bVal ? 1 : -1) : (aVal < bVal ? 1 : -1);
  });

  const formatPrice = (v: number | null | undefined) => {
    if (v == null || v === 0) return "—";
    return v.toFixed(2);
  };

  const formatPct = (v: number | null | undefined) => {
    if (v == null) return "—";
    return `${(v * 100).toFixed(2)}%`;
  };

  const headerClass = "px-3 py-2 text-xs font-medium text-muted-foreground text-right cursor-pointer hover:text-foreground select-none";
  const cellClass = "px-3 py-2 text-xs text-right font-mono text-foreground";
  const changeClass = (v: number | null | undefined, positive: boolean) => {
    if (v == null) return "text-muted-foreground";
    if (v === 0) return "text-foreground";
    return positive ? (v > 0 ? "text-green-500" : "text-red-500") : (v > 0 ? "text-red-500" : "text-green-500");
  };

  const isOTM = (c: OptionContract) => {
    if (!underlyingPrice) return false;
    return right === "call" ? c.strike > underlyingPrice : c.strike < underlyingPrice;
  };

  return (
    <div className="overflow-x-auto">
      <table className="w-full">
        <thead>
          <tr className="border-b border-border">
            <th className={headerClass} onClick={() => handleSort("strike")}>Strike {sortBy === "strike" ? (sortDir === "asc" ? "▲" : "▼") : ""}</th>
            <th className={headerClass} onClick={() => handleSort("bid")}>Bid</th>
            <th className={headerClass} onClick={() => handleSort("ask")}>Ask</th>
            <th className={headerClass} onClick={() => handleSort("last")}>Last</th>
            <th className={headerClass} onClick={() => handleSort("volume")}>Vol</th>
            <th className={headerClass} onClick={() => handleSort("open_interest")}>OI</th>
            <th className={headerClass} onClick={() => handleSort("implied_volatility")}>IV</th>
            <th className={headerClass} onClick={() => handleSort("delta")}>Δ</th>
            <th className={headerClass} onClick={() => handleSort("gamma")}>Γ</th>
            <th className={headerClass} onClick={() => handleSort("theta")}>Θ</th>
            <th className={headerClass} onClick={() => handleSort("vega")}>ν</th>
            {onAddLeg && <th className="px-3 py-2 text-xs font-medium text-muted-foreground"></th>}
          </tr>
        </thead>
        <tbody>
          {sorted.map(c => (
            <tr
              key={c.symbol}
              className={`border-b border-border hover:bg-muted/50 transition-colors ${isOTM(c) ? 'opacity-60' : ''}`}
            >
              <td className={`${cellClass} font-semibold`}>{c.strike.toFixed(1)}</td>
              <td className={cellClass}>{formatPrice(c.bid)}</td>
              <td className={cellClass}>{formatPrice(c.ask)}</td>
              <td className={cellClass}>{formatPrice(c.last)}</td>
              <td className={cellClass}>{c.volume || "—"}</td>
              <td className={cellClass}>{c.open_interest || "—"}</td>
              <td className={cellClass}>{c.implied_volatility != null ? `${(c.implied_volatility * 100).toFixed(1)}%` : "—"}</td>
              <td className={`${cellClass} ${changeClass(c.delta, true)}`}>{c.delta != null ? c.delta.toFixed(3) : "—"}</td>
              <td className={cellClass}>{c.gamma != null ? c.gamma.toFixed(4) : "—"}</td>
              <td className={`${cellClass} ${changeClass(c.theta, false)}`}>{c.theta != null ? c.theta.toFixed(4) : "—"}</td>
              <td className={cellClass}>{c.vega != null ? c.vega.toFixed(4) : "—"}</td>
              {onAddLeg && (
                <td className="px-3 py-2">
                  <Button
                    size="sm"
                    variant="ghost"
                    onClick={() => onAddLeg({
                      strike: c.strike,
                      right: c.right,
                      quantity: 1,
                      entry_price: c.ask ?? c.last ?? 0,
                    })}
                  >
                    +
                  </Button>
                </td>
              )}
            </tr>
          ))}
        </tbody>
      </table>
      {contracts.length === 0 && (
        <p className="text-sm text-muted-foreground text-center py-4">No contracts available.</p>
      )}
    </div>
  );
}

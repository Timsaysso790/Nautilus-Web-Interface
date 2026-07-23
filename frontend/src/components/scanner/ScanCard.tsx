import { useState } from "react";
import type { ScanEntry, OptionSpread } from "./types";
import { RsiBadge } from "./RsiBadge";
import { BBRangeBar } from "./BBRangeBar";
import { ActionBadge } from "./ActionBadge";

interface Props {
  entry: ScanEntry;
}

export function ScanCard({ entry }: Props) {
  const [spreadsOpen, setSpreadsOpen] = useState(false);
  const isEntry = entry.signal_type === "trigger_entry";
  const hasPassiveNews = entry.news_classification === "passive";
  const hasSpreadData =
    typeof entry.shortDelta === "number" &&
    typeof entry.shortStrike === "number" &&
    Array.isArray(entry.passingSpreads) &&
    entry.passingSpreads.length > 0;

  return (
    <article
      className={[
        "relative rounded-xl border transition-all duration-300 bg-[#0d1321]",
        isEntry
          ? "border-emerald-500/20 bg-emerald-500/[0.03]"
          : "border-gray-800 hover:border-gray-700",
      ].join(" ")}
    >
      <div className="relative p-4 space-y-3">
        {/* Header */}
        <div className="flex items-start justify-between gap-2">
          <div>
            <h3 className="text-lg font-bold text-gray-50 tracking-tight">{entry.ticker}</h3>
            <p className="text-sm text-gray-400">
              ${typeof entry.price === "number" ? entry.price.toFixed(2) : "—"}
            </p>
          </div>
          <ActionBadge
            signalType={entry.signal_type}
            newsClassification={entry.news_classification}
            summary={entry.news_summary}
          />
        </div>

        {/* RSI + DTE + Score */}
        <div className="flex items-center gap-3 flex-wrap">
          <RsiBadge rsi={entry.rsi} />
          {typeof entry.dte === "number" && (
            <span className="px-2 py-0.5 rounded bg-gray-800 text-xs text-gray-400">
              {entry.dte} DTE
            </span>
          )}
          {typeof entry.composite_score === "number" && (
            <span className="px-2 py-0.5 rounded bg-gray-800 text-xs text-gray-400">
              Score: {entry.composite_score}
            </span>
          )}
        </div>

        {/* Option spread badges */}
        {hasSpreadData && (
          <div className="flex items-center gap-3 flex-wrap">
            {typeof entry.shortDelta === "number" && (
              <span className="px-2 py-0.5 rounded bg-blue-900/30 border border-blue-800/30 text-xs text-blue-300">
                Δ {entry.shortDelta.toFixed(3)}
              </span>
            )}
            {typeof entry.shortStrike === "number" && (
              <span className="px-2 py-0.5 rounded bg-violet-900/30 border border-violet-800/30 text-xs text-violet-300">
                Strike {entry.shortStrike.toFixed(1)}
              </span>
            )}
            <button
              onClick={() => setSpreadsOpen(!spreadsOpen)}
              className="px-2 py-0.5 rounded bg-gray-800 text-xs text-gray-400 hover:text-gray-200 transition-colors"
            >
              {entry.passingSpreads!.length} spreads {spreadsOpen ? "▲" : "▼"}
            </button>
          </div>
        )}

        {/* Passing spreads table */}
        {hasSpreadData && spreadsOpen && (
          <SpreadTable spreads={entry.passingSpreads!} />
        )}

        {/* Bollinger Band Range */}
        {typeof entry.bb_lower === "number" && typeof entry.bb_upper === "number" && (
          <div className="space-y-1 pt-1">
            <p className="text-[11px] uppercase tracking-wider text-gray-500 font-medium">BB Range</p>
            <BBRangeBar price={entry.price} lower={entry.bb_lower} upper={entry.bb_upper} />
          </div>
        )}

        {/* News Summary */}
        {hasPassiveNews && entry.news_summary && (
          <div className="pt-1">
            <p className="text-xs text-gray-500 italic leading-relaxed">{entry.news_summary}</p>
          </div>
        )}
      </div>
    </article>
  );
}

function SpreadTable({ spreads }: { spreads: OptionSpread[] }) {
  return (
    <div className="overflow-x-auto pt-1">
      <table className="w-full text-xs text-gray-400 border-collapse">
        <thead>
          <tr className="border-b border-gray-800">
            <th className="text-left py-1 pr-2 font-medium">Width</th>
            <th className="text-left py-1 pr-2 font-medium">Long</th>
            <th className="text-left py-1 pr-2 font-medium">Credit</th>
            <th className="text-left py-1 pr-2 font-medium">Yield</th>
            <th className="text-left py-1 font-medium">Risk</th>
          </tr>
        </thead>
        <tbody>
          {spreads.map((s, i) => (
            <tr key={i} className="border-b border-gray-800/50 hover:bg-gray-800/30">
              <td className="py-1 pr-2">{s.width}</td>
              <td className="py-1 pr-2 font-mono">${s.longStrike.toFixed(1)}</td>
              <td className="py-1 pr-2 font-mono text-emerald-400">${s.netCredit.toFixed(2)}</td>
              <td className="py-1 pr-2 font-mono text-amber-400">{s.yieldPct.toFixed(1)}%</td>
              <td className="py-1 font-mono text-red-400">${s.maxRisk.toFixed(0)}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

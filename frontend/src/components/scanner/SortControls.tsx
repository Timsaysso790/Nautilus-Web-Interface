import type { SortField, SortDir } from "./types";

interface Props {
  sortField: SortField;
  sortDir: SortDir;
  onToggle: (field: SortField) => void;
}

const SORTS: { field: SortField; label: string }[] = [
  { field: "rsi", label: "RSI" },
  { field: "price", label: "Price" },
  { field: "dte", label: "DTE" },
  { field: "composite_score", label: "Score" },
];

export function SortControls({ sortField, sortDir, onToggle }: Props) {
  return (
    <div className="flex items-center gap-2 text-sm">
      <span className="text-gray-500 text-xs uppercase tracking-wider font-medium">Sort</span>
      {SORTS.map(({ field, label }) => {
        const active = sortField === field;
        return (
          <button
            key={field}
            onClick={() => onToggle(field)}
            className={[
              "px-3 py-1.5 rounded-lg text-xs font-medium transition-all duration-200",
              active
                ? "bg-gray-700 text-gray-50"
                : "bg-[#0d1321] text-gray-400 hover:bg-gray-800 hover:text-gray-200",
            ].join(" ")}
          >
            {label}
            {active && <span className="ml-1">{sortDir === "asc" ? "▲" : "▼"}</span>}
          </button>
        );
      })}
    </div>
  );
}

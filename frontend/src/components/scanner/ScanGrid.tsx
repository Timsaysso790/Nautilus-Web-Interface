import type { ScanEntry, SortField, SortDir } from "./types";
import { ScanCard } from "./ScanCard";
import { SortControls } from "./SortControls";
import { FilterToggle } from "./FilterToggle";

interface Props {
  results: ScanEntry[];
  sortField: SortField;
  sortDir: SortDir;
  onToggleSort: (field: SortField) => void;
  hidePassive: boolean;
  onToggleHidePassive: (v: boolean) => void;
  loading: boolean;
  error: string | null;
}

export function ScanGrid({
  results, sortField, sortDir, onToggleSort,
  hidePassive, onToggleHidePassive, loading, error,
}: Props) {
  if (error) {
    return (
      <div className="flex flex-col items-center justify-center py-16 text-gray-500">
        <p className="text-red-400 mb-2">Failed to load scans</p>
        <p className="text-sm text-gray-600">{error}</p>
      </div>
    );
  }

  if (loading && results.length === 0) {
    return (
      <div className="flex items-center justify-center py-16">
        <div className="w-8 h-8 border-2 border-amber-400 border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  if (results.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center py-16 text-gray-500">
        <p className="text-gray-400 mb-1">No scan results for this date</p>
        <p className="text-sm text-gray-600">Scanner data will appear here</p>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <SortControls sortField={sortField} sortDir={sortDir} onToggle={onToggleSort} />
        <FilterToggle hidePassive={hidePassive} onToggle={onToggleHidePassive} />
      </div>
      <p className="text-xs text-gray-500">
        {results.length} {results.length === 1 ? "entry" : "entries"}
      </p>
      <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-3 2xl:grid-cols-4 gap-4">
        {results.map((entry, i) => (
          <ScanCard key={`${entry.ticker}-${i}`} entry={entry} />
        ))}
      </div>
    </div>
  );
}

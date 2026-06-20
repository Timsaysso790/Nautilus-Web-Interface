import { useState, useEffect } from "react";
import { Button } from "@/components/ui/button";
import { dataLakeService, type CatalogSummary, type CatalogEntry } from "@/services/dataLakeService";

interface Props {
  onError: (msg: string) => void;
}

function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

function tickerFromId(id: string): string {
  const match = id.match(/^([A-Za-z]+)/);
  return match ? match[1].toUpperCase() : id;
}

export function CatalogTreeView({ onError }: Props) {
  const [catalog, setCatalog] = useState<CatalogSummary | null>(null);
  const [loading, setLoading] = useState(true);
  const [expandedTypes, setExpandedTypes] = useState<Set<string>>(new Set());
  const [expandedTickers, setExpandedTickers] = useState<Set<string>>(new Set());

  const load = async () => {
    setLoading(true);
    try {
      const data = await dataLakeService.getCatalog();
      setCatalog(data);
    } catch {
      onError("Failed to load catalog");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { load(); }, []);

  const toggleType = (type: string) => {
    setExpandedTypes(prev => {
      const next = new Set(prev);
      if (next.has(type)) next.delete(type);
      else next.add(type);
      return next;
    });
  };

  const toggleTicker = (ticker: string) => {
    setExpandedTickers(prev => {
      const next = new Set(prev);
      if (next.has(ticker)) next.delete(ticker);
      else next.add(ticker);
      return next;
    });
  };

  const handleDelete = async (entry: CatalogEntry) => {
    try {
      await dataLakeService.deleteCatalogEntry(entry.type, entry.id);
      load();
    } catch {
      onError("Failed to delete catalog entry");
    }
  };

  if (loading) return <p className="text-sm text-muted-foreground">Loading catalog...</p>;
  if (!catalog || catalog.instruments.length === 0) {
    return (
      <div className="text-center py-8 text-muted-foreground">
        <p>No data in catalog yet.</p>
        <p className="text-xs mt-1">Download and convert data to populate the catalog.</p>
      </div>
    );
  }

  // Group by type → ticker
  const byType: Record<string, Record<string, { entries: CatalogEntry[]; size: number; files: number }>> = {};
  for (const entry of catalog.instruments) {
    const ticker = tickerFromId(entry.id);
    if (!byType[entry.type]) byType[entry.type] = {};
    if (!byType[entry.type][ticker]) byType[entry.type][ticker] = { entries: [], size: 0, files: 0 };
    byType[entry.type][ticker].entries.push(entry);
    byType[entry.type][ticker].size += entry.total_size_bytes;
    byType[entry.type][ticker].files += entry.total_files;
  }

  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between text-sm text-muted-foreground mb-2">
        <span>{catalog.total_instruments} instruments</span>
        <span>{formatBytes(catalog.total_size_bytes)} total</span>
      </div>

      {Object.entries(byType).map(([type, tickers]) => {
        const tickerCount = Object.keys(tickers).length;
        return (
          <div key={type} className="border rounded-lg">
            <button
              onClick={() => toggleType(type)}
              className="w-full flex items-center justify-between px-4 py-2 text-sm font-medium text-foreground bg-card hover:bg-accent rounded-t-lg"
            >
              <span>{type} ({tickerCount} tickers, {catalog.instruments.filter(e => e.type === type).length} contracts)</span>
              <span className="text-muted-foreground">{expandedTypes.has(type) ? '▼' : '▶'}</span>
            </button>

            {expandedTypes.has(type) && (
              <div className="divide-y">
                {Object.entries(tickers).sort(([a], [b]) => a.localeCompare(b)).map(([ticker, group]) => (
                  <div key={ticker}>
                    <button
                      onClick={() => toggleTicker(ticker)}
                      className="w-full flex items-center justify-between px-4 py-2 text-sm text-left hover:bg-accent/50"
                    >
                      <span className="font-semibold text-foreground">{ticker}</span>
                      <span className="text-xs text-muted-foreground">
                        {group.entries.length} contracts · {formatBytes(group.size)}
                      </span>
                      <span className="text-muted-foreground text-xs">{expandedTickers.has(ticker) ? '▼' : '▶'}</span>
                    </button>

                    {expandedTickers.has(ticker) && (
                      <div className="divide-y border-t">
                        {group.entries.sort((a, b) => a.id.localeCompare(b.id)).map(entry => (
                          <div key={entry.id} className="flex items-center justify-between px-6 py-2 text-sm">
                            <div className="flex-1 min-w-0">
                              <p className="text-foreground truncate">{entry.id}</p>
                              <p className="text-xs text-muted-foreground">
                                {entry.total_files} files · {formatBytes(entry.total_size_bytes)}
                              </p>
                            </div>
                            <Button variant="destructive" size="sm" onClick={() => handleDelete(entry)}>Delete</Button>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                ))}
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}

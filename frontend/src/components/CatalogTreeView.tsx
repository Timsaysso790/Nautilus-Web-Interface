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

export function CatalogTreeView({ onError }: Props) {
  const [catalog, setCatalog] = useState<CatalogSummary | null>(null);
  const [loading, setLoading] = useState(true);
  const [expandedTypes, setExpandedTypes] = useState<Set<string>>(new Set());

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

  const grouped: Record<string, CatalogEntry[]> = {};
  for (const entry of catalog.instruments) {
    if (!grouped[entry.type]) grouped[entry.type] = [];
    grouped[entry.type].push(entry);
  }

  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between text-sm text-muted-foreground mb-2">
        <span>{catalog.total_instruments} instruments</span>
        <span>{formatBytes(catalog.total_size_bytes)} total</span>
      </div>

      {Object.entries(grouped).map(([type, entries]) => (
        <div key={type} className="border rounded-lg">
          <button
            onClick={() => toggleType(type)}
            className="w-full flex items-center justify-between px-4 py-2 text-sm font-medium text-foreground bg-card hover:bg-accent rounded-t-lg"
          >
            <span>{type} ({entries.length})</span>
            <span className="text-muted-foreground">{expandedTypes.has(type) ? '▼' : '▶'}</span>
          </button>

          {expandedTypes.has(type) && (
            <div className="divide-y">
              {entries.map(entry => (
                <div key={entry.id} className="flex items-center justify-between px-4 py-2 text-sm">
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
  );
}

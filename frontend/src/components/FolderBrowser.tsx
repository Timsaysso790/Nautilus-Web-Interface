import { useState, useEffect, useCallback } from "react";
import { dataLakeService, type BrowseResult } from "@/services/dataLakeService";

interface Props {
  onSelect: (path: string) => void;
  onConvert: (path: string, instrument: string) => void;
  converting?: boolean;
}

export function FolderBrowser({ onSelect, onConvert, converting }: Props) {
  const [browse, setBrowse] = useState<BrowseResult | null>(null);
  const [currentPath, setCurrentPath] = useState("");
  const [history, setHistory] = useState<string[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  const load = useCallback(async (path: string) => {
    setLoading(true);
    setError("");
    try {
      const res = await dataLakeService.browseFolder(path || undefined);
      setBrowse(res);
      setCurrentPath(res.current_path);
    } catch {
      setError("Failed to browse directory");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { load(""); }, [load]);

  const navigate = (path: string) => {
    setHistory(prev => [...prev, currentPath]);
    load(path);
  };

  const goBack = () => {
    if (history.length === 0) return;
    const prev = history[history.length - 1];
    setHistory(prev => prev.slice(0, -1));
    load(prev);
  };

  const breadcrumbs = currentPath ? currentPath.split("/") : [];

  const handleBreadcrumb = (idx: number) => {
    const target = breadcrumbs.slice(0, idx + 1).join("/");
    setHistory(prev => [...prev, currentPath]);
    load(target);
  };

  const instrument = currentPath.split("/").pop() || currentPath;

  return (
    <div className="border border-border rounded-lg bg-card">
      {/* Breadcrumbs */}
      <div className="flex items-center gap-1 px-3 py-2 border-b border-border bg-muted/20 text-xs">
        {history.length > 0 && (
          <button
            onClick={goBack}
            className="mr-1 px-1.5 py-0.5 rounded hover:bg-accent text-muted-foreground"
          >
            ←
          </button>
        )}
        <button
          onClick={() => { setHistory([]); load(""); }}
          className={`px-1.5 py-0.5 rounded hover:bg-accent ${!currentPath ? "font-semibold" : "text-muted-foreground"}`}
        >
          Root
        </button>
        {breadcrumbs.map((seg, i) => (
          <span key={i} className="flex items-center gap-1">
            <span className="text-muted-foreground">/</span>
            <button
              onClick={() => handleBreadcrumb(i)}
              className={`px-1.5 py-0.5 rounded hover:bg-accent ${i === breadcrumbs.length - 1 ? "font-semibold" : "text-muted-foreground"}`}
            >
              {seg}
            </button>
          </span>
        ))}
      </div>

      {/* Directory listing */}
      <div className="p-3 space-y-1 min-h-[200px] max-h-[400px] overflow-y-auto">
        {loading && (
          <div className="text-center py-10 text-sm text-muted-foreground">Loading…</div>
        )}
        {error && (
          <div className="text-center py-10 text-sm text-destructive">{error}</div>
        )}
        {!loading && !error && browse && (
          <>
            {browse.subdirectories.length === 0 && browse.parquet_count === 0 && (
              <div className="text-center py-10 text-sm text-muted-foreground">Empty directory</div>
            )}
            {browse.subdirectories.map(dir => (
              <button
                key={dir.path}
                onClick={() => navigate(dir.path)}
                className="w-full flex items-center gap-2 px-3 py-2 rounded-lg hover:bg-accent text-left text-sm"
              >
                <span className="text-muted-foreground">📁</span>
                <span className="flex-1 font-medium text-foreground">{dir.name}</span>
              </button>
            ))}
            {browse.parquet_count > 0 && (
              <div className="px-3 py-2 text-xs text-muted-foreground border-t border-border/50 mt-2 pt-2">
                {browse.parquet_count} parquet file{browse.parquet_count !== 1 ? "s" : ""} in this directory
                {browse.total_parquet_recursive > browse.parquet_count && (
                  <span> · {browse.total_parquet_recursive} total including subdirectories</span>
                )}
              </div>
            )}
          </>
        )}
      </div>

      {/* Convert action */}
      {currentPath && browse && browse.total_parquet_recursive > 0 && (
        <div className="px-3 py-2 border-t border-border flex items-center justify-between">
          <span className="text-xs text-muted-foreground">
            {browse.total_parquet_recursive} parquet file{browse.total_parquet_recursive !== 1 ? "s" : ""} to convert
          </span>
          <button
            onClick={() => { onSelect(currentPath); onConvert(currentPath, instrument); }}
            disabled={converting}
            className="px-4 py-1.5 bg-primary text-primary-foreground rounded-lg text-xs font-semibold hover:opacity-90 disabled:opacity-50"
          >
            {converting ? "Converting…" : `Convert ${instrument}`}
          </button>
        </div>
      )}

      {/* Current path display */}
      {currentPath && (
        <div className="px-3 py-1.5 border-t border-border bg-muted/10 text-xs text-muted-foreground">
          Selected: <span className="font-mono">{currentPath}</span>
        </div>
      )}
    </div>
  );
}

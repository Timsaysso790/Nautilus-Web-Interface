import { useState, useEffect, useCallback, useRef } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import {
  AlertDialog,
  AlertDialogTrigger,
  AlertDialogContent,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogCancel,
  AlertDialogAction,
} from "@/components/ui/alert-dialog";
import { dataLakeService, type NvmeCacheEntry, type ConvertTaskStatus } from "@/services/dataLakeService";
import { useNotification } from "@/contexts/NotificationContext";

function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  if (bytes < 1024 * 1024 * 1024) return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  return `${(bytes / (1024 * 1024 * 1024)).toFixed(2)} GB`;
}

export default function NvmeCachePanel() {
  const { addNotification } = useNotification();
  const [cache, setCache] = useState<NvmeCacheEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [converting, setConverting] = useState<string | null>(null);
  const [convertProgress, setConvertProgress] = useState<ConvertTaskStatus | null>(null);
  const [clearAllOpen, setClearAllOpen] = useState(false);
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const notify = useCallback((msg: string, type: "success" | "error" | "info" = "info") => {
    addNotification(type, msg);
  }, [addNotification]);

  const loadCache = useCallback(async () => {
    try {
      const res = await dataLakeService.listCache();
      setCache(res.cache);
    } catch {
      notify("Failed to load cache", "error");
    } finally {
      setLoading(false);
    }
  }, [notify]);

  useEffect(() => {
    loadCache();
    return () => { if (pollRef.current) clearInterval(pollRef.current); };
  }, []);

  const startPolling = useCallback((taskId: string) => {
    if (pollRef.current) clearInterval(pollRef.current);
    pollRef.current = setInterval(async () => {
      try {
        const status = await dataLakeService.getConvertStatus(taskId);
        setConvertProgress(status);
        if (status.status === "completed") {
          clearInterval(pollRef.current!);
          pollRef.current = null;
          setConverting(null);
          setConvertProgress(null);
          notify(`Converted: ${status.converted} records, ${status.errors} errors`, status.errors > 0 ? "error" : "success");
          loadCache();
        } else if (status.status === "error") {
          clearInterval(pollRef.current!);
          pollRef.current = null;
          setConverting(null);
          setConvertProgress(null);
          notify(`Conversion failed: ${status.error_detail || "Unknown error"}`, "error");
        }
      } catch {
        // keep polling
      }
    }, 1000);
  }, [notify, loadCache]);

  const handleConvert = async (ticker: string) => {
    setConverting(ticker);
    setConvertProgress({ status: "pending", total_files: 0, processed: 0, current_file: "", converted: 0, skipped: 0, errors: 0 });
    try {
      const res = await dataLakeService.convertToCache(ticker);
      startPolling(res.task_id);
    } catch {
      notify("Failed to start conversion", "error");
      setConverting(null);
      setConvertProgress(null);
    }
  };

  const handleClear = async (ticker: string) => {
    try {
      await dataLakeService.clearCache(ticker);
      notify(`Cleared ${ticker} from cache`, "success");
      loadCache();
    } catch {
      notify("Failed to clear cache", "error");
    }
  };

  const handleClearAll = async () => {
    try {
      await dataLakeService.clearCache();
      notify("Cleared all cache", "success");
      loadCache();
    } catch {
      notify("Failed to clear cache", "error");
    } finally {
      setClearAllOpen(false);
    }
  };

  const totalSize = cache.reduce((s, e) => s + e.size_bytes, 0);

  return (
    <div className="space-y-6">
      {/* Stats */}
      <div className="grid grid-cols-2 gap-4">
        <Card className="py-3 px-4">
          <p className="text-xs text-muted-foreground">Cached Tickers</p>
          <p className="text-2xl font-bold">{cache.length}</p>
        </Card>
        <Card className="py-3 px-4">
          <p className="text-xs text-muted-foreground">Total Cache Size</p>
          <p className="text-2xl font-bold">{formatBytes(totalSize)}</p>
        </Card>
      </div>

      {/* Conversion progress */}
      {converting && convertProgress && (
        <Card>
          <CardContent className="pt-4 space-y-2">
            <div className="flex justify-between text-xs text-muted-foreground">
              <span>Converting {converting}...</span>
              <span>{convertProgress.converted} records</span>
            </div>
            <Progress
              value={convertProgress.total_files > 0
                ? (convertProgress.processed / convertProgress.total_files) * 100
                : undefined}
            />
          </CardContent>
        </Card>
      )}

      {/* Cache entries */}
      <div>
        <div className="flex items-center justify-between mb-3">
          <h3 className="font-semibold text-foreground">NVMe Cache</h3>
          <div className="flex gap-2">
            <Button variant="outline" size="sm" onClick={loadCache} disabled={loading}>
              Refresh
            </Button>
            {cache.length > 0 && (
              <AlertDialog open={clearAllOpen} onOpenChange={setClearAllOpen}>
                <AlertDialogTrigger asChild>
                  <Button variant="destructive" size="sm">Clear All</Button>
                </AlertDialogTrigger>
                <AlertDialogContent>
                  <AlertDialogHeader>
                    <AlertDialogTitle>Clear all cache?</AlertDialogTitle>
                    <AlertDialogDescription>
                      This will remove all {cache.length} cached tickers ({formatBytes(totalSize)}).
                      Data can be re-cached from the archive at any time.
                    </AlertDialogDescription>
                  </AlertDialogHeader>
                  <AlertDialogFooter>
                    <AlertDialogCancel>Cancel</AlertDialogCancel>
                    <AlertDialogAction onClick={handleClearAll} className="bg-destructive text-destructive-foreground hover:bg-destructive/90">
                      Clear All
                    </AlertDialogAction>
                  </AlertDialogFooter>
                </AlertDialogContent>
              </AlertDialog>
            )}
          </div>
        </div>

        {loading ? (
          <p className="text-sm text-muted-foreground">Loading...</p>
        ) : cache.length === 0 ? (
          <Card className="py-8 text-center">
            <p className="text-sm text-muted-foreground">No tickers in NVMe cache.</p>
            <p className="text-xs text-muted-foreground mt-1">Download data in the Market Data tab, then convert here.</p>
          </Card>
        ) : (
          <div className="space-y-2">
            {cache.map(entry => (
              <Card key={entry.ticker} className="flex flex-row items-center justify-between py-3 px-4 gap-4">
                <div className="flex items-center gap-3 min-w-0">
                  <div className="w-9 h-9 rounded-lg bg-primary/10 flex items-center justify-center text-primary font-bold text-sm shrink-0">
                    {entry.ticker.slice(0, 2)}
                  </div>
                  <div className="min-w-0">
                    <p className="font-semibold text-sm">{entry.ticker}</p>
                    <Badge variant="secondary" className="text-[10px]">{formatBytes(entry.size_bytes)}</Badge>
                  </div>
                </div>
                <div className="flex items-center gap-2 shrink-0">
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => handleConvert(entry.ticker)}
                    disabled={converting === entry.ticker}
                  >
                    {converting === entry.ticker ? "Converting..." : "Re-cache"}
                  </Button>
                  <Button
                    variant="destructive"
                    size="sm"
                    onClick={() => handleClear(entry.ticker)}
                    disabled={converting === entry.ticker}
                  >
                    Clear
                  </Button>
                </div>
              </Card>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

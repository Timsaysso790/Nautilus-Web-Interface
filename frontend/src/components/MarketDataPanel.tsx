import { useState, useEffect, useCallback, useRef } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import { Input } from "@/components/ui/input";
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
import { dataLakeService, type TickerCoverage, type ConvertTaskStatus } from "@/services/dataLakeService";
import { useNotification } from "@/contexts/NotificationContext";

function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

function TickerCard({
  ticker,
  onDelete,
  onRefresh,
}: {
  ticker: TickerCoverage;
  onDelete: () => void;
  onRefresh: () => void;
}) {
  const [deleting, setDeleting] = useState(false);
  const handleDelete = async () => {
    setDeleting(true);
    try {
      await dataLakeService.deleteTicker(ticker.ticker);
      onRefresh();
    } finally {
      setDeleting(false);
    }
  };
  return (
    <Card className="flex flex-row items-center justify-between py-3 px-4 gap-4">
      <div className="flex items-center gap-3 min-w-0">
        <div className="w-9 h-9 rounded-lg bg-primary/10 flex items-center justify-center text-primary font-bold text-sm shrink-0">
          {ticker.ticker.slice(0, 2)}
        </div>
        <div className="min-w-0">
          <p className="font-semibold text-sm">{ticker.ticker}</p>
          <div className="flex flex-wrap gap-1 mt-1">
            {ticker.data_types.map(dt => (
              <Badge key={dt} variant="secondary" className="text-[10px]">{dt}</Badge>
            ))}
          </div>
        </div>
      </div>
      <div className="flex items-center gap-4 text-xs text-muted-foreground shrink-0">
        <span>{ticker.contracts} contracts</span>
        <span>{ticker.total_files} files</span>
        <span>{formatBytes(ticker.total_size_bytes)}</span>
      </div>
      <AlertDialog>
        <AlertDialogTrigger asChild>
          <Button variant="destructive" size="sm" disabled={deleting}>Delete</Button>
        </AlertDialogTrigger>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete {ticker.ticker}?</AlertDialogTitle>
            <AlertDialogDescription>
              This will permanently remove all data for {ticker.ticker} ({ticker.contracts} contracts, {ticker.total_files} files).
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={handleDelete} className="bg-destructive text-destructive-foreground hover:bg-destructive/90">
              {deleting ? "Deleting..." : "Delete"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </Card>
  );
}

export default function MarketDataPanel() {
  const { addNotification } = useNotification();
  const [tickers, setTickers] = useState<TickerCoverage[]>([]);
  const [loading, setLoading] = useState(true);

  // Download form
  const [symbol, setSymbol] = useState("");
  const [startDate, setStartDate] = useState("");
  const [endDate, setEndDate] = useState("");
  const [downloading, setDownloading] = useState(false);
  const [downloadProgress, setDownloadProgress] = useState<ConvertTaskStatus | null>(null);
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const notify = useCallback((msg: string, type: "success" | "error" | "info" = "info") => {
    addNotification(type, msg);
  }, [addNotification]);

  const loadTickers = useCallback(async () => {
    try {
      const res = await dataLakeService.listTickers();
      setTickers(res.tickers);
    } catch {
      notify("Failed to load tickers", "error");
    } finally {
      setLoading(false);
    }
  }, [notify]);

  useEffect(() => {
    loadTickers();
  }, []);

  const startPolling = useCallback((taskId: string) => {
    if (pollRef.current) clearInterval(pollRef.current);
    pollRef.current = setInterval(async () => {
      try {
        const status = await dataLakeService.getConvertStatus(taskId);
        setDownloadProgress(status);
        if (status.status === "completed") {
          clearInterval(pollRef.current!);
          pollRef.current = null;
          setDownloading(false);
          setDownloadProgress(null);
          notify(`Downloaded: ${status.converted} bars, ${status.skipped} skipped`, status.errors > 0 ? "error" : "success");
          loadTickers();
        } else if (status.status === "error") {
          clearInterval(pollRef.current!);
          pollRef.current = null;
          setDownloading(false);
          setDownloadProgress(null);
          notify(`Download failed: ${status.error_detail || "Unknown error"}`, "error");
        }
      } catch {
        // keep polling
      }
    }, 1000);
  }, [notify, loadTickers]);

  const handleDownload = async () => {
    if (!symbol.trim() || !startDate || !endDate) return;
    setDownloading(true);
    setDownloadProgress({ status: "pending", total_files: 0, processed: 0, current_file: "", converted: 0, skipped: 0, errors: 0 });
    try {
      const res = await dataLakeService.thetaDownload({
        symbol: symbol.trim().toUpperCase(),
        start_date: startDate,
        end_date: endDate,
      });
      setSymbol("");
      startPolling(res.task_id);
    } catch {
      notify("Failed to start download", "error");
      setDownloading(false);
      setDownloadProgress(null);
    }
  };

  const totalSize = tickers.reduce((s, t) => s + t.total_size_bytes, 0);
  const totalFiles = tickers.reduce((s, t) => s + t.total_files, 0);

  return (
    <div className="space-y-6">
      {/* Stats bar */}
      <div className="grid grid-cols-3 gap-4">
        <Card className="py-3 px-4">
          <p className="text-xs text-muted-foreground">Tickers</p>
          <p className="text-2xl font-bold">{tickers.length}</p>
        </Card>
        <Card className="py-3 px-4">
          <p className="text-xs text-muted-foreground">Total Files</p>
          <p className="text-2xl font-bold">{totalFiles.toLocaleString()}</p>
        </Card>
        <Card className="py-3 px-4">
          <p className="text-xs text-muted-foreground">Total Size</p>
          <p className="text-2xl font-bold">{formatBytes(totalSize)}</p>
        </Card>
      </div>

      {/* Download form */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Download from ThetaData</CardTitle>
          <CardDescription>
            Download tick-level data from ThetaData and aggregate to 5-min bars.
            Requires a configured ThetaData API key in Keys & Connections.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="flex gap-3 items-end">
            <div className="flex-1">
              <label className="text-xs text-muted-foreground mb-1 block">Symbol</label>
              <Input
                value={symbol}
                onChange={e => setSymbol(e.target.value)}
                placeholder="e.g. AAPL"
                disabled={downloading}
              />
            </div>
            <div className="w-40">
              <label className="text-xs text-muted-foreground mb-1 block">Start Date</label>
              <Input
                type="date"
                value={startDate}
                onChange={e => setStartDate(e.target.value)}
                disabled={downloading}
              />
            </div>
            <div className="w-40">
              <label className="text-xs text-muted-foreground mb-1 block">End Date</label>
              <Input
                type="date"
                value={endDate}
                onChange={e => setEndDate(e.target.value)}
                disabled={downloading}
              />
            </div>
            <Button onClick={handleDownload} disabled={downloading || !symbol.trim() || !startDate || !endDate}>
              {downloading ? "Downloading..." : "Download"}
            </Button>
          </div>

          {downloading && downloadProgress && (
            <div className="mt-4 space-y-2">
              <div className="flex justify-between text-xs text-muted-foreground">
                <span>{downloadProgress.current_file || "Starting..."}</span>
                <span>{downloadProgress.converted} bars</span>
              </div>
              <Progress
                value={downloadProgress.total_files > 0
                  ? (downloadProgress.converted / downloadProgress.total_files) * 100
                  : undefined}
              />
            </div>
          )}
        </CardContent>
      </Card>

      {/* Ticker list */}
      <div>
        <div className="flex items-center justify-between mb-3">
          <h3 className="font-semibold text-foreground">Downloaded Tickers</h3>
          <Button variant="outline" size="sm" onClick={loadTickers} disabled={loading}>
            Refresh
          </Button>
        </div>
        {loading ? (
          <p className="text-sm text-muted-foreground">Loading...</p>
        ) : tickers.length === 0 ? (
          <Card className="py-8 text-center">
            <p className="text-sm text-muted-foreground">No tickers downloaded yet.</p>
            <p className="text-xs text-muted-foreground mt-1">Use the form above to download market data.</p>
          </Card>
        ) : (
          <div className="space-y-2">
            {tickers.map(t => (
              <TickerCard key={t.ticker} ticker={t} onDelete={() => {}} onRefresh={loadTickers} />
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

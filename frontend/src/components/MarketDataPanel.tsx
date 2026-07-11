import { useState, useEffect, useCallback, useRef } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import { Input } from "@/components/ui/input";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
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

const TIERS = [
  { value: "free", label: "Free (EOD only, 2023+, 30 req/min, no Greeks)" },
  { value: "value", label: "Value ($40/mo — 1-min OHLC 2021+, 2 concurrent, 15-min delay)" },
  { value: "standard", label: "Standard ($80/mo — 1-min OHLC 2016+, 4 concurrent, real-time, all Greeks)" },
  { value: "pro", label: "Pro ($160/mo — tick-level 2012+, 8 concurrent, full trade Greeks)" },
];

const TIER_DATA_TYPES: Record<string, string[]> = {
  free: ["eod_bars"],
  value: ["5min_bars"],
  standard: ["5min_bars", "option_greeks_eod"],
  pro: ["5min_bars", "option_greeks_eod"],
};

const TIER_FIRST_ACCESS: Record<string, string> = {
  free: "2023-06-01",
  value: "2021-01-01",
  standard: "2016-01-01",
  pro: "2012-06-01",
};

function TickerCheckbox({
  ticker,
  checked,
  onToggle,
}: {
  ticker: TickerCoverage;
  checked: boolean;
  onToggle: () => void;
}) {
  return (
    <label className="flex items-center gap-3 py-2 px-3 rounded hover:bg-muted/50 cursor-pointer">
      <Checkbox checked={checked} onCheckedChange={onToggle} />
      <div className="flex-1 min-w-0">
        <p className="font-semibold text-sm">{ticker.ticker}</p>
        <div className="flex flex-wrap gap-1 mt-1">
          {ticker.bars_date_range && (
            <Badge variant="secondary" className="text-[10px]">Bars: {ticker.bars_date_range}</Badge>
          )}
          {ticker.greeks_date_range && (
            <Badge variant="outline" className="text-[10px]">Greeks: {ticker.greeks_date_range}</Badge>
          )}
        </div>
      </div>
      <div className="text-xs text-muted-foreground shrink-0">
        {formatBytes(ticker.total_size_bytes)}
      </div>
    </label>
  );
}

export default function MarketDataPanel() {
  const { addNotification } = useNotification();
  const [tickers, setTickers] = useState<TickerCoverage[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedTickers, setSelectedTickers] = useState<Set<string>>(new Set());

  // Tier selector (persisted to localStorage)
  const [tier, setTier] = useState(() => localStorage.getItem("theta_tier") || "free");

  // Batch download form
  const [newSymbols, setNewSymbols] = useState("");
  const [startDate, setStartDate] = useState("");
  const [endDate, setEndDate] = useState("");
  const [downloadBars, setDownloadBars] = useState(true);
  const [downloadGreeks, setDownloadGreeks] = useState(false);
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

  // Persist tier selection
  useEffect(() => {
    localStorage.setItem("theta_tier", tier);
    const dt = TIER_DATA_TYPES[tier] || [];
    setDownloadBars(dt.includes("5min_bars") || dt.includes("eod_bars"));
    setDownloadGreeks(dt.includes("option_greeks_eod"));
  }, [tier]);

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
          notify(`Downloaded: ${status.converted} records, ${status.skipped} skipped`, status.errors > 0 ? "error" : "success");
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

  const handleBatchDownload = async () => {
    const symbols = [...selectedTickers];
    if (newSymbols.trim()) {
      symbols.push(...newSymbols.trim().toUpperCase().split(/[\s,]+/).filter(Boolean));
    }
    if (symbols.length === 0 || !startDate || !endDate) return;

    setDownloading(true);
    setDownloadProgress({ status: "pending", total_files: 0, processed: 0, current_file: "", converted: 0, skipped: 0, errors: 0 });
    try {
      const res = await dataLakeService.batchDownload({
        symbols: [...new Set(symbols)],
        start_date: startDate,
        end_date: endDate,
        tier,
        bars: downloadBars,
        greeks: downloadGreeks,
      });
      setNewSymbols("");
      startPolling(res.task_id);
    } catch {
      notify("Failed to start batch download", "error");
      setDownloading(false);
      setDownloadProgress(null);
    }
  };

  const handleTierChange = (value: string) => {
    setTier(value);
    setSelectedTickers(new Set());
  };

  const toggleTicker = (ticker: string) => {
    setSelectedTickers(prev => {
      const next = new Set(prev);
      if (next.has(ticker)) next.delete(ticker);
      else next.add(ticker);
      return next;
    });
  };

  const toggleAll = () => {
    if (selectedTickers.size === tickers.length) {
      setSelectedTickers(new Set());
    } else {
      setSelectedTickers(new Set(tickers.map(t => t.ticker)));
    }
  };

  const totalSize = tickers.reduce((s, t) => s + t.total_size_bytes, 0);
  const totalFiles = tickers.reduce((s, t) => s + t.total_files, 0);
  const dataTypes = TIER_DATA_TYPES[tier] || [];
  const firstAccess = TIER_FIRST_ACCESS[tier] || "2016-01-01";

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

      {/* Tier selector */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base">ThetaData Tier</CardTitle>
          <CardDescription>
            Select your subscription tier. Tier controls available data types, date ranges, and download concurrency.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <Select value={tier} onValueChange={handleTierChange}>
            <SelectTrigger className="w-full">
              <SelectValue placeholder="Select tier" />
            </SelectTrigger>
            <SelectContent>
              {TIERS.map(t => (
                <SelectItem key={t.value} value={t.value}>{t.label}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </CardContent>
      </Card>

      {/* Batch download form */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Batch Download</CardTitle>
          <CardDescription>
            Select existing tickers or enter new ones. Available data: {dataTypes.join(", ")}. First access: {firstAccess}.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex gap-3 items-end">
            <div className="flex-1">
              <label className="text-xs text-muted-foreground mb-1 block">New Tickers (comma/space separated)</label>
              <Input
                value={newSymbols}
                onChange={e => setNewSymbols(e.target.value)}
                placeholder="e.g. AAPL, SPY, QQQ"
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
          </div>

          {/* Data type checkboxes */}
          <div className="flex gap-4 items-center">
            {dataTypes.includes("eod_bars") && (
              <label className="flex items-center gap-2 text-sm">
                <Checkbox checked={downloadBars} onCheckedChange={c => setDownloadBars(c === true)} disabled={downloading} />
                EOD Bars
              </label>
            )}
            {dataTypes.includes("5min_bars") && (
              <label className="flex items-center gap-2 text-sm">
                <Checkbox checked={downloadBars} onCheckedChange={c => setDownloadBars(c === true)} disabled={downloading} />
                5-min Bars
              </label>
            )}
            <label className="flex items-center gap-2 text-sm">
              <Checkbox
                checked={downloadGreeks}
                onCheckedChange={c => setDownloadGreeks(c === true)}
                disabled={downloading || !dataTypes.includes("option_greeks_eod")}
              />
              Option Greeks EOD
            </label>
          </div>

          <Button
            onClick={handleBatchDownload}
            disabled={downloading || (selectedTickers.size === 0 && !newSymbols.trim()) || !startDate || !endDate}
          >
            {downloading ? "Downloading..." : `Download Batch (${selectedTickers.size + (newSymbols.trim() ? newSymbols.trim().split(/[\s,]+/).filter(Boolean).length : 0)} tickers)`}
          </Button>

          {downloading && downloadProgress && (
            <div className="space-y-2">
              <div className="flex justify-between text-xs text-muted-foreground">
                <span>{downloadProgress.current_file || "Starting..."}</span>
                <span>{downloadProgress.converted} records</span>
              </div>
              <Progress
                value={downloadProgress.total_files > 0
                  ? (downloadProgress.processed / downloadProgress.total_files) * 100
                  : undefined}
              />
            </div>
          )}
        </CardContent>
      </Card>

      {/* Existing ticker checklist */}
      <div>
        <div className="flex items-center justify-between mb-3">
          <h3 className="font-semibold text-foreground">Downloaded Tickers</h3>
          <div className="flex gap-2">
            <Button variant="outline" size="sm" onClick={toggleAll}>
              {selectedTickers.size === tickers.length ? "Deselect All" : "Select All"}
            </Button>
            <Button variant="outline" size="sm" onClick={loadTickers} disabled={loading}>
              Refresh
            </Button>
          </div>
        </div>
        {loading ? (
          <p className="text-sm text-muted-foreground">Loading...</p>
        ) : tickers.length === 0 ? (
          <Card className="py-8 text-center">
            <p className="text-sm text-muted-foreground">No tickers downloaded yet.</p>
            <p className="text-xs text-muted-foreground mt-1">Use the form above to download market data.</p>
          </Card>
        ) : (
          <Card>
            <CardContent className="p-2">
              {tickers.map(t => (
                <TickerCheckbox
                  key={t.ticker}
                  ticker={t}
                  checked={selectedTickers.has(t.ticker)}
                  onToggle={() => toggleTicker(t.ticker)}
                />
              ))}
            </CardContent>
          </Card>
        )}
      </div>
    </div>
  );
}

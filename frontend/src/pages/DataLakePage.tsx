import { useState, useEffect, useCallback, useRef } from "react";
import { useLocation } from "wouter";
import { Button } from "@/components/ui/button";
import { DataSourceCard } from "@/components/DataSourceCard";
import { DownloadJobForm } from "@/components/DownloadJobForm";
import { JobProgressCard } from "@/components/JobProgressCard";
import { CatalogTreeView } from "@/components/CatalogTreeView";
import { FolderBrowser } from "@/components/FolderBrowser";
import MarketDataPanel from "@/components/MarketDataPanel";
import NvmeCachePanel from "@/components/NvmeCachePanel";
import { dataLakeService, type ConvertTaskStatus, type DataSource, type DownloadJob } from "@/services/dataLakeService";
import { useNotification } from "@/contexts/NotificationContext";
import AppLayout from "@/components/AppLayout";

type Tab = "marketdata" | "catalog" | "convert" | "nvme_cache" | "backtests" | "sources";

const TABS: { key: Tab; label: string }[] = [
  { key: "marketdata", label: "Market Data" },
  { key: "catalog", label: "Data Browser" },
  { key: "convert", label: "Convert & Ingest" },
  { key: "nvme_cache", label: "NVMe Cache" },
  { key: "backtests", label: "Backtest Results" },
  { key: "sources", label: "Keys & Connections" },
];

export default function DataLakePage() {
  const [, navigate] = useLocation();
  const { addNotification } = useNotification();
  const [tab, setTab] = useState<Tab>(() => {
    const params = new URLSearchParams(window.location.search);
    const t = params.get("tab") as Tab | null;
    return t && TABS.some(tab => tab.key === t) ? t : "sources";
  });
  const [sources, setSources] = useState<DataSource[]>([]);
  const [jobs, setJobs] = useState<DownloadJob[]>([]);
  const [importPath, setImportPath] = useState("");
  const [instrumentFilter, setInstrumentFilter] = useState("");
  const [selectedPath, setSelectedPath] = useState("");
  const [converting, setConverting] = useState(false);
  const [convertProgress, setConvertProgress] = useState<ConvertTaskStatus | null>(null);
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const notify = useCallback((msg: string, type: "success" | "error" | "info" = "info") => {
    addNotification(type, msg);
  }, [addNotification]);

  const loadSources = useCallback(async () => {
    try {
      const res = await dataLakeService.listSources();
      setSources(res.sources);
    } catch { notify("Failed to load sources", "error"); }
  }, [notify]);

  const loadJobs = useCallback(async () => {
    try {
      const res = await dataLakeService.listJobs();
      setJobs(res.jobs);
    } catch { notify("Failed to load jobs", "error"); }
  }, [notify]);

  useEffect(() => {
    loadSources();
    loadJobs();
  }, []);

  const handleTestSource = async (id: string) => {
    try {
      const res = await dataLakeService.testSource(id);
      notify(res.connected ? "Connected!" : `Not connected: ${res.error}`, res.connected ? "success" : "error");
    } catch { notify("Test failed", "error"); }
  };

  const handleDeleteSource = async (id: string) => {
    try {
      await dataLakeService.deleteSource(id);
      notify("Source deleted", "success");
      loadSources();
    } catch { notify("Failed to delete source", "error"); }
  };

  const handleConvertJob = async (id: string) => {
    try {
      const res = await dataLakeService.convertJob(id);
      notify(`Converted: ${res.stats.converted} ok, ${res.stats.errors} errors`, res.stats.errors > 0 ? "error" : "success");
      loadJobs();
    } catch { notify("Conversion failed", "error"); }
  };

  const handleDeleteJob = async (id: string) => {
    try {
      await dataLakeService.deleteJob(id);
      notify("Job deleted", "success");
      loadJobs();
    } catch { notify("Failed to delete job", "error"); }
  };

  const handleImport = async () => {
    if (!importPath.trim()) return;
    try {
      const res = await dataLakeService.importData(importPath.trim(), instrumentFilter.trim() || undefined);
      notify(`Imported: ${res.stats.converted} files, ${res.stats.errors} errors`, res.stats.errors > 0 ? "error" : "success");
      setImportPath("");
      setInstrumentFilter("");
    } catch { notify("Import failed", "error"); }
  };

  const handleConvertPath = async () => {
    if (!importPath.trim()) return;
    try {
      const res = await dataLakeService.convertData(importPath.trim(), instrumentFilter.trim() || undefined);
      notify(`Conversion task started: ${res.task_id}`, "success");
      setImportPath("");
      setInstrumentFilter("");
    } catch { notify("Conversion failed", "error"); }
  };

  const startPolling = useCallback((taskId: string) => {
    if (pollRef.current) clearInterval(pollRef.current);
    pollRef.current = setInterval(async () => {
      try {
        const status = await dataLakeService.getConvertStatus(taskId);
        setConvertProgress(status);
        if (status.status === "completed") {
          clearInterval(pollRef.current!);
          pollRef.current = null;
          setConverting(false);
          setConvertProgress(null);
          notify(`Converted: ${status.converted} files, ${status.skipped} skipped, ${status.errors} errors`, status.errors > 0 ? "error" : "success");
          loadJobs();
        } else if (status.status === "error") {
          clearInterval(pollRef.current!);
          pollRef.current = null;
          setConverting(false);
          setConvertProgress(null);
          notify(`Conversion failed: ${status.error_detail || "Unknown error"}`, "error");
        }
      } catch {
        // polling — just keep trying
      }
    }, 1000);
  }, [notify, loadJobs]);

  const handleFolderConvert = async (path: string, instrument: string) => {
    setConverting(true);
    setConvertProgress({ status: "pending", total_files: 0, processed: 0, current_file: "", converted: 0, skipped: 0, errors: 0 });
    try {
      const res = await dataLakeService.convertData(path, instrument);
      startPolling(res.task_id);
    } catch {
      notify("Failed to start conversion", "error");
      setConverting(false);
      setConvertProgress(null);
    }
  };

  // Cleanup polling on unmount
  useEffect(() => {
    return () => { if (pollRef.current) clearInterval(pollRef.current); };
  }, []);

  return (
    <AppLayout
      title="Data Lake"
      subtitle="Manage data sources, downloads, and catalog"
    >

      <div className="flex gap-1 border-b">
        {TABS.map(t => (
          <button
            key={t.key}
            onClick={() => {
              setTab(t.key);
              const params = new URLSearchParams(window.location.search);
              params.set("tab", t.key);
              navigate(`/admin/data-lake?${params.toString()}`, { replace: true });
            }}
            className={`px-4 py-2 text-sm font-medium border-b-2 transition-colors ${
              tab === t.key
                ? "border-primary text-foreground"
                : "border-transparent text-muted-foreground hover:text-foreground"
            }`}
          >
            {t.label}
          </button>
        ))}
      </div>

      {tab === "marketdata" && <MarketDataPanel />}

      {tab === "catalog" && (
        <CatalogTreeView onError={(msg) => notify(msg, "error")} />
      )}

      {tab === "nvme_cache" && <NvmeCachePanel />}

      {tab === "convert" && (
        <div className="space-y-6">
          <div className="bg-card border rounded-lg p-4 space-y-3">
            <h3 className="font-semibold text-foreground">Browse & Convert</h3>
            <p className="text-xs text-muted-foreground">
              Navigate to a ticker folder containing ThetaData parquet files, then click Convert.
              Files are recursively found and converted into the Nautilus catalog format.
            </p>
            <FolderBrowser
              onSelect={setSelectedPath}
              onConvert={handleFolderConvert}
              converting={converting}
              convertProgress={convertProgress}
            />
          </div>

          {/* Collapsible manual path entry for advanced use */}
          <details className="bg-card border rounded-lg p-4">
            <summary className="text-sm font-semibold text-muted-foreground cursor-pointer">
              Manual path entry (advanced)
            </summary>
            <div className="mt-3 space-y-3">
              <div className="flex gap-2">
                <input
                  className="flex-1 bg-background border rounded px-3 py-2 text-sm text-foreground"
                  value={importPath}
                  onChange={e => setImportPath(e.target.value)}
                  placeholder="Relative path (e.g. ETF_Core_Indices/SPY)"
                />
                <input
                  className="w-32 bg-background border rounded px-3 py-2 text-sm text-foreground"
                  value={instrumentFilter}
                  onChange={e => setInstrumentFilter(e.target.value)}
                  placeholder="Filter symbol"
                />
                <Button variant="outline" onClick={handleImport}>Import Direct</Button>
                <Button variant="outline" onClick={handleConvertPath}>Convert</Button>
              </div>
              <p className="text-xs text-muted-foreground">
                Paths are relative to your catalog mount. Filter can be left empty to convert all symbols.
              </p>
            </div>
          </details>

          <div className="space-y-2">
            <h3 className="font-semibold text-foreground">Completed Downloads</h3>
            {jobs.filter(j => j.status === "completed").length === 0 && (
              <p className="text-sm text-muted-foreground">No completed downloads ready to convert.</p>
            )}
            <div className="grid md:grid-cols-2 gap-3">
              {jobs.filter(j => j.status === "completed").map(j => (
                <JobProgressCard
                  key={j.id}
                  job={j}
                  onConvert={() => handleConvertJob(j.id)}
                  onDelete={() => handleDeleteJob(j.id)}
                />
              ))}
            </div>
          </div>
        </div>
      )}

      {tab === "backtests" && (
        <div className="bg-card border rounded-lg p-8 text-center">
          <h3 className="text-lg font-semibold text-foreground mb-2">Backtest Results</h3>
          <p className="text-sm text-muted-foreground">
            Browse and manage backtest result files. Coming soon.
          </p>
        </div>
      )}

      {tab === "sources" && (
        <div className="space-y-4">
          <h2 className="text-lg font-semibold text-foreground">Data Sources</h2>
          {sources.length === 0 && (
            <p className="text-sm text-muted-foreground">No sources configured. Add a source to get started.</p>
          )}
          <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-4">
            {sources.map(s => (
              <DataSourceCard
                key={s.id}
                source={s}
                onTest={() => handleTestSource(s.id)}
                onEdit={() => window.location.href = `/admin/data-lake/sources/${s.id}`}
                onDelete={() => handleDeleteSource(s.id)}
              />
            ))}
          </div>
        </div>
      )}
    </AppLayout>
  );
}

import { useState, useEffect, useCallback, useRef } from "react";
import { useLocation } from "wouter";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import { useNotification } from "@/contexts/NotificationContext";
import { dataLakeService, type TickerCoverage, type NvmeCacheEntry, type ConvertTaskStatus } from "@/services/dataLakeService";
import api from "@/lib/api";

// ── Project types ─────────────────────────────────────────────────────────────

interface BacktestProject {
  id: string;
  name: string;
  created_at: string;
  updated_at: string;
  config_count: number;
}

interface ProjectFile {
  _file: string;
  _file_type: "config" | "result";
  [key: string]: any;
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  if (bytes < 1024 * 1024 * 1024) return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  return `${(bytes / (1024 * 1024 * 1024)).toFixed(2)} GB`;
}

// ── Tab: Data Download ────────────────────────────────────────────────────────

function DataDownloadTab() {
  const { addNotification } = useNotification();
  const [symbols, setSymbols] = useState("");
  const [tier, setTier] = useState("standard");
  const [startDate, setStartDate] = useState("2016-01-01");
  const [endDate, setEndDate] = useState(() => new Date().toISOString().split("T")[0]);
  const [downloadBars, setDownloadBars] = useState(true);
  const [downloadGreeks, setDownloadGreeks] = useState(false);
  const [running, setRunning] = useState(false);
  const [progress, setProgress] = useState("");
  const [taskId, setTaskId] = useState<string | null>(null);

  const handleDownload = async () => {
    const symList = symbols.split(/[,;\s]+/).map(s => s.trim().toUpperCase()).filter(Boolean);
    if (!symList.length) return;
    setRunning(true);
    setProgress("Starting batch download...");
    try {
      const res = await dataLakeService.batchDownload({
        symbols: symList,
        start_date: startDate,
        end_date: endDate,
        tier,
        bars: downloadBars,
        greeks: downloadGreeks,
      });
      setTaskId(res.task_id);
    } catch {
      addNotification("error", "Failed to start download");
      setRunning(false);
    }
  };

  useEffect(() => {
    if (!taskId) return;
    const interval = setInterval(async () => {
      try {
        const res = await api.get<{ status: string; current_file?: string; converted?: number; errors?: number }>(
          `/api/data-lake/thetadata/batch-download/status/${taskId}`
        );
        setProgress(`${res.status}: ${res.current_file || ""} (${res.converted || 0} records)`);
        if (res.status === "completed" || res.status === "error") {
          clearInterval(interval);
          setRunning(false);
          setTaskId(null);
          addNotification(res.status === "completed" ? "success" : "error",
            res.status === "completed" ? "Download complete" : `Download failed: ${res.errors} errors`);
        }
      } catch { /* keep polling */ }
    }, 1000);
    return () => clearInterval(interval);
  }, [taskId]);

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader>
          <CardTitle>Data Download</CardTitle>
          <CardDescription>Download market data from ThetaData to your archive</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid md:grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium mb-1">Tier</label>
              <select value={tier} onChange={e => setTier(e.target.value)}
                className="w-full bg-background border rounded px-3 py-2 text-sm">
                <option value="free">Free (EOD only, 2023+)</option>
                <option value="value">Value (1-min OHLC, 2021+)</option>
                <option value="standard" selected>Standard (1-min OHLC + Greeks, 2016+)</option>
                <option value="pro">Pro (tick-level, 2012+)</option>
              </select>
            </div>
            <div>
              <label className="block text-sm font-medium mb-1">Tickers</label>
              <input value={symbols} onChange={e => setSymbols(e.target.value)}
                className="w-full bg-background border rounded px-3 py-2 text-sm font-mono"
                placeholder="SPY, QQQ, AAPL, ..." />
            </div>
            <div>
              <label className="block text-sm font-medium mb-1">Start</label>
              <input type="date" value={startDate} onChange={e => setStartDate(e.target.value)}
                className="w-full bg-background border rounded px-3 py-2 text-sm" />
            </div>
            <div>
              <label className="block text-sm font-medium mb-1">End</label>
              <input type="date" value={endDate} onChange={e => setEndDate(e.target.value)}
                className="w-full bg-background border rounded px-3 py-2 text-sm" />
            </div>
          </div>
          <div className="flex items-center gap-4">
            <label className="flex items-center gap-2 text-sm">
              <input type="checkbox" checked={downloadBars} onChange={e => setDownloadBars(e.target.checked)} />
              OHLC Bars
            </label>
            <label className="flex items-center gap-2 text-sm">
              <input type="checkbox" checked={downloadGreeks} onChange={e => setDownloadGreeks(e.target.checked)} />
              Option Greeks EOD
            </label>
          </div>
          {running && <p className="text-sm text-muted-foreground">{progress}</p>}
          <Button onClick={handleDownload} disabled={running || !symbols.trim()}>
            {running ? "Downloading..." : "Download"}
          </Button>
        </CardContent>
      </Card>
    </div>
  );
}

// ── Tab: Archive & Cache ──────────────────────────────────────────────────────

function ArchiveCacheTab() {
  const { addNotification } = useNotification();
  const [tickers, setTickers] = useState<TickerCoverage[]>([]);
  const [cache, setCache] = useState<NvmeCacheEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [converting, setConverting] = useState<string | null>(null);
  const [convertProgress, setConvertProgress] = useState<ConvertTaskStatus | null>(null);
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const load = useCallback(async () => {
    try {
      const [cov, c] = await Promise.all([
        dataLakeService.listTickers(),
        dataLakeService.listCache(),
      ]);
      setTickers(cov.tickers);
      setCache(c.cache);
    } catch {
      addNotification("error", "Failed to load archive data");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { load(); }, []);

  const cachedTickers = new Set(cache.map(e => e.ticker));

  const handleConvert = async (ticker: string) => {
    setConverting(ticker);
    setConvertProgress({ status: "pending", total_files: 0, processed: 0, current_file: "", converted: 0, skipped: 0, errors: 0 });
    try {
      const res = await dataLakeService.convertToCache(ticker);
      if (pollRef.current) clearInterval(pollRef.current);
      pollRef.current = setInterval(async () => {
        try {
          const status = await dataLakeService.getConvertStatus(res.task_id);
          setConvertProgress(status);
          if (status.status === "completed" || status.status === "error") {
            clearInterval(pollRef.current!);
            pollRef.current = null;
            setConverting(null);
            setConvertProgress(null);
            addNotification(status.status === "completed" ? "success" : "error",
              status.status === "completed" ? `Converted ${status.converted} records` : `Error: ${status.error_detail}`);
            load();
          }
        } catch { /* keep polling */ }
      }, 1000);
    } catch {
      addNotification("error", "Failed to start conversion");
      setConverting(null);
      setConvertProgress(null);
    }
  };

  const handleClear = async (ticker: string) => {
    try {
      await dataLakeService.clearCache(ticker);
      addNotification("success", `Cleared ${ticker} from cache`);
      load();
    } catch { addNotification("error", "Failed to clear cache"); }
  };

  useEffect(() => {
    return () => { if (pollRef.current) clearInterval(pollRef.current); };
  }, []);

  const totalSize = cache.reduce((s, e) => s + e.size_bytes, 0);

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-4">
        <Card className="flex-1 py-3 px-4">
          <p className="text-xs text-muted-foreground">Archived Tickers</p>
          <p className="text-2xl font-bold">{tickers.length}</p>
        </Card>
        <Card className="flex-1 py-3 px-4">
          <p className="text-xs text-muted-foreground">Cached (NVMe)</p>
          <p className="text-2xl font-bold">{cache.length}</p>
        </Card>
        <Card className="flex-1 py-3 px-4">
          <p className="text-xs text-muted-foreground">Cache Size</p>
          <p className="text-2xl font-bold">{formatBytes(totalSize)}</p>
        </Card>
      </div>

      {converting && convertProgress && (
        <Card>
          <CardContent className="pt-4 space-y-2">
            <div className="flex justify-between text-xs text-muted-foreground">
              <span>Converting {converting}...</span>
              <span>{convertProgress.converted} records</span>
            </div>
            <Progress value={convertProgress.total_files > 0
              ? (convertProgress.processed / convertProgress.total_files) * 100 : undefined} />
          </CardContent>
        </Card>
      )}

      <Card>
        <CardHeader>
          <CardTitle>Archive Browser</CardTitle>
          <CardDescription>Tickers in your theta archive. Convert to NVMe cache for faster backtest access.</CardDescription>
        </CardHeader>
        <CardContent>
          {loading ? (
            <p className="text-sm text-muted-foreground">Loading...</p>
          ) : tickers.length === 0 ? (
            <p className="text-sm text-muted-foreground">No tickers in archive. Download data first.</p>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b text-left text-muted-foreground">
                    <th className="pb-2 font-medium">Ticker</th>
                    <th className="pb-2 font-medium">Bars</th>
                    <th className="pb-2 font-medium">Greeks</th>
                    <th className="pb-2 font-medium">Cache</th>
                    <th className="pb-2 font-medium">Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {tickers.map(t => {
                    const isCached = cachedTickers.has(t.ticker);
                    return (
                      <tr key={t.ticker} className="border-b last:border-b-0">
                        <td className="py-3 font-semibold">{t.ticker}</td>
                        <td className="py-3">
                          {t.bars_date_range ? (
                            <Badge variant="secondary" className="text-[10px]">{t.bars_date_range}</Badge>
                          ) : <span className="text-muted-foreground text-xs">—</span>}
                        </td>
                        <td className="py-3">
                          {t.greeks_date_range ? (
                            <Badge variant="secondary" className="text-[10px]">{t.greeks_date_range}</Badge>
                          ) : <span className="text-muted-foreground text-xs">—</span>}
                        </td>
                        <td className="py-3">
                          {isCached ? (
                            <Badge className="bg-green-100 text-green-700 text-[10px]">
                              {formatBytes(cache.find(e => e.ticker === t.ticker)!.size_bytes)}
                            </Badge>
                          ) : <span className="text-muted-foreground text-xs">Not cached</span>}
                        </td>
                        <td className="py-3">
                          <div className="flex gap-1">
                            <Button variant="outline" size="sm"
                              onClick={() => handleConvert(t.ticker)}
                              disabled={converting === t.ticker}>
                              {isCached ? "Re-cache" : "Cache"}
                            </Button>
                            {isCached && (
                              <Button variant="destructive" size="sm"
                                onClick={() => handleClear(t.ticker)}>Clear</Button>
                            )}
                          </div>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

// ── Tab: Projects ─────────────────────────────────────────────────────────────

function ProjectsTab() {
  const { addNotification } = useNotification();
  const [projects, setProjects] = useState<BacktestProject[]>([]);
  const [loading, setLoading] = useState(true);
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [projectFiles, setProjectFiles] = useState<ProjectFile[]>([]);
  const [viewingFile, setViewingFile] = useState<ProjectFile | null>(null);

  const loadProjects = useCallback(async () => {
    try {
      const res = await api.get<{ projects: BacktestProject[] }>("/api/backtest/projects");
      setProjects(res.projects);
    } catch {
      addNotification("error", "Failed to load projects");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { loadProjects(); }, []);

  const expandProject = async (id: string) => {
    if (expandedId === id) {
      setExpandedId(null);
      setProjectFiles([]);
      return;
    }
    setExpandedId(id);
    try {
      const res = await api.get<{ project: BacktestProject & { files: ProjectFile[] } }>(`/api/backtest/projects/${id}`);
      setProjectFiles(res.project.files || []);
    } catch {
      addNotification("error", "Failed to load project files");
      setProjectFiles([]);
    }
  };

  const deleteProject = async (id: string) => {
    try {
      await api.delete(`/api/backtest/projects/${id}`);
      addNotification("success", "Project deleted");
      loadProjects();
      if (expandedId === id) { setExpandedId(null); setProjectFiles([]); }
    } catch { addNotification("error", "Failed to delete project"); }
  };

  const deleteFile = async (projectId: string, fileName: string) => {
    const fileId = fileName.replace(/\.json$/, "");
    try {
      await api.delete(`/api/backtest/projects/${projectId}/files/${fileId}`);
      addNotification("success", "File deleted");
      expandProject(projectId);
    } catch { addNotification("error", "Failed to delete file"); }
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-lg font-semibold text-foreground">Backtest Projects</h2>
          <p className="text-sm text-muted-foreground">Browse project configs and results</p>
        </div>
        <Button variant="outline" size="sm" onClick={loadProjects}>Refresh</Button>
      </div>

      {loading ? (
        <p className="text-sm text-muted-foreground">Loading...</p>
      ) : projects.length === 0 ? (
        <Card className="py-8 text-center">
          <p className="text-sm text-muted-foreground">No projects created yet.</p>
          <p className="text-xs text-muted-foreground mt-1">Run a backtest from the Backtest Station to create one.</p>
        </Card>
      ) : (
        <div className="space-y-3">
          {projects.map(p => (
            <Card key={p.id}>
              <CardContent className="py-3 px-4">
                <div className="flex items-center justify-between">
                  <div>
                    <p className="font-semibold text-sm">{p.name}</p>
                    <p className="text-xs text-muted-foreground">{p.id} · {new Date(p.updated_at).toLocaleDateString()}</p>
                  </div>
                  <div className="flex gap-2">
                    <Badge variant="secondary" className="text-[10px]">{p.config_count} configs</Badge>
                    <Button variant="outline" size="sm" onClick={() => expandProject(p.id)}>
                      {expandedId === p.id ? "Collapse" : "View"}
                    </Button>
                    <Button variant="destructive" size="sm" onClick={() => deleteProject(p.id)}>Delete</Button>
                  </div>
                </div>

                {expandedId === p.id && (
                  <div className="mt-4 space-y-2">
                    {projectFiles.length === 0 ? (
                      <p className="text-xs text-muted-foreground">No files</p>
                    ) : (
                      projectFiles.map(f => (
                        <div key={f._file} className="flex items-center justify-between py-1 px-2 bg-muted/50 rounded text-xs">
                          <div className="flex items-center gap-2">
                            <Badge className={f._file_type === "result"
                              ? "bg-blue-100 text-blue-700"
                              : "bg-amber-100 text-amber-700"}>
                              {f._file_type}
                            </Badge>
                            <span className="font-mono">{f._file}</span>
                          </div>
                          <div className="flex gap-1">
                            <Button variant="ghost" size="sm" className="h-6 text-xs"
                              onClick={() => setViewingFile(f)}>View</Button>
                            <Button variant="ghost" size="sm" className="h-6 text-xs text-destructive"
                              onClick={() => deleteFile(p.id, f._file)}>Delete</Button>
                          </div>
                        </div>
                      ))
                    )}
                  </div>
                )}
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      {viewingFile && (
        <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center" onClick={() => setViewingFile(null)}>
          <div className="bg-card border rounded-lg w-full max-w-2xl max-h-[80vh] overflow-auto m-4" onClick={e => e.stopPropagation()}>
            <div className="flex items-center justify-between p-4 border-b sticky top-0 bg-card">
              <h3 className="font-semibold text-sm">{viewingFile._file}</h3>
              <Button variant="outline" size="sm" onClick={() => setViewingFile(null)}>Close</Button>
            </div>
            <pre className="p-4 text-xs font-mono overflow-x-auto whitespace-pre-wrap">
              {JSON.stringify(viewingFile, null, 2)}
            </pre>
          </div>
        </div>
      )}
    </div>
  );
}

// ── Main Page ─────────────────────────────────────────────────────────────────

type Tab = "download" | "archive" | "projects";

export default function DatabaseManagementPage() {
  const [, navigate] = useLocation();
  const [tab, setTab] = useState<Tab>("download");

  const TABS: { key: Tab; label: string }[] = [
    { key: "download", label: "Data Download" },
    { key: "archive", label: "Archive & Cache" },
    { key: "projects", label: "Projects" },
  ];

  return (
    <div className="min-h-screen bg-background">
      <header className="bg-card border-b border-border">
        <div className="container mx-auto px-4 py-4">
          <div className="flex items-center justify-between">
            <div>
              <h1 className="text-2xl font-bold text-foreground">Database Management</h1>
              <p className="text-sm text-muted-foreground mt-1">
                Manage data downloads, archive, cache, and backtest projects
              </p>
            </div>
            <Button variant="outline" onClick={() => navigate("/admin")}>← Back to Admin</Button>
          </div>
        </div>
      </header>

      <main className="container mx-auto px-4 py-8 space-y-6">
        <div className="flex gap-1 border-b">
          {TABS.map(t => (
            <button key={t.key} onClick={() => setTab(t.key)}
              className={`px-4 py-2 text-sm font-medium border-b-2 transition-colors ${
                tab === t.key
                  ? "border-primary text-foreground"
                  : "border-transparent text-muted-foreground hover:text-foreground"
              }`}>
              {t.label}
            </button>
          ))}
        </div>

        {tab === "download" && <DataDownloadTab />}
        {tab === "archive" && <ArchiveCacheTab />}
        {tab === "projects" && <ProjectsTab />}
      </main>
    </div>
  );
}

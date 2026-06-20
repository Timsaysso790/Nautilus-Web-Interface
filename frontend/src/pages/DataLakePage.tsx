import { useState, useEffect, useCallback } from "react";
import { useLocation } from "wouter";
import { Button } from "@/components/ui/button";
import { DataSourceCard } from "@/components/DataSourceCard";
import { DownloadJobForm } from "@/components/DownloadJobForm";
import { JobProgressCard } from "@/components/JobProgressCard";
import { CatalogTreeView } from "@/components/CatalogTreeView";
import { dataLakeService, type DataSource, type DownloadJob } from "@/services/dataLakeService";
import { useNotification } from "@/contexts/NotificationContext";

type Tab = "sources" | "download" | "convert" | "catalog";

const TABS: { key: Tab; label: string }[] = [
  { key: "sources", label: "Keys & Connections" },
  { key: "download", label: "Download" },
  { key: "convert", label: "Convert & Ingest" },
  { key: "catalog", label: "Catalog Browser" },
];

export default function DataLakePage() {
  const [, navigate] = useLocation();
  const { addNotification } = useNotification();
  const [tab, setTab] = useState<Tab>("sources");
  const [sources, setSources] = useState<DataSource[]>([]);
  const [jobs, setJobs] = useState<DownloadJob[]>([]);
  const [importPath, setImportPath] = useState("");

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
      const res = await dataLakeService.importData(importPath.trim());
      notify(`Imported: ${res.stats.converted} files, ${res.stats.errors} errors`, res.stats.errors > 0 ? "error" : "success");
      setImportPath("");
    } catch { notify("Import failed", "error"); }
  };

  const handleConvertPath = async () => {
    if (!importPath.trim()) return;
    try {
      const res = await dataLakeService.convertData(importPath.trim());
      notify(`Converted: ${res.stats.converted} files, ${res.stats.errors} errors`, res.stats.errors > 0 ? "error" : "success");
      setImportPath("");
    } catch { notify("Conversion failed", "error"); }
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-foreground">Data Lake</h1>
          <p className="text-sm text-muted-foreground">Manage data sources, downloads, and catalog</p>
        </div>
        <Button variant="outline" onClick={() => navigate("/admin")}>Back to Admin</Button>
      </div>

      <div className="flex gap-1 border-b">
        {TABS.map(t => (
          <button
            key={t.key}
            onClick={() => setTab(t.key)}
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

      {tab === "download" && (
        <div className="space-y-6">
          <DownloadJobForm
            onCreated={() => { notify("Download started", "success"); loadJobs(); }}
            onError={(msg) => notify(msg, "error")}
          />
          <div className="space-y-2">
            <h3 className="font-semibold text-foreground">Job History</h3>
            {jobs.length === 0 && <p className="text-sm text-muted-foreground">No jobs yet.</p>}
            <div className="grid md:grid-cols-2 gap-3">
              {jobs.map(j => (
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

      {tab === "convert" && (
        <div className="space-y-6">
          <div className="bg-card border rounded-lg p-4 space-y-3">
            <h3 className="font-semibold text-foreground">Import Existing Data</h3>
            <p className="text-xs text-muted-foreground">
              Point to a directory containing ThetaData parquet files (38-column format).
              Files are imported directly into the catalog.
            </p>
            <div className="flex gap-2">
              <input
                className="flex-1 bg-background border rounded px-3 py-2 text-sm text-foreground"
                value={importPath}
                onChange={e => setImportPath(e.target.value)}
                placeholder="/path/to/theta/data"
              />
              <Button variant="outline" onClick={handleImport}>Import Direct</Button>
              <Button variant="outline" onClick={handleConvertPath}>Convert to Catalog</Button>
            </div>
          </div>

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

      {tab === "catalog" && (
        <CatalogTreeView onError={(msg) => notify(msg, "error")} />
      )}
    </div>
  );
}

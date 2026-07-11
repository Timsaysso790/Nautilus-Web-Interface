import { useState, useEffect, useCallback } from "react";
import { Button } from "@/components/ui/button";
import { optionBacktestService } from "@/services/optionBacktestService";
import { useNotification } from "@/contexts/NotificationContext";
import type { BacktestProject, BacktestTemplate, CompiledStrategy, BacktestResult } from "./types";
import { ProjectWorkspaceCard } from "./components/ProjectWorkspaceCard";
import { OptionsStationForm } from "./components/OptionsStationForm";
import { OptionsStationResults } from "./components/OptionsStationResults";
import { ProcessingModal } from "./components/ProcessingModal";
import { NewProjectDialog } from "./components/NewProjectDialog";
import { SaveTemplateDialog } from "./components/SaveTemplateDialog";
import PortfolioEnginePage from "./PortfolioEnginePage";

type Tab = "options" | "portfolio";

function parseUrlParams() {
  const params = new URLSearchParams(window.location.search);
  const tab = params.get("tab") as Tab | null;
  const project = params.get("project") || "";
  return {
    tab: tab && ["options", "portfolio"].includes(tab) ? tab : "options",
    project,
  };
}

function updateUrl(tab: Tab, project: string) {
  const params = new URLSearchParams();
  params.set("tab", tab);
  if (project) params.set("project", project);
  window.history.replaceState(null, "", `/trader/option-backtest?${params.toString()}`);
}

export default function BacktestStationPage() {
  const { success, error: notifyError } = useNotification();
  const [tab, setTab] = useState<Tab>(parseUrlParams().tab);
  const [projects, setProjects] = useState<BacktestProject[]>([]);
  const [templates, setTemplates] = useState<BacktestTemplate[]>([]);
  const [selectedProjectId, setSelectedProjectId] = useState(parseUrlParams().project);
  const [selectedTemplateId, setSelectedTemplateId] = useState("");
  const [templateConfig, setTemplateConfig] = useState<CompiledStrategy | null>(null);
  const [formKey, setFormKey] = useState(0);
  const [loadingProjects, setLoadingProjects] = useState(false);
  const [loadingTemplates, setLoadingTemplates] = useState(false);
  const [result, setResult] = useState<BacktestResult | null>(null);
  const [running, setRunning] = useState(false);
  const [modalState, setModalState] = useState<"idle" | "submitting" | "success" | "error">("idle");
  const [modalError, setModalError] = useState("");
  const [jsonPreview, setJsonPreview] = useState("");
  const [showNewProject, setShowNewProject] = useState(false);
  const [showSaveTemplate, setShowSaveTemplate] = useState(false);

  useEffect(() => {
    const initial = parseUrlParams();
    if (initial.tab !== tab) setTab(initial.tab);
    if (initial.project !== selectedProjectId) setSelectedProjectId(initial.project);
  }, []);

  const loadProjects = useCallback(async () => {
    setLoadingProjects(true);
    try {
      const res = await optionBacktestService.listProjects();
      setProjects(res.projects);
    } catch {
      notifyError("Failed to load projects");
    } finally {
      setLoadingProjects(false);
    }
  }, [notifyError]);

  const loadTemplates = useCallback(async () => {
    setLoadingTemplates(true);
    try {
      const res = await optionBacktestService.listTemplates();
      setTemplates(res.templates);
    } catch {
      notifyError("Failed to load templates");
    } finally {
      setLoadingTemplates(false);
    }
  }, [notifyError]);

  useEffect(() => {
    loadProjects();
    loadTemplates();
  }, []);

  const handleTabChange = useCallback((newTab: Tab) => {
    setTab(newTab);
    setResult(null);
    updateUrl(newTab, selectedProjectId);
  }, [selectedProjectId]);

  const handleProjectChange = useCallback((id: string) => {
    setSelectedProjectId(id);
    setSelectedTemplateId("");
    setTemplateConfig(null);
    setResult(null);
    setFormKey(prev => prev + 1);
    updateUrl(tab, id);
  }, [tab]);

  const handleTemplateChange = useCallback((id: string) => {
    setSelectedTemplateId(id);
    if (id) {
      const t = templates.find(t => t.id === id);
      if (t) {
        setTemplateConfig(t.config);
        setResult(null);
        setFormKey(prev => prev + 1);
      }
    } else {
      setTemplateConfig(null);
    }
  }, [templates]);

  const handleNewProject = useCallback(async (name: string) => {
    try {
      const res = await optionBacktestService.createProject(name);
      setShowNewProject(false);
      await loadProjects();
      if (res.project) {
        setSelectedProjectId(res.project.id);
        setResult(null);
        setFormKey(prev => prev + 1);
        updateUrl(tab, res.project.id);
      }
      success(`Project "${name}" created`);
    } catch (e: any) {
      notifyError(e?.detail || "Failed to create project");
    }
  }, [success, notifyError, loadProjects, tab]);

  const handleSaveTemplate = useCallback(async (name: string) => {
    setShowSaveTemplate(false);
    try {
      await optionBacktestService.saveTemplate(name, templateConfig);
      await loadTemplates();
      success(`Template "${name}" saved`);
    } catch (e: any) {
      notifyError(e?.detail || "Failed to save template");
    }
  }, [templateConfig, success, notifyError, loadTemplates]);

  const handleCompile = useCallback(async (config: CompiledStrategy) => {
    setJsonPreview(JSON.stringify(config, null, 2));
    setModalState("idle");
    setModalError("");
    setResult(null);

    setModalState("submitting");
    try {
      const res = await optionBacktestService.runOptionsStation(config);
      setResult(res);
      setModalState("success");
      success(`Backtest complete: ${res.summary.total_trades} trades, P&L ${res.summary.total_pnl >= 0 ? "+" : ""}$${res.summary.total_pnl}`);
    } catch (e: any) {
      setModalError(e?.detail || "Backtest failed");
      setModalState("error");
      notifyError(e?.detail || "Backtest failed");
    }
  }, [success, notifyError]);

  const handleModalClose = useCallback(() => {
    setModalState("idle");
    setJsonPreview("");
  }, []);

  const currentProject = projects.find(p => p.id === selectedProjectId);

  return (
    <div className="min-h-screen bg-background">
      <header className="bg-card border-b border-border">
        <div className="container mx-auto px-4 py-4">
          <div className="flex items-center justify-between">
            <div>
              <h1 className="text-2xl font-bold text-foreground">Backtest Station</h1>
              <p className="text-sm text-muted-foreground">Multi-leg options strategy backtesting with condition triggers</p>
            </div>
            <Button variant="outline" onClick={() => window.location.href = '/trader'}>
              Back to Trader
            </Button>
          </div>
        </div>
      </header>

      <main className="container mx-auto px-4 py-8 space-y-6">
        {/* Tabs */}
        <div className="flex gap-1 border-b">
          {[
            { key: "options" as Tab, label: "Options Station" },
            { key: "portfolio" as Tab, label: "Portfolio Engine" },
          ].map(t => (
            <button
              key={t.key}
              onClick={() => handleTabChange(t.key)}
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

        {tab === "options" && (
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
            <div className="lg:col-span-1 space-y-4">
              <ProjectWorkspaceCard
                projects={projects}
                templates={templates}
                selectedProjectId={selectedProjectId}
                selectedTemplateId={selectedTemplateId}
                loadingProjects={loadingProjects}
                loadingTemplates={loadingTemplates}
                onProjectChange={handleProjectChange}
                onTemplateChange={handleTemplateChange}
                onNewProject={() => setShowNewProject(true)}
                onSaveTemplate={() => {
                  setShowSaveTemplate(true);
                }}
              />
              <OptionsStationForm
                key={formKey}
                projectId={selectedProjectId}
                projectName={currentProject?.name || "Unnamed"}
                templateConfig={templateConfig}
                onCompile={handleCompile}
              />
            </div>
            <div className="lg:col-span-2">
              {!result && !running && (
                <div className="text-center py-16 text-muted-foreground">
                  <p className="text-lg">Configure your strategy and compile it.</p>
                  <p className="text-sm mt-2">Supports multi-leg option strategies with conditional entry triggers and configurable exit rules.</p>
                </div>
              )}
              {running && (
                <div className="space-y-4">
                  <div className="h-32 bg-card border rounded-lg animate-pulse" />
                  <div className="h-64 bg-card border rounded-lg animate-pulse" />
                </div>
              )}
              {result && <OptionsStationResults result={result} />}
            </div>
          </div>
        )}

        {tab === "portfolio" && <PortfolioEnginePage initialProjectId={selectedProjectId} />}
      </main>

      <NewProjectDialog
        open={showNewProject}
        onOpenChange={setShowNewProject}
        onConfirm={handleNewProject}
      />

      <SaveTemplateDialog
        open={showSaveTemplate}
        onOpenChange={setShowSaveTemplate}
        onConfirm={handleSaveTemplate}
      />

      <ProcessingModal
        state={modalState}
        errorMessage={modalError}
        jsonPreview={jsonPreview}
        onClose={handleModalClose}
        onSubmit={() => {}}
      />
    </div>
  );
}

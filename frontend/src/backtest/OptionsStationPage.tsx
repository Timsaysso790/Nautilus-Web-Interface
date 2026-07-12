import { useState, useEffect, useCallback, useRef } from "react";
import { useLocation } from "wouter";
import { Button } from "@/components/ui/button";
import {
  Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Save, Loader2 } from "lucide-react";
import { optionBacktestService } from "@/services/optionBacktestService";
import { useNotification } from "@/contexts/NotificationContext";
import type { BacktestProject, BacktestTemplate, CompiledStrategy, BacktestResult } from "./types";
import { ProjectWorkspaceCard } from "./components/ProjectWorkspaceCard";
import { OptionsStationForm, type OptionsStationFormHandle } from "./components/OptionsStationForm";
import OptionsStationResultsPanel from "./components/OptionsStationResultsPanel";
import { ProcessingModal } from "./components/ProcessingModal";
import { NewProjectDialog } from "./components/NewProjectDialog";
import { SaveTemplateDialog } from "./components/SaveTemplateDialog";

interface Props {
  projectId?: string;
  sandbox?: boolean;
}

export default function OptionsStationPage({ projectId: propProjectId, sandbox }: Props = {}) {
  const { success, error: notifyError } = useNotification();
  const [, navigate] = useLocation();

  function parseProjectId(): string {
    return propProjectId || new URLSearchParams(window.location.search).get("project") || "";
  }

  function updateUrl(id: string) {
    if (id) {
      navigate(`/trader/backtest/options/${id}`, { replace: true });
    }
  }

  const [projects, setProjects] = useState<BacktestProject[]>([]);
  const [templates, setTemplates] = useState<BacktestTemplate[]>([]);
  const [selectedProjectId, setSelectedProjectId] = useState(parseProjectId());
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
  const formRef = useRef<OptionsStationFormHandle>(null);
  const [showNewProject, setShowNewProject] = useState(false);
  const [showSaveTemplate, setShowSaveTemplate] = useState(false);
  const [showSaveAs, setShowSaveAs] = useState(false);
  const [saveName, setSaveName] = useState("");
  const [saving, setSaving] = useState(false);

  const loadProjects = useCallback(async () => {
    if (sandbox) return;
    setLoadingProjects(true);
    try {
      const res = await optionBacktestService.listProjects();
      setProjects(res.projects);
    } catch {
      notifyError("Failed to load projects");
    } finally {
      setLoadingProjects(false);
    }
  }, [notifyError, sandbox]);

  const loadTemplates = useCallback(async () => {
    if (sandbox) return;
    setLoadingTemplates(true);
    try {
      const res = await optionBacktestService.listTemplates();
      setTemplates(res.templates);
    } catch {
      notifyError("Failed to load templates");
    } finally {
      setLoadingTemplates(false);
    }
  }, [notifyError, sandbox]);

  useEffect(() => {
    loadProjects();
    loadTemplates();
  }, []);

  const handleProjectChange = useCallback((id: string) => {
    setSelectedProjectId(id);
    setSelectedTemplateId("");
    setTemplateConfig(null);
    setResult(null);
    setFormKey(prev => prev + 1);
    updateUrl(id);
  }, []);

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
      const res = await optionBacktestService.createProject(name, "options");
      setShowNewProject(false);
      await loadProjects();
      if (res.project) {
        setSelectedProjectId(res.project.id);
        setResult(null);
        setFormKey(prev => prev + 1);
        updateUrl(res.project.id);
      }
      success(`Project "${name}" created`);
    } catch (e: any) {
      notifyError(e?.detail || "Failed to create project");
    }
  }, [success, notifyError, loadProjects]);

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

  const handleRun = useCallback(() => {
    if (!formRef.current) return;
    setRunning(true);
    setResult(null);
    const config = formRef.current.getCurrentConfig();
    handleCompile(config);
  }, [handleCompile]);

  const handleSaveAsProject = useCallback(async () => {
    if (!saveName.trim() || !formRef.current) return;
    setSaving(true);
    try {
      const config = formRef.current.getCurrentConfig();
      const res = await optionBacktestService.createProject(saveName.trim(), "options");
      const pid = res.project.id;
      await optionBacktestService.savePrimaryConfig(pid, config);
      setShowSaveAs(false);
      setSaveName("");
      success(`Project "${saveName.trim()}" saved`);
      navigate(`/trader/backtest/options/${pid}`);
    } catch (e: any) {
      notifyError(e?.detail || e?.message || "Failed to save project");
    } finally {
      setSaving(false);
    }
  }, [saveName, success, notifyError, navigate]);

  const handleCompile = useCallback(async (config: CompiledStrategy) => {
    try {
      const res = await optionBacktestService.runOptionsStation(config);
      setResult(res);
      success(`Backtest complete: ${res.summary.total_trades} trades, P&L ${res.summary.total_pnl >= 0 ? "+" : ""}$${res.summary.total_pnl}`);
    } catch (e: any) {
      notifyError(e?.detail || "Backtest failed");
    } finally {
      setRunning(false);
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
              <h1 className="text-2xl font-bold text-foreground">Options Station</h1>
              <p className="text-sm text-muted-foreground">Multi-leg options strategy backtesting with condition triggers</p>
            </div>
            <div className="flex items-center gap-2">
              {sandbox && (
                <Button onClick={() => setShowSaveAs(true)} className="gap-2">
                  <Save className="h-4 w-4" /> Save as Project
                </Button>
              )}
              <Button variant="outline" onClick={() => navigate('/trader')}>
                Back to Trader
              </Button>
            </div>
          </div>
        </div>
      </header>

      <main className="container mx-auto px-4 py-8">
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-8">
          <div className="lg:col-span-8 space-y-6">
            {!sandbox && (
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
                onSaveTemplate={() => setShowSaveTemplate(true)}
              />
            )}
            <OptionsStationForm
              ref={formRef}
              key={formKey}
              projectId={selectedProjectId}
              projectName={currentProject?.name || (sandbox ? "Sandbox" : "Unnamed")}
              templateConfig={templateConfig}
            />
          </div>
          <div className="lg:col-span-4">
            <OptionsStationResultsPanel
              running={running}
              result={result}
              onRun={handleRun}
            />
          </div>
        </div>
      </main>

      {!sandbox && (
        <>
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
        </>
      )}

      <Dialog open={showSaveAs} onOpenChange={(v) => { if (!saving) setShowSaveAs(v); }}>
        <DialogContent className="sm:max-w-sm">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Save className="h-5 w-5" /> Save as Project
            </DialogTitle>
            <DialogDescription>
              Save your current sandbox config as a persistent project with full disk storage.
            </DialogDescription>
          </DialogHeader>
          <Input
            value={saveName}
            onChange={e => setSaveName(e.target.value)}
            placeholder="Project name"
            onKeyDown={e => e.key === "Enter" && !saving && handleSaveAsProject()}
            autoFocus
          />
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowSaveAs(false)} disabled={saving}>Cancel</Button>
            <Button onClick={handleSaveAsProject} disabled={!saveName.trim() || saving}>
              {saving && <Loader2 className="h-4 w-4 mr-1 animate-spin" />}
              Save
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

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

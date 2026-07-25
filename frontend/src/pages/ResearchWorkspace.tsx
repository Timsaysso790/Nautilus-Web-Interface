import { useState, useEffect, useCallback, useRef } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import {
  Dialog, DialogContent, DialogDescription, DialogFooter,
  DialogHeader, DialogTitle,
} from "@/components/ui/dialog";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel,
  AlertDialogContent, AlertDialogDescription, AlertDialogFooter,
  AlertDialogHeader, AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { ScrollArea } from "@/components/ui/scroll-area";
import {
  Collapsible, CollapsibleContent, CollapsibleTrigger,
} from "@/components/ui/collapsible";
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table";
import {
  FolderKanban, Plus, Trash2, Loader2, Bot, Send, X,
  Activity, LineChart, BarChart4, History, Timer,
  ChevronDown, ChevronUp, Play, Save, Brain,
  TrendingUp, TrendingDown, Minus, AlertCircle, Zap,
} from "lucide-react";
import {
  LineChart as RechartLine, Line, XAxis, YAxis, CartesianGrid,
  Tooltip as RechartTooltip, ResponsiveContainer,
  Area, AreaChart, BarChart, Bar, ReferenceLine, Cell,
} from "recharts";
import api from "@/lib/api";
import { TickerSelect } from "@/components/backtest/TickerSelect";
import OptionsConfigPanel from "@/components/backtest/OptionsConfigPanel";
import PortfolioConfigPanelNew from "@/components/portfolio/PortfolioConfigPanel";
import {
  PortfolioConfigPanel as PortfolioConfigPanelLegacy, PortfolioMetricsBar, PortfolioChart, PortfolioLedger,
} from "@/components/portfolio/PortfolioPanels";

/* ════════════════════════════════════════════════ */
/*  TYPES                                          */
/* ════════════════════════════════════════════════ */

interface BacktestProject {
  id: string;
  name: string;
  project_type: string;
  project_slug: string;
  config_count: number;
  created_at: string;
  updated_at: string;
}

interface BacktestConfig {
  ticker: string;
  legs: StrategyLeg[];
  dte_min: number;
  dte_max: number;
  hold_until_dte: number;
  entry_frequency: string;
  year_range: [number, number];
}

interface StrategyLeg {
  strike: number;
  right: "C" | "P";
  action: "buy" | "sell";
  qty: number;
}

interface BacktestMetrics {
  total_trades: number;
  winning_trades: number;
  losing_trades: number;
  win_rate: number;
  total_pnl: number;
  avg_pnl: number;
  avg_win: number;
  avg_loss: number;
  payoff_ratio: number;
  profit_factor: number;
  expectancy: number;
  sharpe_ratio: number;
  sortino_ratio: number;
  calmar_ratio: number;
  cagr_pct: number;
  total_return_pct: number;
  max_drawdown_pct: number;
  avg_drawdown_pct: number;
  drawdown_count: number;
  avg_days_held: number;
}

interface BacktestResult {
  ticker: string;
  strategy: string;
  metadata?: {
    run_name?: string;
    run_seq?: number;
  };
  metrics: BacktestMetrics;
  equity_curve: { date: string; equity: number; underlying: number; open_positions: number; margin_used: number }[];
  trades: TradeRecord[];
}

interface TradeRecord {
  id: number;
  entry_date: string;
  exit_date: string;
  expiration: string;
  dte_at_entry: number;
  dte_at_exit: number;
  days_held: number;
  underlying_entry: number;
  underlying_exit: number;
  entry_cost: number;
  exit_cost: number;
  net_credit: number;
  pnl: number;
  margin_required: number;
  commission: number;
  exit_reason: string;
  greeks: {
    delta: number;
    gamma: number;
    theta: number;
    vega: number;
    rho: number;
  };
}

interface ChatMessage {
  role: "user" | "assistant";
  content: string;
}

/* ════════════════════════════════════════════════ */
/*  HELPERS                                        */
/* ════════════════════════════════════════════════ */

function formatDate(iso: string): string {
  try {
    const d = new Date(iso);
    return d.toLocaleDateString(undefined, {
      month: "short", day: "numeric", year: "numeric",
    });
  } catch {
    return iso;
  }
}

function pnlColor(pnl: number): string {
  if (pnl > 0) return "text-emerald-400";
  if (pnl < 0) return "text-red-400";
  return "text-gray-400";
}

function pnlText(pnl: number): string {
  if (pnl > 0) return `+$${pnl.toFixed(2)}`;
  if (pnl < 0) return `-$${Math.abs(pnl).toFixed(2)}`;
  return "$0.00";
}

function metricColor(value: number, type: "higher_better" | "lower_better", goodThreshold?: number, badThreshold?: number): string {
  if (type === "higher_better") {
    const gt = goodThreshold ?? 0;
    const bt = badThreshold ?? 0;
    if (value >= gt) return "text-emerald-400";
    if (value <= bt) return "text-red-400";
    return "text-amber-400";
  }
  const gt = goodThreshold ?? 0;
  const bt = badThreshold ?? 0;
  if (value <= gt) return "text-emerald-400";
  if (value >= bt) return "text-red-400";
  return "text-amber-400";
}

const TYPE_LABELS: Record<string, string> = {
  options: "Options",
  portfolio: "Portfolio",
};

const TYPE_COLORS: Record<string, string> = {
  options: "bg-violet-500/15 text-violet-400 border-violet-500/30",
  portfolio: "bg-blue-500/15 text-blue-400 border-blue-500/30",
};

function getTypeLabel(t: string): string {
  return TYPE_LABELS[t] ?? t;
}

function getTypeBadgeClass(t: string): string {
  return TYPE_COLORS[t] ?? "bg-gray-800 text-gray-400 border-gray-700";
}

/* ════════════════════════════════════════════════ */
/*  CREATE PROJECT DIALOG                          */
/* ════════════════════════════════════════════════ */

interface CreateDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onCreated: () => void;
}

function CreateProjectDialog({ open, onOpenChange, onCreated }: CreateDialogProps) {
  const [name, setName] = useState("");
  const [type, setType] = useState("options");
  const [creating, setCreating] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (open) {
      setName("");
      setType("options");
      setError(null);
    }
  }, [open]);

  const handleCreate = useCallback(async () => {
    if (!name.trim() || creating) return;
    setCreating(true);
    setError(null);
    try {
      await api.post("/api/backtest/projects", { name: name.trim(), type });
      onCreated();
      onOpenChange(false);
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : "Failed to create project";
      setError(msg);
    } finally {
      setCreating(false);
    }
  }, [name, type, creating, onCreated, onOpenChange]);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md bg-[#0d1321] border-gray-700 text-gray-200">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2 text-gray-100">
            <FolderKanban className="h-5 w-5 text-amber-400" />
            New Research Project
          </DialogTitle>
          <DialogDescription className="text-gray-500">
            Create a project to organize your backtest configurations and results.
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-4 py-2">
          <div className="space-y-1.5">
            <Label htmlFor="project-name" className="text-gray-400">Project Name</Label>
            <Input
              id="project-name"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="e.g. SPY Put Credit Spread"
              onKeyDown={(e) => e.key === "Enter" && handleCreate()}
              autoFocus
              disabled={creating}
              className="bg-[#0a0e17] border-gray-700 text-gray-200"
            />
          </div>
          <div className="space-y-1.5">
            <Label className="text-gray-400">Project Type</Label>
            <div className="grid grid-cols-2 gap-2">
              <button
                type="button"
                onClick={() => setType("options")}
                className={[
                  "flex flex-col items-center gap-2 rounded-lg border p-3 transition-all duration-150 text-left",
                  type === "options"
                    ? "border-violet-500/50 bg-violet-500/10"
                    : "border-gray-700 bg-[#0a0e17] hover:border-gray-600",
                ].join(" ")}
              >
                <span className="w-3 h-3 rounded-full border-2 flex items-center justify-center shrink-0"
                  style={type === "options" ? { borderColor: "#a78bfa", background: "#a78bfa" } : { borderColor: "#52525b" }}
                >
                  {type === "options" && <span className="w-1.5 h-1.5 rounded-full bg-white" />}
                </span>
                <div className="text-center">
                  <div className="text-xs font-medium text-gray-200">Options Strategy</div>
                  <div className="text-[10px] text-gray-500 mt-0.5">Multi-leg options backtesting</div>
                </div>
              </button>
              <button
                type="button"
                onClick={() => setType("portfolio")}
                className={[
                  "flex flex-col items-center gap-2 rounded-lg border p-3 transition-all duration-150 text-left",
                  type === "portfolio"
                    ? "border-blue-500/50 bg-blue-500/10"
                    : "border-gray-700 bg-[#0a0e17] hover:border-gray-600",
                ].join(" ")}
              >
                <span className="w-3 h-3 rounded-full border-2 flex items-center justify-center shrink-0"
                  style={type === "portfolio" ? { borderColor: "#3b82f6", background: "#3b82f6" } : { borderColor: "#52525b" }}
                >
                  {type === "portfolio" && <span className="w-1.5 h-1.5 rounded-full bg-white" />}
                </span>
                <div className="text-center">
                  <div className="text-xs font-medium text-gray-200">Portfolio / Margin</div>
                  <div className="text-[10px] text-gray-500 mt-0.5">Leveraged equity/ETF income portfolio</div>
                </div>
              </button>
            </div>
          </div>
          {error && (
            <div className="flex items-center gap-2 rounded-lg border border-red-500/30 bg-red-500/10 px-3 py-2 text-xs text-red-400">
              <AlertCircle className="h-3.5 w-3.5 shrink-0" />
              {error}
            </div>
          )}
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={creating} className="border-gray-700 text-gray-400">
            Cancel
          </Button>
          <Button onClick={handleCreate} disabled={!name.trim() || creating} className="bg-amber-500/20 text-amber-400 border border-amber-500/30 hover:bg-amber-500/30">
            {creating && <Loader2 className="h-4 w-4 animate-spin" />}
            {creating ? "Creating..." : "Create Project"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

/* ════════════════════════════════════════════════ */
/*  DELETE CONFIRMATION DIALOG                     */
/* ════════════════════════════════════════════════ */

interface DeleteConfirmProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  projectId: string;
  projectName: string;
  onDeleted: () => void;
}

function DeleteConfirmDialog({ open, onOpenChange, projectId, projectName, onDeleted }: DeleteConfirmProps) {
  const [deleting, setDeleting] = useState(false);

  const handleDelete = useCallback(async () => {
    setDeleting(true);
    try {
      await api.delete(`/api/backtest/projects/${projectId}`);
      onDeleted();
      onOpenChange(false);
    } catch {
      // silently fail
    } finally {
      setDeleting(false);
    }
  }, [projectId, onDeleted, onOpenChange]);

  return (
    <AlertDialog open={open} onOpenChange={onOpenChange}>
      <AlertDialogContent className="bg-[#0d1321] border-gray-700 text-gray-200">
        <AlertDialogHeader>
          <AlertDialogTitle className="text-gray-100">Delete Project</AlertDialogTitle>
          <AlertDialogDescription className="text-gray-500">
            Are you sure you want to delete <span className="text-gray-300 font-medium">"{projectName}"</span>?
            This will permanently remove all configurations and results.
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel className="border-gray-700 text-gray-400 bg-transparent hover:bg-gray-800">
            Cancel
          </AlertDialogCancel>
          <AlertDialogAction
            onClick={handleDelete}
            disabled={deleting}
            className="bg-red-500/20 text-red-400 border border-red-500/30 hover:bg-red-500/30"
          >
            {deleting ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
            {deleting ? "Deleting..." : "Delete"}
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}

/* ════════════════════════════════════════════════ */
/* ════════════════════════════════════════════════ */
/*  MAIN COMPONENT                                 */
/* ════════════════════════════════════════════════ */

export default function ResearchWorkspace() {
  /* ── Global state ── */
  const [projects, setProjects] = useState<BacktestProject[]>([]);
  const [projectsLoading, setProjectsLoading] = useState(true);
  const [activeProjectId, setActiveProjectId] = useState<string | null>(null);
  const [showCreate, setShowCreate] = useState(false);
  const [showDelete, setShowDelete] = useState(false);
  const [deleteTarget, setDeleteTarget] = useState<{ id: string; name: string } | null>(null);

  /* ── Saved runs state ── */
  const [savedRuns, setSavedRuns] = useState<any[]>([]);
  const [runsLoading, setRunsLoading] = useState(false);
  const [selectedRunSeq, setSelectedRunSeq] = useState<number | null>(null);
  const [showNameDialog, setShowNameDialog] = useState(false);
  const [pendingRunName, setPendingRunName] = useState("");
  const [pendingRunSeq, setPendingRunSeq] = useState<number | null>(null);

  const loadSavedRuns = useCallback(async () => {
    if (!activeProjectId) return;
    setRunsLoading(true);
    try {
      const data = await api.get<{ results: any[] }>(`/api/backtest/options/projects/${activeProjectId}/results`);
      setSavedRuns(data.results || []);
    } catch {
      setSavedRuns([]);
    }
    setRunsLoading(false);
  }, [activeProjectId]);

  const loadRunResult = async (seq: number) => {
    if (!activeProjectId) return;
    try {
      const result = await api.get<any>(`/api/backtest/options/projects/${activeProjectId}/results/${seq}`);
      setBacktestResult(result);
      setSelectedRunSeq(seq);
      setWorkspaceTab("backtest");
    } catch {}
  };

  useEffect(() => { if (activeProjectId) loadSavedRuns(); }, [activeProjectId, loadSavedRuns]);

  /* ── Config state ── */
  const [ticker, setTicker] = useState("SPY");
  const [legs, setLegs] = useState<StrategyLeg[]>([
    { strike: 0, right: "P", action: "sell", qty: 1 },
  ]);
  const [dteMin, setDteMin] = useState(30);
  const [dteMax, setDteMax] = useState(45);
  const [holdUntilDte, setHoldUntilDte] = useState(10);
  const [entryFrequency, setEntryFrequency] = useState("daily");
  const [yearRangeStart, setYearRangeStart] = useState(2020);
  const [yearRangeEnd, setYearRangeEnd] = useState(2025);

  /* ── Backtest state ── */
  const [running, setRunning] = useState(false);
  const [jobId, setJobId] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [backtestResult, setBacktestResult] = useState<BacktestResult | null>(null);
  const [backtestError, setBacktestError] = useState<string | null>(null);

  /* ── AI Assistant state ── */
  const [aiOpen, setAiOpen] = useState(false);
  const [aiMessages, setAiMessages] = useState<ChatMessage[]>([
    { role: "assistant", content: "I can help analyze your backtest results. Click 'Analyze Results' or ask a custom question." },
  ]);
  const [aiInput, setAiInput] = useState("");
  const [aiLoading, setAiLoading] = useState(false);
  const aiBottomRef = useRef<HTMLDivElement>(null);

  /* ── Portfolio state ── */
  const [portfolioResult, setPortfolioResult] = useState<any>(null);

  /* ── Workspace tab ── */
  const [workspaceTab, setWorkspaceTab] = useState("backtest");

  /* Auto-scroll AI chat */
  useEffect(() => {
    aiBottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [aiMessages]);

  /* ────────────── Projects ────────────── */

  const loadProjects = useCallback(async () => {
    setProjectsLoading(true);
    try {
      const data = await api.get<{ projects: BacktestProject[] }>("/api/backtest/projects");
      setProjects(data.projects ?? []);
    } catch {
      setProjects([]);
    } finally {
      setProjectsLoading(false);
    }
  }, []);

  useEffect(() => {
    loadProjects();
  }, [loadProjects]);

  const activeProject = projects.find((p) => p.id === activeProjectId) ?? null;

  /* ────────────── Config Helpers ────────────── */

  const updateLeg = (index: number, field: keyof StrategyLeg, value: number | string) => {
    setLegs((prev) => {
      const copy = prev.map((l) => ({ ...l }));
      if (field === "strike") copy[index].strike = value as number;
      if (field === "right") copy[index].right = value as "C" | "P";
      if (field === "action") copy[index].action = value as "buy" | "sell";
      if (field === "qty") copy[index].qty = value as number;
      return copy;
    });
  };

  const addLeg = () => {
    setLegs((prev) => [...prev, { strike: 0, right: "C", action: "buy", qty: 1 }]);
  };

  const removeLeg = (index: number) => {
    setLegs((prev) => prev.filter((_, i) => i !== index));
  };

  /* ────────────── Run Backtest ────────────── */

  const runBacktest = async () => {
    // Scroll to config panel so user can configure a new run
    const panel = document.querySelector('.options-config-scroll');
    if (panel) panel.scrollIntoView({ behavior: 'smooth' });
  };

  /* Run with config from OptionsConfigPanel — async with polling */
  const runBacktestWithConfig = async (config: any) => {
    if (running) return;
    setRunning(true);
    setBacktestError(null);
    setBacktestResult(null);
    try {
      // 1. Fire and forget — get job_id immediately
      const { job_id } = await api.post<{ job_id: string }>("/api/backtest/options/run", {
        ...config,
        project_id: activeProjectId || undefined,
      });
      setJobId(job_id);

      // 2. Poll for completion
      const poll = async (): Promise<any> => {
        const status = await api.get<any>(`/api/backtest/options/status/${job_id}`);
        return status;
      };

      let job: any;
      for (let i = 0; i < 150; i++) {  // 5 min max @ 2s intervals
        await new Promise(r => setTimeout(r, 2000));
        job = await poll();
        if (job.status !== "running") break;
      }

      setJobId(null);

      if (job.status === "error") {
        throw new Error(job.error || "Backtest failed");
      }

      // 3. Load result from saved file (survives restarts!)
      if (job.saved_seq && activeProjectId) {
        const result = await api.get<any>(
          `/api/backtest/options/projects/${activeProjectId}/results/${job.saved_seq}`
        );
        setBacktestResult(result);
        setSelectedRunSeq(job.saved_seq);
        await loadSavedRuns();
        setWorkspaceTab("backtest");
        // Show naming dialog
        setPendingRunSeq(job.saved_seq);
        setPendingRunName(`SPY ${config.delta_min?.toFixed(2) || ""}Δ PCS`);
        setShowNameDialog(true);
      } else if (job.result_id) {
        // Fallback: load from in-memory cache
        const result = await api.get<any>(`/api/backtest/options/result/${job.result_id}`);
        setBacktestResult(result);
        setWorkspaceTab("backtest");
      }
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : "Backtest failed";
      setBacktestError(msg);
    } finally {
      setRunning(false);
      setJobId(null);
    }
  };

  /* ────────────── Save Config ────────────── */

  const saveConfig = async () => {
    if (!activeProjectId || saving) return;
    setSaving(true);
    try {
      await api.post(`/api/backtest/projects/${activeProjectId}/config`, {
        config_id: crypto.randomUUID(),
        config: {},
      });
      await loadProjects();
    } catch {
      // silent
    } finally {
      setSaving(false);
    }
  };

  /* ────────────── AI Assistant ────────────── */

  const analyzeResults = async () => {
    if (!backtestResult || aiLoading) return;
    setAiLoading(true);
    const question = "Analyze these backtest results. What's working well and what should I improve?";
    try {
      const data = await api.post<{ analysis: string }>("/api/ai/analyze-file", {
        backtest_data: backtestResult,
        question,
      });
      setAiMessages((prev) => [
        ...prev,
        { role: "user", content: "📊 Analyze my backtest results" },
        { role: "assistant", content: data.analysis },
      ]);
    } catch {
      setAiMessages((prev) => [
        ...prev,
        { role: "assistant", content: "⚠️ AI analysis unavailable. Check that the AI backend is running and LLM_BASE_URL is set correctly in your .env." },
      ]);
    } finally {
      setAiLoading(false);
      setAiOpen(true);
    }
  };

  const analyzeJsonFile = async (jsonContent: any) => {
    if (aiLoading) return;
    setAiLoading(true);
    try {
      const data = await api.post<{ analysis: string }>("/api/ai/analyze-file", {
        backtest_data: jsonContent,
        question: "Analyze these backtest results. What's working and what should I change?",
      });
      setAiMessages((prev) => [
        ...prev,
        { role: "user", content: "📄 Analyzed uploaded backtest file" },
        { role: "assistant", content: data.analysis },
      ]);
    } catch {
      setAiMessages((prev) => [
        ...prev,
        { role: "assistant", content: "⚠️ Failed to analyze the uploaded file. Make sure it's a valid backtest JSON." },
      ]);
    } finally {
      setAiLoading(false);
      setAiOpen(true);
    }
  };

  const sendAiMessage = async () => {
    if (!aiInput.trim() || aiLoading) return;
    const userMsg: ChatMessage = { role: "user", content: aiInput };
    setAiMessages((prev) => [...prev, userMsg]);
    setAiInput("");
    setAiLoading(true);
    try {
      // Use tool-calling endpoint so AI can run backtests, check tickers, etc.
      const data = await api.post<{ response: string; tool_calls_made?: any[] }>("/api/ai/chat-with-tools", {
        messages: [{ role: "user", content: userMsg.content }],
        temperature: 0.3,
        max_tokens: 3000,
        // Pass current backtest result as context if available
        context: backtestResult ? {
          current_ticker: backtestResult.ticker,
          current_strategy: backtestResult.strategy,
          metrics: backtestResult.metrics,
        } : undefined,
      });
      setAiMessages((prev) => [...prev, { role: "assistant", content: data.response }]);
    } catch {
      setAiMessages((prev) => [
        ...prev,
        { role: "assistant", content: "⚠️ AI assistant unavailable. Check that the backend is running." },
      ]);
    } finally {
      setAiLoading(false);
    }
  };

  /* ═════════════════════════════════════════ */
  /*  RENDER                                   */
  /* ═════════════════════════════════════════ */

  return (
    <div className="flex h-[calc(100vh-3.5rem)] gap-0 bg-[#0a0e17]">
      {/* ── LEFT PANEL: Project Browser ── */}
      <aside className="w-[280px] shrink-0 border-r border-gray-800/60 flex flex-col bg-[#0d1321]">
        {/* Header */}
        <div className="flex items-center justify-between px-4 py-3 border-b border-gray-800/60">
          <div className="flex items-center gap-2">
            <FolderKanban className="h-4 w-4 text-amber-400" />
            <span className="text-sm font-semibold text-gray-100">Projects</span>
            <Badge variant="outline" className="text-[10px] border-gray-700 text-gray-500 ml-1">
              {projects.length}
            </Badge>
          </div>
          <Button
            size="sm"
            variant="ghost"
            className="h-7 text-xs text-amber-400 hover:text-amber-300 hover:bg-amber-400/10"
            onClick={() => setShowCreate(true)}
          >
            <Plus className="h-3.5 w-3.5 mr-1" />
            New
          </Button>
        </div>

        {/* Project list */}
        <ScrollArea className="flex-1 p-2">
          {projectsLoading ? (
            <div className="flex items-center justify-center py-12">
              <Loader2 className="h-5 w-5 text-gray-600 animate-spin" />
            </div>
          ) : projects.length === 0 ? (
            <div className="text-center py-12 px-4">
              <FolderKanban className="h-8 w-8 text-gray-700 mx-auto mb-2" />
              <p className="text-xs text-gray-600">No projects yet</p>
              <Button
                size="sm"
                variant="outline"
                className="mt-3 text-xs border-gray-700 text-gray-400"
                onClick={() => setShowCreate(true)}
              >
                Create your first project
              </Button>
            </div>
          ) : (
            <div className="space-y-1">
              {projects.map((project) => (
                <button
                  key={project.id}
                  type="button"
                  onClick={() => setActiveProjectId(project.id)}
                  className={[
                    "w-full text-left rounded-lg border px-3 py-2.5 transition-all duration-150",
                    project.id === activeProjectId
                      ? "border-amber-500/40 bg-amber-500/8"
                      : "border-transparent hover:border-gray-700/60 hover:bg-gray-800/40",
                  ].join(" ")}
                >
                  <div className="flex items-start justify-between gap-1">
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-1.5 mb-1">
                        <span className="text-xs font-medium text-gray-200 truncate block">
                          {project.name}
                        </span>
                      </div>
                      <div className="flex items-center gap-2">
                        <Badge
                          variant="outline"
                          className={["text-[9px] px-1 py-0", getTypeBadgeClass(project.project_type)].join(" ")}
                        >
                          {getTypeLabel(project.project_type)}
                        </Badge>
                        <span className="text-[10px] text-gray-600">
                          {project.config_count} config{project.config_count !== 1 ? "s" : ""}
                        </span>
                      </div>
                      <span className="text-[9px] text-gray-700 mt-1 block">
                        {formatDate(project.updated_at)}
                      </span>
                    </div>
                    <button
                      type="button"
                      onClick={(e) => {
                        e.stopPropagation();
                        setDeleteTarget({ id: project.id, name: project.name });
                        setShowDelete(true);
                      }}
                      className="shrink-0 p-1 rounded text-gray-600 hover:text-red-400 hover:bg-red-500/10 transition-colors"
                      title="Delete project"
                    >
                      <Trash2 className="h-3 w-3" />
                    </button>
                  </div>
                </button>
              ))}
            </div>
          )}

          {/* Saved runs for active project */}
          {activeProject && (
            <div className="px-2 pb-2">
              <div className="flex items-center justify-between px-1 mb-1.5">
                <span className="text-[10px] uppercase tracking-wider text-gray-600 font-medium">Saved Runs</span>
                <span className="text-[9px] text-gray-700">{savedRuns.length}</span>
              </div>
              {runsLoading ? (
                <div className="flex items-center justify-center py-4">
                  <Loader2 className="h-3.5 w-3.5 text-gray-600 animate-spin" />
                </div>
              ) : savedRuns.length === 0 ? (
                <p className="text-[10px] text-gray-700 text-center py-3 italic">No saved runs yet. Run a backtest to save it here.</p>
              ) : (
                <div className="space-y-0.5 max-h-[180px] overflow-y-auto">
                  {savedRuns.map((run, i) => {
                    const s = run.summary || {};
                    return (
                      <button
                        key={i}
                        type="button"
                        onClick={() => loadRunResult(run.seq)}
                        className={[
                          "w-full text-left rounded border px-2 py-1.5 transition-all duration-150 text-[10px]",
                          selectedRunSeq === run.seq
                            ? "border-amber-500/30 bg-amber-500/8"
                            : "border-transparent hover:border-gray-700/40 hover:bg-gray-800/30",
                        ].join(" ")}
                      >
                        <div className="flex items-center justify-between">
                          <span className="text-gray-300 font-medium">Run #{run.seq}</span>
                          <span className={`tabular-mono font-medium ${s.total_pnl >= 0 ? "text-emerald-400" : "text-red-400"}`}>
                            {s.total_pnl >= 0 ? "+" : ""}${s.total_pnl?.toFixed(0) || "0"}
                          </span>
                        </div>
                        <div className="flex items-center gap-2 mt-0.5 text-[9px] text-gray-600">
                          <span>{s.total_trades} trades</span>
                          <span>{s.win_rate?.toFixed(0)}% win</span>
                          <span>Sharpe {s.sharpe?.toFixed(1) || "—"}</span>
                        </div>
                      </button>
                    );
                  })}
                </div>
              )}
            </div>
          )}
        </ScrollArea>
      </aside>

      {/* ── CENTER + BOTTOM (AI Panel) ── */}
      <div className="flex-1 flex flex-col min-w-0">
        {/* ── Center: Workspace ── */}
        <div className="flex-1 overflow-auto p-4">
          {!activeProject ? (
            /* Empty state */
            <div className="flex items-center justify-center h-full">
              <div className="text-center max-w-sm">
                <Activity className="h-12 w-12 text-gray-700 mx-auto mb-4" />
                <h2 className="text-base font-semibold text-gray-400 mb-2">
                  Select a Project
                </h2>
                <p className="text-xs text-gray-600 leading-relaxed mb-4">
                  Select a project from the sidebar or create a new one to get started
                  with backtesting, charts, and analysis.
                </p>
                <Button
                  size="sm"
                  className="text-xs bg-amber-500/20 text-amber-400 border border-amber-500/30 hover:bg-amber-500/30"
                  onClick={() => setShowCreate(true)}
                >
                  <Plus className="h-3.5 w-3.5 mr-1" />
                  Create Project
                </Button>
                <div className="mt-4 pt-4 border-t border-gray-800/40">
                  <p className="text-[10px] text-gray-600 mb-2">Or run a quick backtest without saving:</p>
                  <div className="flex gap-2">
                    <Button
                      size="sm"
                      variant="outline"
                      className="text-xs border-gray-700 text-gray-400 hover:text-amber-400"
                      onClick={() => {
                        const panel = document.querySelector('.options-config-scroll');
                        if (panel) panel.scrollIntoView({ behavior: 'smooth' });
                      }}
                    >
                      ⚡ Quick Options Backtest
                    </Button>
                    <Button
                      size="sm"
                      variant="outline"
                      className="text-xs border-gray-700 text-gray-400 hover:text-blue-400"
                      onClick={() => {
                        const panel = document.querySelector('.options-config-scroll');
                        if (panel) panel.scrollIntoView({ behavior: 'smooth' });
                      }}
                    >
                      ⚡ Quick Portfolio Backtest
                    </Button>
                  </div>
                </div>
              </div>
            </div>
          ) : (
            <>
              {/* Project header */}
              <div className="flex items-center justify-between mb-4">
                <div className="flex items-center gap-3">
                  <h2 className="text-sm font-semibold text-gray-100">{activeProject.name}</h2>
                  <Badge
                    variant="outline"
                    className={["text-[10px]", getTypeBadgeClass(activeProject.project_type)].join(" ")}
                  >
                    {getTypeLabel(activeProject.project_type)}
                  </Badge>
                </div>
                <div className="flex items-center gap-2">
                  {workspaceTab !== "backtest" && (
                    <Button
                      size="sm"
                      variant="ghost"
                      className="h-7 text-[10px] text-emerald-400 hover:text-emerald-300"
                      onClick={() => setWorkspaceTab("backtest")}
                    >
                      <BarChart4 className="h-3 w-3 mr-1" />
                      Results
                    </Button>
                  )}
                </div>
              </div>

              {/* Tabs — different content based on project type */}
              {activeProject.project_type === "portfolio" ? (
                <div>
                  {/* Portfolio config panel always visible above tabs */}
                  <div className="mb-4">
                    <PortfolioConfigPanelNew
                      onRun={async (cfg) => {
                        if (running) return;
                        setRunning(true);
                        setPortfolioResult(null);
                        try {
                          const result = await api.post("/api/portfolio/backtest", {
                            assets: cfg.assets,
                            initial_cash: cfg.initial_cash,
                            margin_target: cfg.margin_target,
                            margin_rate: cfg.margin_rate,
                            drip_enabled: cfg.drip_enabled,
                            start_date: `${cfg.start_year}-01-01`,
                            end_date: `${cfg.end_year}-12-31`,
                            deposits: cfg.deposits,
                            withdrawals: cfg.withdrawals,
                          });
                          setPortfolioResult(result);
                          setWorkspaceTab("backtest");
                        } catch (e: any) {
                          const msg = e?.detail || e?.message || "Portfolio backtest failed";
                          setBacktestError(msg);
                          setAiMessages(prev => [...prev, { role: "assistant", content: `⚠️ Portfolio backtest failed: ${msg}` }]);
                        } finally {
                          setRunning(false);
                        }
                      }}
                      running={running}
                    />
                  </div>

                  {/* Results tabs */}
                  <Tabs value={workspaceTab} onValueChange={setWorkspaceTab} className="w-full">
                    <TabsList className="h-8 bg-[#0d1321] border border-gray-800/60 mb-4">
                      <TabsTrigger value="backtest" className="text-xs px-4 h-7 data-[state=active]:text-blue-400">
                        <BarChart4 className="h-3.5 w-3.5 mr-1.5" />
                        Results
                      </TabsTrigger>
                      <TabsTrigger value="chart" className="text-xs px-4 h-7 data-[state=active]:text-blue-400">
                        <LineChart className="h-3.5 w-3.5 mr-1.5" />
                        Chart
                      </TabsTrigger>
                      <TabsTrigger value="ledger" className="text-xs px-4 h-7 data-[state=active]:text-blue-400">
                        <History className="h-3.5 w-3.5 mr-1.5" />
                        Ledger
                      </TabsTrigger>
                    </TabsList>

                    <TabsContent value="backtest" className="mt-0">
                      {backtestError && (
                        <Card className="bg-[#0d1321] border-red-500/30 mb-4">
                          <CardContent className="py-4 text-center">
                            <AlertCircle className="h-6 w-6 text-red-400 mx-auto mb-1" />
                            <p className="text-sm text-red-400">{backtestError}</p>
                            <Button size="sm" variant="outline" className="mt-2 text-xs border-gray-700 text-gray-400 hover:text-blue-400"
                              onClick={() => setBacktestError(null)}>
                              Dismiss
                            </Button>
                          </CardContent>
                        </Card>
                      )}
                      {!portfolioResult ? (
                        <Card className="bg-[#0d1321] border-gray-800/60">
                          <CardContent className="py-12 text-center">
                            <BarChart4 className="h-10 w-10 text-gray-700 mx-auto mb-3" />
                            <p className="text-sm text-gray-500">No portfolio results yet</p>
                            <p className="text-xs text-gray-600 mt-1">Configure your portfolio above and click Run.</p>
                          </CardContent>
                        </Card>
                      ) : (
                        <div className="space-y-4">
                          <PortfolioMetricsBar metrics={portfolioResult.metrics} />
                        </div>
                      )}
                    </TabsContent>

                    <TabsContent value="chart" className="mt-0">
                      {portfolioResult ? (
                        <PortfolioChart data={portfolioResult.equity_curve} />
                      ) : (
                        <Card className="bg-[#0d1321] border-gray-800/60">
                          <CardContent className="py-12 text-center">
                            <LineChart className="h-10 w-10 text-gray-700 mx-auto mb-3" />
                            <p className="text-sm text-gray-500">Run a portfolio backtest to see the chart</p>
                          </CardContent>
                        </Card>
                      )}
                    </TabsContent>

                    <TabsContent value="ledger" className="mt-0">
                      {portfolioResult ? (
                        <PortfolioLedger ledger={portfolioResult.ledger} />
                      ) : (
                        <Card className="bg-[#0d1321] border-gray-800/60">
                          <CardContent className="py-12 text-center">
                            <History className="h-10 w-10 text-gray-700 mx-auto mb-3" />
                            <p className="text-sm text-gray-500">Run a portfolio backtest to see the ledger</p>
                          </CardContent>
                        </Card>
                      )}
                    </TabsContent>
                  </Tabs>
                </div>
              ) : (
              /* Original options strategy tabs */
              <div>
                {/* Config panel always visible above tabs */}
                <div className="mb-4">
                  <OptionsConfigPanel
                    onRun={(cfg) => {
                      const freqMap: Record<string, number> = { daily: 1, weekly: 7, biweekly: 14, monthly: 30 };
                      const entry_freq = freqMap[cfg.entry_frequency] || 7;
                      const legsApi = cfg.legs.map(l => ({
                        strike: 0,
                        right: l.right,
                        action: l.action,
                        quantity: l.qty,
                        target_delta: l.target_delta,
                      }));
                      runBacktestWithConfig({
                        ticker: cfg.ticker,
                        legs: legsApi,
                        entry_dte_min: cfg.dte_min,
                        entry_dte_max: cfg.dte_max,
                        hold_until_dte: cfg.hold_until_dte,
                        entry_frequency_days: entry_freq,
                        start_year: cfg.year_range[0],
                        end_year: cfg.year_range[1],
                        delta_min: cfg.delta_min,
                        delta_max: cfg.delta_max,
                        allow_overlapping: cfg.allow_overlapping,
                        slippage_model: cfg.slippage_model,
                        slippage_pct: cfg.slippage_pct,
                        profit_target_pct: cfg.profit_target_pct || null,
                        stop_loss_pct: cfg.stop_loss_pct || null,
                        max_days_in_trade: cfg.max_days_in_trade,
                        entry_trigger_mode: cfg.entry_trigger_mode,
                        indicator_type: cfg.indicator_type,
                        indicator_threshold: cfg.indicator_threshold,
                        indicator_period: cfg.indicator_period,
                        indicator_period2: cfg.indicator_period2,
                        indicator_slots: cfg.indicator_slots,
                        indicator_logic: cfg.indicator_logic,
                      });
                    }}
                    running={running}
                  />
                </div>

                {/* Results tabs */}
                <Tabs value={workspaceTab} onValueChange={setWorkspaceTab} className="w-full">
                <TabsList className="h-8 bg-[#0d1321] border border-gray-800/60 mb-4">
                  <TabsTrigger value="backtest" className="text-xs px-4 h-7 data-[state=active]:text-amber-400">
                    <BarChart4 className="h-3.5 w-3.5 mr-1.5" />
                    Backtest
                  </TabsTrigger>
                  <TabsTrigger value="chart" className="text-xs px-4 h-7 data-[state=active]:text-amber-400">
                    <LineChart className="h-3.5 w-3.5 mr-1.5" />
                    Chart
                  </TabsTrigger>
                  <TabsTrigger value="history" className="text-xs px-4 h-7 data-[state=active]:text-amber-400">
                    <History className="h-3.5 w-3.5 mr-1.5" />
                    History
                  </TabsTrigger>
                </TabsList>

                {/* ════ BACKTEST TAB ════ */}
                <TabsContent value="backtest" className="mt-0">
                  {backtestError ? (
                    <Card className="bg-[#0d1321] border-red-500/30">
                      <CardContent className="py-8 text-center">
                        <AlertCircle className="h-8 w-8 text-red-400 mx-auto mb-2" />
                        <p className="text-sm text-red-400">{backtestError}</p>
                        <Button
                          size="sm"
                          variant="outline"
                          className="mt-3 text-xs border-gray-700 text-gray-400"
                          onClick={runBacktest}
                        >
                          Retry
                        </Button>
                      </CardContent>
                    </Card>
                  ) : !backtestResult ? (
                    <Card className="bg-[#0d1321] border-gray-800/60">
                      <CardContent className="py-12 text-center">
                        <BarChart4 className="h-10 w-10 text-gray-700 mx-auto mb-3" />
                        <p className="text-sm text-gray-500">No backtest results yet</p>
                        <p className="text-xs text-gray-600 mt-1">
                          Configure your strategy and click "Run Backtest" to see results here.
                        </p>
                      </CardContent>
                    </Card>
                  ) : (
                    <div className="space-y-4">
                      {/* Metrics grid */}
                      <Card className="bg-[#0d1321] border-gray-800/60">
                        <CardHeader className="pb-2">
                          <CardTitle className="text-sm font-semibold text-gray-100 flex items-center gap-2">
                            <BarChart4 className="h-4 w-4 text-amber-400/70" />
                            Performance Metrics
                          </CardTitle>
                        </CardHeader>
                        <CardContent>
                          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3">
                            <MetricBox label="Total Trades" value={backtestResult.metrics.total_trades.toString()} color="text-gray-200" />
                            <MetricBox
                              label="Win Rate"
                              value={`${backtestResult.metrics.win_rate.toFixed(1)}%`}
                              color={metricColor(backtestResult.metrics.win_rate, "higher_better", 50, 30)}
                            />
                            <MetricBox
                              label="Total PnL"
                              value={pnlText(backtestResult.metrics.total_pnl)}
                              color={pnlColor(backtestResult.metrics.total_pnl)}
                            />
                            <MetricBox
                              label="Profit Factor"
                              value={backtestResult.metrics.profit_factor.toFixed(2)}
                              color={metricColor(backtestResult.metrics.profit_factor, "higher_better", 1.5, 1.0)}
                            />
                            <MetricBox
                              label="Sharpe"
                              value={backtestResult.metrics.sharpe_ratio.toFixed(2)}
                              color={metricColor(backtestResult.metrics.sharpe_ratio, "higher_better", 1.0, 0.0)}
                            />
                            <MetricBox
                              label="Sortino"
                              value={backtestResult.metrics.sortino_ratio.toFixed(2)}
                              color={metricColor(backtestResult.metrics.sortino_ratio, "higher_better", 1.0, 0.0)}
                            />
                            <MetricBox
                              label="Max DD"
                              value={`${backtestResult.metrics.max_drawdown_pct.toFixed(1)}%`}
                              color={metricColor(backtestResult.metrics.max_drawdown_pct, "lower_better", 10, 30)}
                            />
                            <MetricBox
                              label="Avg DD"
                              value={`${backtestResult.metrics.avg_drawdown_pct.toFixed(1)}%`}
                              color={metricColor(backtestResult.metrics.avg_drawdown_pct, "lower_better", 5, 15)}
                            />
                            <MetricBox
                              label="Calmar"
                              value={backtestResult.metrics.calmar_ratio.toFixed(2)}
                              color={metricColor(backtestResult.metrics.calmar_ratio, "higher_better", 0.5, 0.0)}
                            />
                            <MetricBox
                              label="Avg Win"
                              value={`$${backtestResult.metrics.avg_win.toFixed(2)}`}
                              color="text-emerald-400"
                            />
                            <MetricBox
                              label="Avg Loss"
                              value={`-$${backtestResult.metrics.avg_loss.toFixed(2)}`}
                              color="text-red-400"
                            />
                            <MetricBox
                              label="Avg Days"
                              value={`${backtestResult.metrics.avg_days_held.toFixed(0)}d`}
                              color="text-gray-200"
                            />
                          </div>
                        </CardContent>
                      </Card>

                      {/* Action buttons */}
                      <div className="flex gap-2">
                        <Button
                          size="sm"
                          onClick={() => setWorkspaceTab("chart")}
                          className="h-7 text-xs bg-amber-500/20 text-amber-400 border border-amber-500/30 hover:bg-amber-500/30"
                        >
                          <LineChart className="h-3.5 w-3.5 mr-1" />
                          View Equity Curve
                        </Button>
                        <Button
                          size="sm"
                          variant="outline"
                          onClick={() => setWorkspaceTab("history")}
                          className="h-7 text-xs border-gray-700 text-gray-400"
                        >
                          <History className="h-3.5 w-3.5 mr-1" />
                          Trade Log
                        </Button>
                        <Button
                          size="sm"
                          variant="outline"
                          onClick={analyzeResults}
                          disabled={aiLoading}
                          className="h-7 text-xs border-gray-700 text-gray-400 hover:text-amber-400"
                        >
                          <Brain className="h-3.5 w-3.5 mr-1" />
                          {aiLoading ? "Analyzing..." : "Analyze Results"}
                        </Button>
                      </div>
                    </div>
                  )}
                </TabsContent>

                {/* ════ CHART TAB ════ */}
                <TabsContent value="chart" className="mt-0 space-y-4">
                  <Card className="bg-[#0d1321] border-gray-800/60">
                    <CardHeader className="pb-2">
                      <CardTitle className="text-sm font-semibold text-gray-100 flex items-center gap-2">
                        <LineChart className="h-4 w-4 text-amber-400/70" />
                        Equity Curve & Drawdown
                      </CardTitle>
                    </CardHeader>
                    <CardContent>
                      {!backtestResult || backtestResult.equity_curve.length === 0 ? (
                        <div className="text-center py-12">
                          <TrendingUp className="h-10 w-10 text-gray-700 mx-auto mb-3" />
                          <p className="text-sm text-gray-500">No equity curve data</p>
                          <p className="text-xs text-gray-600 mt-1">Run a backtest to see the equity curve chart here.</p>
                        </div>
                      ) : (
                        <div className="h-[450px] w-full">
                          <ResponsiveContainer width="100%" height="100%">
                            <AreaChart
                              data={(() => {
                                const curve = backtestResult.equity_curve;
                                const start = curve[0]?.equity || 0;
                                return curve.map((p) => ({
                                  date: p.date,
                                  equity: Number(p.equity.toFixed(2)),
                                  drawdown: start > 0 ? Number((((p.equity - start) / start) * 100).toFixed(2)) : 0,
                                }));
                              })()}
                              margin={{ top: 10, right: 20, left: 20, bottom: 10 }}
                            >
                              <CartesianGrid strokeDasharray="3 3" stroke="#1e293b" />
                              <XAxis dataKey="date" tick={{ fill: "#64748b", fontSize: 10 }} tickLine={false}
                                axisLine={{ stroke: "#1e293b" }}
                                tickFormatter={(v: string) => { try { return new Date(v).toLocaleDateString(undefined, { month: "short", day: "numeric" }); } catch { return v; }}} />
                              <YAxis yAxisId="equity" tick={{ fill: "#64748b", fontSize: 10 }} tickLine={false}
                                axisLine={{ stroke: "#1e293b" }}
                                tickFormatter={(v: number) => `$${(v / 1000).toFixed(0)}k`} domain={['auto', 'auto']} />
                              <YAxis yAxisId="dd" orientation="right" tick={{ fill: "#64748b", fontSize: 10 }} tickLine={false}
                                axisLine={{ stroke: "#1e293b" }}
                                tickFormatter={(v: number) => `${v.toFixed(0)}%`} domain={['auto', 5]} reversed />
                              <RechartTooltip contentStyle={{ backgroundColor: "#0d1321", border: "1px solid #1e293b", borderRadius: "8px", fontSize: "12px" }}
                                labelStyle={{ color: "#94a3b8" }}
                                formatter={(value: number, name: string) => [
                                  name === "equity" ? `$${value.toFixed(2)}` : `${value.toFixed(2)}%`, name === "equity" ? "Equity" : "Drawdown"
                                ]} />
                              <Area yAxisId="equity" type="monotone" dataKey="equity" stroke="#f59e0b" fill="#f59e0b" fillOpacity={0.08} strokeWidth={2} dot={false} name="equity" />
                              <Area yAxisId="dd" type="monotone" dataKey="drawdown" stroke="#ef4444" fill="#ef4444" fillOpacity={0.15} strokeWidth={1.5} dot={false} strokeDasharray="4 3" name="drawdown" />
                              <ReferenceLine yAxisId="dd" y={0} stroke="#ef4444" strokeOpacity={0.3} strokeDasharray="2 2" />
                            </AreaChart>
                          </ResponsiveContainer>
                        </div>
                      )}
                    </CardContent>
                  </Card>

                  {/* Return Distribution Histogram */}
                  <Card className="bg-[#0d1321] border-gray-800/60">
                    <CardHeader className="pb-2">
                      <CardTitle className="text-sm font-semibold text-gray-100 flex items-center gap-2">
                        <BarChart className="h-4 w-4 text-amber-400/70" />
                        Return Distribution
                      </CardTitle>
                    </CardHeader>
                    <CardContent>
                      {!backtestResult || backtestResult.trades.length === 0 ? (
                        <div className="text-center py-8">
                          <p className="text-xs text-gray-500">No trade data for distribution</p>
                        </div>
                      ) : (
                        <div className="h-[200px] w-full">
                          <ResponsiveContainer width="100%" height="100%">
                            <BarChart data={(() => {
                              const pnls = backtestResult.trades.map(t => t.pnl);
                              const maxVal = Math.max(...pnls.map(Math.abs), 1);
                              const binCount = 20;
                              const binWidth = (maxVal * 2) / binCount;
                              const bins = Array.from({ length: binCount }, (_, i) => ({
                                binStart: -maxVal + i * binWidth,
                                binEnd: -maxVal + (i + 1) * binWidth,
                                count: 0,
                                isPositive: -maxVal + (i + 0.5) * binWidth >= 0,
                              }));
                              for (const pnl of pnls) {
                                const idx = Math.min(Math.floor((pnl + maxVal) / binWidth), binCount - 1);
                                if (idx >= 0) bins[idx].count++;
                              }
                              return bins.map(b => ({
                                range: `${b.binStart.toFixed(0)}`,
                                count: b.count,
                                fill: b.isPositive ? '#22c55e' : '#ef4444',
                              }));
                            })()}
                            margin={{ top: 5, right: 20, left: 20, bottom: 5 }}>
                              <CartesianGrid strokeDasharray="3 3" stroke="#1e293b" vertical={false} />
                              <XAxis dataKey="range" tick={{ fill: "#64748b", fontSize: 9 }} tickLine={false} axisLine={{ stroke: "#1e293b" }} />
                              <YAxis tick={{ fill: "#64748b", fontSize: 10 }} tickLine={false} axisLine={{ stroke: "#1e293b" }} allowDecimals={false} />
                              <RechartTooltip contentStyle={{ backgroundColor: "#0d1321", border: "1px solid #1e293b", borderRadius: "8px", fontSize: "12px" }}
                                formatter={(value: number) => [value, "Trades"]} />
                              <Bar dataKey="count" radius={[2, 2, 0, 0]}>
                                {(() => {
                                  const data = backtestResult.trades;
                                  const maxVal = Math.max(...data.map(t => Math.abs(t.pnl)), 1);
                                  const binCount = 20;
                                  const binWidth = (maxVal * 2) / binCount;
                                  const colors: string[] = [];
                                  for (let i = 0; i < binCount; i++) {
                                    colors.push((-maxVal + (i + 0.5) * binWidth) >= 0 ? '#22c55e' : '#ef4444');
                                  }
                                  return colors.map((c, i) => <Cell key={i} fill={c} fillOpacity={0.6} />);
                                })()}
                              </Bar>
                            </BarChart>
                          </ResponsiveContainer>
                        </div>
                      )}
                    </CardContent>
                  </Card>

                  {/* Trade summary badges */}
                  {backtestResult && backtestResult.trades.length > 0 && (
                    <Card className="bg-[#0d1321] border-gray-800/60">
                      <CardHeader className="pb-2">
                        <CardTitle className="text-sm font-semibold text-gray-100 flex items-center gap-2">
                          <Timer className="h-4 w-4 text-amber-400/70" />
                          Trade Summary
                        </CardTitle>
                      </CardHeader>
                      <CardContent>
                        <div className="flex items-center gap-4 text-xs text-gray-500 flex-wrap">
                          <span className="flex items-center gap-1.5"><span className="w-2 h-2 rounded-full bg-emerald-400" />{backtestResult.trades.filter((t) => t.pnl > 0).length} Winners</span>
                          <span className="flex items-center gap-1.5"><span className="w-2 h-2 rounded-full bg-red-400" />{backtestResult.trades.filter((t) => t.pnl < 0).length} Losers</span>
                          <span className="flex items-center gap-1.5"><span className="w-2 h-2 rounded-full bg-gray-600" />{backtestResult.trades.filter((t) => t.pnl === 0).length} Breakeven</span>
                          <span className="text-gray-700">|</span>
                          <span>Avg Win: <span className="text-emerald-400 tabular-mono">${backtestResult.metrics.avg_win.toFixed(2)}</span></span>
                          <span>Avg Loss: <span className="text-red-400 tabular-mono">-${backtestResult.metrics.avg_loss.toFixed(2)}</span></span>
                          <span>Payoff: <span className="text-gray-300 tabular-mono">{backtestResult.metrics.payoff_ratio.toFixed(2)}</span></span>
                        </div>
                      </CardContent>
                    </Card>
                  )}
                </TabsContent>

                {/* ════ HISTORY TAB ════ */}
                <TabsContent value="history" className="mt-0">
                  <Card className="bg-[#0d1321] border-gray-800/60">
                    <CardHeader className="pb-2">
                      <CardTitle className="text-sm font-semibold text-gray-100 flex items-center gap-2">
                        <History className="h-4 w-4 text-amber-400/70" />
                        Trade Log — {backtestResult?.trades?.length || 0} trades
                      </CardTitle>
                    </CardHeader>
                    <CardContent className="p-0">
                      {!backtestResult || backtestResult.trades.length === 0 ? (
                        <div className="text-center py-12">
                          <History className="h-10 w-10 text-gray-700 mx-auto mb-3" />
                          <p className="text-sm text-gray-500">No trade history</p>
                          <p className="text-xs text-gray-600 mt-1">Run a backtest to see the trade log here.</p>
                        </div>
                      ) : (
                        <div className="overflow-x-auto max-h-[600px] overflow-y-auto">
                          <Table>
                            <TableHeader>
                              <TableRow className="border-gray-800/60 hover:bg-transparent">
                                <TableHead className="text-[10px] text-gray-600 uppercase tracking-wider h-8 sticky top-0 bg-[#0d1321]">#</TableHead>
                                <TableHead className="text-[10px] text-gray-600 uppercase tracking-wider h-8 sticky top-0 bg-[#0d1321]">Entry</TableHead>
                                <TableHead className="text-[10px] text-gray-600 uppercase tracking-wider h-8 sticky top-0 bg-[#0d1321]">Exit</TableHead>
                                <TableHead className="text-[10px] text-gray-600 uppercase tracking-wider h-8 text-right sticky top-0 bg-[#0d1321]">DTE</TableHead>
                                <TableHead className="text-[10px] text-gray-600 uppercase tracking-wider h-8 text-right sticky top-0 bg-[#0d1321]">Days</TableHead>
                                <TableHead className="text-[10px] text-gray-600 uppercase tracking-wider h-8 text-right sticky top-0 bg-[#0d1321]">Underlying</TableHead>
                                <TableHead className="text-[10px] text-gray-600 uppercase tracking-wider h-8 text-right sticky top-0 bg-[#0d1321]">Δ</TableHead>
                                <TableHead className="text-[10px] text-gray-600 uppercase tracking-wider h-8 text-right sticky top-0 bg-[#0d1321]">Γ</TableHead>
                                <TableHead className="text-[10px] text-gray-600 uppercase tracking-wider h-8 text-right sticky top-0 bg-[#0d1321]">Θ</TableHead>
                                <TableHead className="text-[10px] text-gray-600 uppercase tracking-wider h-8 text-right sticky top-0 bg-[#0d1321]">ν</TableHead>
                                <TableHead className="text-[10px] text-gray-600 uppercase tracking-wider h-8 text-right sticky top-0 bg-[#0d1321]">Margin</TableHead>
                                <TableHead className="text-[10px] text-gray-600 uppercase tracking-wider h-8 text-right sticky top-0 bg-[#0d1321]">P&L</TableHead>
                                <TableHead className="text-[10px] text-gray-600 uppercase tracking-wider h-8 sticky top-0 bg-[#0d1321]">Reason</TableHead>
                              </TableRow>
                            </TableHeader>
                            <TableBody>
                              {backtestResult.trades.map((trade) => {
                                const g = trade.greeks || {};
                                return (
                                  <TableRow key={trade.id} className="border-gray-800/40 hover:bg-white/[0.02]">
                                    <TableCell className="text-xs text-gray-500 h-7">{trade.id}</TableCell>
                                    <TableCell className="text-xs text-gray-300 h-7 tabular-mono">{formatDate(trade.entry_date)}</TableCell>
                                    <TableCell className="text-xs text-gray-300 h-7 tabular-mono">{formatDate(trade.exit_date)}</TableCell>
                                    <TableCell className="text-xs text-gray-300 h-7 text-right tabular-mono">{trade.dte_at_entry}</TableCell>
                                    <TableCell className="text-xs text-gray-300 h-7 text-right tabular-mono">{trade.days_held}</TableCell>
                                    <TableCell className="text-xs text-gray-300 h-7 text-right tabular-mono">${trade.underlying_entry?.toFixed(0) || "—"}</TableCell>
                                    <TableCell className="text-xs text-right h-7 tabular-mono text-blue-300">{typeof g.delta === 'number' ? g.delta.toFixed(1) : "—"}</TableCell>
                                    <TableCell className="text-xs text-right h-7 tabular-mono text-purple-300">{typeof g.gamma === 'number' ? g.gamma.toFixed(3) : "—"}</TableCell>
                                    <TableCell className="text-xs text-right h-7 tabular-mono text-red-300">{typeof g.theta === 'number' ? g.theta.toFixed(2) : "—"}</TableCell>
                                    <TableCell className="text-xs text-right h-7 tabular-mono text-emerald-300">{typeof g.vega === 'number' ? g.vega.toFixed(1) : "—"}</TableCell>
                                    <TableCell className="text-xs text-right h-7 tabular-mono text-gray-400">{trade.margin_required ? `$${trade.margin_required.toFixed(0)}` : "—"}</TableCell>
                                    <TableCell className={`text-xs h-7 text-right tabular-mono font-medium ${pnlColor(trade.pnl)}`}>{pnlText(trade.pnl)}</TableCell>
                                    <TableCell className="text-xs text-gray-400 h-7">{trade.exit_reason?.replace(/_/g, " ")}</TableCell>
                                  </TableRow>
                                );
                              })}
                            </TableBody>
                          </Table>
                        </div>
                      )}
                    </CardContent>
                  </Card>
                </TabsContent>
              </Tabs>
              </div>
              )}
            </>
          )}
        </div>

        {/* ── BOTTOM: AI Assistant Panel ── */}
        {activeProject && (
          <Collapsible
            open={aiOpen}
            onOpenChange={setAiOpen}
            className="border-t border-gray-800/60 bg-[#0d1321]"
          >
            <CollapsibleTrigger asChild>
              <button
                type="button"
                className="w-full flex items-center justify-between px-4 py-2.5 hover:bg-gray-800/30 transition-colors"
              >
                <div className="flex items-center gap-2">
                  <Brain className="h-4 w-4 text-amber-400" />
                  <span className="text-xs font-medium text-gray-300">💬 AI Analysis</span>
                </div>
                {aiOpen ? (
                  <ChevronDown className="h-4 w-4 text-gray-500" />
                ) : (
                  <ChevronUp className="h-4 w-4 text-gray-500" />
                )}
              </button>
            </CollapsibleTrigger>
            <CollapsibleContent>
              <div className="flex flex-col" style={{ height: "280px" }}>
                {/* Messages */}
                <ScrollArea className="flex-1 px-4 py-3">
                  <div className="space-y-3">
                    {aiMessages.map((msg, i) => (
                      <div key={i} className={`flex gap-2 ${msg.role === "user" ? "justify-end" : ""}`}>
                        {msg.role === "assistant" && (
                          <div className="h-6 w-6 rounded-full bg-amber-400/10 flex items-center justify-center shrink-0 mt-0.5">
                            <Bot className="h-3.5 w-3.5 text-amber-400" />
                          </div>
                        )}
                        <div
                          className={`max-w-[75%] rounded-lg px-3 py-2 text-xs leading-relaxed ${
                            msg.role === "user"
                              ? "bg-amber-400/10 text-gray-200"
                              : "bg-[#0a0e17] text-gray-300 border border-gray-800/60"
                          }`}
                        >
                          {msg.content}
                        </div>
                      </div>
                    ))}
                    {aiLoading && (
                      <div className="flex gap-2">
                        <div className="h-6 w-6 rounded-full bg-amber-400/10 flex items-center justify-center shrink-0 mt-0.5">
                          <Bot className="h-3.5 w-3.5 text-amber-400" />
                        </div>
                        <div className="bg-[#0a0e17] rounded-lg px-3 py-2 border border-gray-800/60">
                          <Loader2 className="h-3.5 w-3.5 animate-spin text-amber-400" />
                        </div>
                      </div>
                    )}
                    <div ref={aiBottomRef} />
                  </div>
                </ScrollArea>

                {/* Input */}
                <div className="flex items-center gap-2 px-4 py-2.5 border-t border-gray-800/60">
                  <input
                    type="file"
                    accept=".json"
                    onChange={(e) => {
                      const file = e.target.files?.[0];
                      if (!file) return;
                      const reader = new FileReader();
                      reader.onload = (ev) => {
                        try {
                          const json = JSON.parse(ev.target?.result as string);
                          analyzeJsonFile(json);
                        } catch { /* invalid JSON */ }
                      };
                      reader.readAsText(file);
                      e.target.value = ""; // reset
                    }}
                    className="hidden"
                    id="ai-file-upload"
                  />
                  <label
                    htmlFor="ai-file-upload"
                    className="h-8 w-8 flex items-center justify-center rounded border border-gray-700 text-gray-500 hover:text-gray-300 hover:border-gray-600 cursor-pointer transition-colors text-xs"
                    title="Upload backtest JSON file for analysis"
                  >
                    📄
                  </label>
                  <Input
                    value={aiInput}
                    onChange={(e) => setAiInput(e.target.value)}
                    onKeyDown={(e) => e.key === "Enter" && sendAiMessage()}
                    placeholder="Ask a question about your strategy..."
                    className="h-8 text-xs bg-[#0a0e17] border-gray-700 text-gray-200 flex-1"
                    disabled={aiLoading}
                  />
                  <Button
                    size="sm"
                    onClick={sendAiMessage}
                    disabled={!aiInput.trim() || aiLoading}
                    className="h-8 w-8 p-0 bg-amber-500/20 text-amber-400 border border-amber-500/30 hover:bg-amber-500/30"
                  >
                    <Send className="h-3.5 w-3.5" />
                  </Button>
                </div>
              </div>
            </CollapsibleContent>
          </Collapsible>
        )}
      </div>

      {/* ── Dialogs ── */}
      <CreateProjectDialog
        open={showCreate}
        onOpenChange={setShowCreate}
        onCreated={loadProjects}
      />
      <DeleteConfirmDialog
        open={showDelete}
        onOpenChange={setShowDelete}
        projectId={deleteTarget?.id ?? ""}
        projectName={deleteTarget?.name ?? ""}
        onDeleted={() => {
          if (deleteTarget?.id === activeProjectId) {
            setActiveProjectId(null);
          }
          loadProjects();
        }}
      />
      {/* Naming dialog for saved runs */}
      <Dialog open={showNameDialog} onOpenChange={setShowNameDialog}>
        <DialogContent className="sm:max-w-sm bg-[#0d1321] border-gray-700 text-gray-200">
          <DialogHeader>
            <DialogTitle className="text-sm text-gray-100 flex items-center gap-2">
              <FolderKanban className="h-4 w-4 text-amber-400" />
              Name Your Backtest Run
            </DialogTitle>
            <DialogDescription className="text-xs text-gray-500">
              Give this run a descriptive name so you can find it later.
            </DialogDescription>
          </DialogHeader>
          <div className="py-2">
            <Input
              value={pendingRunName}
              onChange={(e) => setPendingRunName(e.target.value)}
              placeholder="e.g. SPY 0.16Δ PCS 2024-2025"
              className="bg-[#0a0e17] border-gray-700 text-gray-200 text-sm"
              autoFocus
              onKeyDown={(e) => {
                if (e.key === "Enter") {
                  setShowNameDialog(false);
                  if (pendingRunSeq && activeProjectId && pendingRunName.trim()) {
                    api.post(`/api/backtest/options/projects/${activeProjectId}/results/${pendingRunSeq}/rename`, {
                      name: pendingRunName.trim(),
                    }).then(() => loadSavedRuns()).catch(() => {});
                  }
                }
              }}
            />
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowNameDialog(false)}
              className="border-gray-700 text-gray-400 text-xs h-8">
              Skip
            </Button>
            <Button onClick={() => {
              setShowNameDialog(false);
              if (pendingRunSeq && activeProjectId && pendingRunName.trim()) {
                api.post(`/api/backtest/options/projects/${activeProjectId}/results/${pendingRunSeq}/rename`, {
                  name: pendingRunName.trim(),
                }).then(() => loadSavedRuns()).catch(() => {});
              }
            }}
              className="bg-amber-500/20 text-amber-400 border border-amber-500/30 hover:bg-amber-500/30 text-xs h-8">
              Save Name
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

/* ════════════════════════════════════════════════ */
/*  SUB-COMPONENTS                                 */
/* ════════════════════════════════════════════════ */

function MetricBox({ label, value, color }: { label: string; value: string; color: string }) {
  return (
    <div className="bg-[#0a0e17] rounded-lg p-3 border border-gray-800/40">
      <div className="text-[10px] text-gray-500 uppercase tracking-wider mb-1">{label}</div>
      <div className={`text-sm font-semibold tabular-mono ${color}`}>{value}</div>
    </div>
  );
}

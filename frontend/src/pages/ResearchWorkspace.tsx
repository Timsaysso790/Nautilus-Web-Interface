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
  ChevronDown, ChevronUp, Play, Save, Settings2, Brain,
  TrendingUp, TrendingDown, Minus, AlertCircle,
} from "lucide-react";
import {
  LineChart as RechartLine, Line, XAxis, YAxis, CartesianGrid,
  Tooltip as RechartTooltip, ResponsiveContainer,
} from "recharts";
import api from "@/lib/api";
import { TickerSelect } from "@/components/backtest/TickerSelect";
import {
  PortfolioConfigPanel, PortfolioMetricsBar, PortfolioChart, PortfolioLedger,
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
/*  PRESETS — strategy leg templates               */
/* ════════════════════════════════════════════════ */

const PRESETS: Record<string, StrategyLeg[]> = {
  "Put Credit Spread": [
    { strike: 0, right: "P", action: "sell", qty: 1 },
    { strike: 0, right: "P", action: "buy", qty: 1 },
  ],
  "Iron Condor": [
    { strike: 0, right: "P", action: "sell", qty: 1 },
    { strike: 0, right: "P", action: "buy", qty: 1 },
    { strike: 0, right: "C", action: "sell", qty: 1 },
    { strike: 0, right: "C", action: "buy", qty: 1 },
  ],
  "Call Debit Spread": [
    { strike: 0, right: "C", action: "buy", qty: 1 },
    { strike: 0, right: "C", action: "sell", qty: 1 },
  ],
};

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
  const [workspaceTab, setWorkspaceTab] = useState("config");

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

  const applyPreset = (name: string) => {
    const template = PRESETS[name];
    if (!template) return;
    setLegs(template.map((l) => ({ ...l })));
  };

  const buildConfig = (): BacktestConfig => ({
    ticker,
    legs,
    dte_min: dteMin,
    dte_max: dteMax,
    hold_until_dte: holdUntilDte,
    entry_frequency: entryFrequency,
    year_range: [yearRangeStart, yearRangeEnd],
  });

  /* ────────────── Run Backtest ────────────── */

  const runBacktest = async () => {
    if (running) return;
    setRunning(true);
    setBacktestError(null);
    setBacktestResult(null);
    const config = buildConfig();
    try {
      const result = await api.post<BacktestResult>("/api/backtest/options/run", config);
      setBacktestResult(result);
      setWorkspaceTab("backtest");
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : "Backtest failed";
      setBacktestError(msg);
    } finally {
      setRunning(false);
    }
  };

  /* ────────────── Save Config ────────────── */

  const saveConfig = async () => {
    if (!activeProjectId || saving) return;
    setSaving(true);
    try {
      await api.post(`/api/backtest/projects/${activeProjectId}/config`, {
        config_id: crypto.randomUUID(),
        config: buildConfig(),
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
      const data = await api.post<{ response: string }>("/api/ai/analyze-backtest", {
        backtest_results: {
          metrics: backtestResult.metrics,
          total_trades: backtestResult.trades.length,
        },
        question,
      });
      setAiMessages((prev) => [
        ...prev,
        { role: "user", content: "📊 Analyze my backtest results" },
        { role: "assistant", content: data.response },
      ]);
    } catch {
      setAiMessages((prev) => [
        ...prev,
        { role: "assistant", content: "⚠️ AI analysis unavailable. Check that the AI backend is running." },
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
      const data = await api.post<{ response: string }>("/api/ai/chat", {
        messages: [{ role: "user", content: userMsg.content }],
        temperature: 0.3,
        max_tokens: 2000,
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
              </div>

              {/* Tabs — different content based on project type */}
              {activeProject.project_type === "portfolio" ? (
                <>
                  <Tabs value={workspaceTab} onValueChange={setWorkspaceTab} className="w-full">
                    <TabsList className="h-8 bg-[#0d1321] border border-gray-800/60 mb-4">
                      <TabsTrigger value="config" className="text-xs px-4 h-7 data-[state=active]:text-blue-400">
                        <Settings2 className="h-3.5 w-3.5 mr-1.5" />
                        Portfolio Config
                      </TabsTrigger>
                      <TabsTrigger value="backtest" className="text-xs px-4 h-7 data-[state=active]:text-blue-400">
                        <BarChart4 className="h-3.5 w-3.5 mr-1.5" />
                        Results
                      </TabsTrigger>
                      <TabsTrigger value="chart" className="text-xs px-4 h-7 data-[state=active]:text-blue-400">
                        <LineChart className="h-3.5 w-3.5 mr-1.5" />
                        Chart
                      </TabsTrigger>
                      <TabsTrigger value="history" className="text-xs px-4 h-7 data-[state=active]:text-blue-400">
                        <History className="h-3.5 w-3.5 mr-1.5" />
                        Ledger
                      </TabsTrigger>
                    </TabsList>

                    <TabsContent value="config" className="mt-0">
                      <PortfolioConfigPanel onResult={(r) => { setPortfolioResult(r); setWorkspaceTab("backtest"); }} />
                    </TabsContent>

                    <TabsContent value="backtest" className="mt-0">
                      {!portfolioResult ? (
                        <Card className="bg-[#0d1321] border-gray-800/60">
                          <CardContent className="py-12 text-center">
                            <BarChart4 className="h-10 w-10 text-gray-700 mx-auto mb-3" />
                            <p className="text-sm text-gray-500">No portfolio results yet</p>
                            <p className="text-xs text-gray-600 mt-1">Configure your portfolio and click "Run Portfolio Backtest" above.</p>
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

                    <TabsContent value="history" className="mt-0">
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
                </>
              ) : (
              /* Original options strategy tabs */
              <Tabs value={workspaceTab} onValueChange={setWorkspaceTab} className="w-full">
                <TabsList className="h-8 bg-[#0d1321] border border-gray-800/60 mb-4">
                  <TabsTrigger value="config" className="text-xs px-4 h-7 data-[state=active]:text-amber-400">
                    <Settings2 className="h-3.5 w-3.5 mr-1.5" />
                    Config
                  </TabsTrigger>
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

                {/* ════ CONFIG TAB ════ */}
                <TabsContent value="config" className="mt-0 space-y-4">
                  {/* Ticker */}
                  <Card className="bg-[#0d1321] border-gray-800/60">
                    <CardHeader className="pb-2">
                      <CardTitle className="text-sm font-semibold text-gray-100 flex items-center gap-2">
                        <Activity className="h-4 w-4 text-amber-400/70" />
                        Strategy Configuration
                      </CardTitle>
                    </CardHeader>
                    <CardContent className="space-y-4">
                      <div className="flex items-center gap-3">
                        <div className="space-y-1">
                          <Label className="text-[11px] text-gray-500">Ticker</Label>
                          <TickerSelect
                            value={ticker}
                            onChange={setTicker}
                            className="w-32"
                          />
                        </div>
                      </div>

                      {/* Presets */}
                      <div>
                        <Label className="text-[11px] text-gray-500 mb-1.5 block">Presets</Label>
                        <div className="flex gap-2 flex-wrap">
                          {Object.keys(PRESETS).map((name) => (
                            <Button
                              key={name}
                              size="sm"
                              variant="outline"
                              className="text-[10px] h-6 border-gray-700 text-gray-400 hover:text-amber-400 hover:border-amber-500/40"
                              onClick={() => applyPreset(name)}
                            >
                              {name}
                            </Button>
                          ))}
                        </div>
                      </div>

                      {/* Leg builder */}
                      <div>
                        <div className="flex items-center justify-between mb-2">
                          <Label className="text-[11px] text-gray-500">Legs</Label>
                          <Button
                            size="sm"
                            variant="ghost"
                            className="h-6 text-[10px] text-amber-400 hover:text-amber-300"
                            onClick={addLeg}
                          >
                            <Plus className="h-3 w-3 mr-0.5" /> Add Leg
                          </Button>
                        </div>
                        <div className="space-y-1.5">
                          {legs.map((leg, i) => (
                            <div
                              key={i}
                              className="flex items-center gap-2 bg-[#0a0e17] rounded-lg px-3 py-2 border border-gray-800/40"
                            >
                              <span className="text-[10px] text-gray-600 w-5">{i + 1}.</span>
                              <Select
                                value={leg.action}
                                onValueChange={(v) => updateLeg(i, "action", v)}
                              >
                                <SelectTrigger className="w-16 h-7 text-[11px] bg-[#0d1321] border-gray-700 text-gray-300">
                                  <SelectValue />
                                </SelectTrigger>
                                <SelectContent className="bg-[#0d1321] border-gray-700 text-gray-300">
                                  <SelectItem value="buy" className="text-xs">
                                    <span className="text-emerald-400">Buy</span>
                                  </SelectItem>
                                  <SelectItem value="sell" className="text-xs">
                                    <span className="text-red-400">Sell</span>
                                  </SelectItem>
                                </SelectContent>
                              </Select>
                              <Select
                                value={leg.right}
                                onValueChange={(v) => updateLeg(i, "right", v)}
                              >
                                <SelectTrigger className="w-14 h-7 text-[11px] bg-[#0d1321] border-gray-700 text-gray-300">
                                  <SelectValue />
                                </SelectTrigger>
                                <SelectContent className="bg-[#0d1321] border-gray-700 text-gray-300">
                                  <SelectItem value="C" className="text-xs">
                                    <span className="text-emerald-400">C</span>
                                  </SelectItem>
                                  <SelectItem value="P" className="text-xs">
                                    <span className="text-red-400">P</span>
                                  </SelectItem>
                                </SelectContent>
                              </Select>
                              <div className="flex items-center gap-1 flex-1">
                                <Label className="text-[9px] text-gray-600">Strike</Label>
                                <Input
                                  type="number"
                                  value={leg.strike || ""}
                                  onChange={(e) => updateLeg(i, "strike", Number(e.target.value))}
                                  className="w-20 h-7 text-[11px] bg-[#0a0e17] border-gray-700 text-gray-200"
                                  placeholder="0"
                                />
                              </div>
                              <div className="flex items-center gap-1">
                                <Label className="text-[9px] text-gray-600">Qty</Label>
                                <Input
                                  type="number"
                                  value={leg.qty}
                                  onChange={(e) => updateLeg(i, "qty", Number(e.target.value))}
                                  className="w-14 h-7 text-[11px] bg-[#0a0e17] border-gray-700 text-gray-200"
                                  min={1}
                                />
                              </div>
                              <button
                                onClick={() => removeLeg(i)}
                                className="p-1 text-gray-600 hover:text-red-400 transition-colors"
                                title="Remove leg"
                              >
                                <X className="h-3 w-3" />
                              </button>
                            </div>
                          ))}
                        </div>
                      </div>

                      {/* Strategy params */}
                      <div>
                        <Label className="text-[11px] text-gray-500 mb-2 block">Strategy Parameters</Label>
                        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-3">
                          <div className="space-y-1">
                            <Label className="text-[10px] text-gray-500">DTE Min</Label>
                            <Input
                              type="number"
                              value={dteMin}
                              onChange={(e) => setDteMin(Number(e.target.value))}
                              className="h-7 text-xs bg-[#0a0e17] border-gray-700 text-gray-200"
                              min={1}
                            />
                          </div>
                          <div className="space-y-1">
                            <Label className="text-[10px] text-gray-500">DTE Max</Label>
                            <Input
                              type="number"
                              value={dteMax}
                              onChange={(e) => setDteMax(Number(e.target.value))}
                              className="h-7 text-xs bg-[#0a0e17] border-gray-700 text-gray-200"
                              min={1}
                            />
                          </div>
                          <div className="space-y-1">
                            <Label className="text-[10px] text-gray-500">Hold Until DTE</Label>
                            <Input
                              type="number"
                              value={holdUntilDte}
                              onChange={(e) => setHoldUntilDte(Number(e.target.value))}
                              className="h-7 text-xs bg-[#0a0e17] border-gray-700 text-gray-200"
                              min={0}
                            />
                          </div>
                          <div className="space-y-1">
                            <Label className="text-[10px] text-gray-500">Entry Freq</Label>
                            <Select value={entryFrequency} onValueChange={setEntryFrequency}>
                              <SelectTrigger className="h-7 text-xs bg-[#0a0e17] border-gray-700 text-gray-200">
                                <SelectValue />
                              </SelectTrigger>
                              <SelectContent className="bg-[#0d1321] border-gray-700 text-gray-200">
                                <SelectItem value="daily" className="text-xs">Daily</SelectItem>
                                <SelectItem value="weekly" className="text-xs">Weekly</SelectItem>
                                <SelectItem value="monthly" className="text-xs">Monthly</SelectItem>
                              </SelectContent>
                            </Select>
                          </div>
                          <div className="space-y-1">
                            <Label className="text-[10px] text-gray-500">Year Range</Label>
                            <div className="flex items-center gap-1">
                              <Input
                                type="number"
                                value={yearRangeStart}
                                onChange={(e) => setYearRangeStart(Number(e.target.value))}
                                className="h-7 text-xs bg-[#0a0e17] border-gray-700 text-gray-200 w-full"
                              />
                              <span className="text-gray-600 text-[10px]">→</span>
                              <Input
                                type="number"
                                value={yearRangeEnd}
                                onChange={(e) => setYearRangeEnd(Number(e.target.value))}
                                className="h-7 text-xs bg-[#0a0e17] border-gray-700 text-gray-200 w-full"
                              />
                            </div>
                          </div>
                        </div>
                      </div>

                      {/* Actions */}
                      <div className="flex items-center gap-3 pt-2 border-t border-gray-800/40">
                        <Button
                          size="sm"
                          onClick={runBacktest}
                          disabled={running || legs.length === 0}
                          className="h-8 text-xs bg-emerald-500/20 text-emerald-400 border border-emerald-500/30 hover:bg-emerald-500/30"
                        >
                          {running ? (
                            <Loader2 className="h-3.5 w-3.5 animate-spin mr-1.5" />
                          ) : (
                            <Play className="h-3.5 w-3.5 mr-1.5" />
                          )}
                          {running ? "Running..." : "Run Backtest"}
                        </Button>
                        <Button
                          size="sm"
                          variant="outline"
                          onClick={saveConfig}
                          disabled={saving || legs.length === 0}
                          className="h-8 text-xs border-gray-700 text-gray-400 hover:text-amber-400"
                        >
                          <Save className="h-3.5 w-3.5 mr-1.5" />
                          {saving ? "Saving..." : "Save Config"}
                        </Button>
                      </div>
                    </CardContent>
                  </Card>
                </TabsContent>

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
                <TabsContent value="chart" className="mt-0">
                  <Card className="bg-[#0d1321] border-gray-800/60">
                    <CardHeader className="pb-2">
                      <CardTitle className="text-sm font-semibold text-gray-100 flex items-center gap-2">
                        <LineChart className="h-4 w-4 text-amber-400/70" />
                        Equity Curve
                      </CardTitle>
                    </CardHeader>
                    <CardContent>
                      {!backtestResult || backtestResult.equity_curve.length === 0 ? (
                        <div className="text-center py-12">
                          <TrendingUp className="h-10 w-10 text-gray-700 mx-auto mb-3" />
                          <p className="text-sm text-gray-500">No equity curve data</p>
                          <p className="text-xs text-gray-600 mt-1">
                            Run a backtest to see the equity curve chart here.
                          </p>
                        </div>
                      ) : (
                        <div className="h-[400px] w-full">
                          <ResponsiveContainer width="100%" height="100%">
                            <RechartLine
                              data={backtestResult.equity_curve.map((p) => ({
                                ...p,
                                value: Number(p.equity.toFixed(2)),
                              }))}
                              margin={{ top: 10, right: 20, left: 20, bottom: 10 }}
                            >
                              <CartesianGrid strokeDasharray="3 3" stroke="#1e293b" />
                              <XAxis
                                dataKey="date"
                                tick={{ fill: "#64748b", fontSize: 10 }}
                                tickLine={false}
                                axisLine={{ stroke: "#1e293b" }}
                                tickFormatter={(v: string) => {
                                  try {
                                    const d = new Date(v);
                                    return d.toLocaleDateString(undefined, { month: "short", day: "numeric" });
                                  } catch {
                                    return v;
                                  }
                                }}
                              />
                              <YAxis
                                tick={{ fill: "#64748b", fontSize: 10 }}
                                tickLine={false}
                                axisLine={{ stroke: "#1e293b" }}
                                tickFormatter={(v: number) => `$${v.toLocaleString()}`}
                              />
                              <RechartTooltip
                                contentStyle={{
                                  backgroundColor: "#0d1321",
                                  border: "1px solid #1e293b",
                                  borderRadius: "8px",
                                  fontSize: "12px",
                                }}
                                labelStyle={{ color: "#94a3b8" }}
                                formatter={(value: number) => [`$${value.toFixed(2)}`, "Equity"]}
                              />
                              <Line
                                type="monotone"
                                dataKey="value"
                                stroke="#f59e0b"
                                strokeWidth={2}
                                dot={false}
                                activeDot={{ r: 4, fill: "#f59e0b" }}
                              />
                            </RechartLine>
                          </ResponsiveContainer>
                        </div>
                      )}
                    </CardContent>
                  </Card>

                  {/* Trade markers */}
                  {backtestResult && backtestResult.trades.length > 0 && (
                    <Card className="bg-[#0d1321] border-gray-800/60 mt-4">
                      <CardHeader className="pb-2">
                        <CardTitle className="text-sm font-semibold text-gray-100 flex items-center gap-2">
                          <Timer className="h-4 w-4 text-amber-400/70" />
                          Trade Summary on Chart
                        </CardTitle>
                      </CardHeader>
                      <CardContent>
                        <div className="flex items-center gap-4 text-xs text-gray-500">
                          <div className="flex items-center gap-1.5">
                            <TrendingUp className="h-3.5 w-3.5 text-emerald-400" />
                            <span>{backtestResult.trades.filter((t) => t.pnl > 0).length} Winners</span>
                          </div>
                          <div className="flex items-center gap-1.5">
                            <TrendingDown className="h-3.5 w-3.5 text-red-400" />
                            <span>{backtestResult.trades.filter((t) => t.pnl < 0).length} Losers</span>
                          </div>
                          <div className="flex items-center gap-1.5">
                            <Minus className="h-3.5 w-3.5 text-gray-600" />
                            <span>{backtestResult.trades.filter((t) => t.pnl === 0).length} Breakeven</span>
                          </div>
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
                        Trade Log
                      </CardTitle>
                    </CardHeader>
                    <CardContent className="p-0">
                      {!backtestResult || backtestResult.trades.length === 0 ? (
                        <div className="text-center py-12">
                          <History className="h-10 w-10 text-gray-700 mx-auto mb-3" />
                          <p className="text-sm text-gray-500">No trade history</p>
                          <p className="text-xs text-gray-600 mt-1">
                            Run a backtest to see the trade log here.
                          </p>
                        </div>
                      ) : (
                        <div className="overflow-x-auto">
                          <Table>
                            <TableHeader>
                              <TableRow className="border-gray-800/60 hover:bg-transparent">
                                <TableHead className="text-[10px] text-gray-600 uppercase tracking-wider h-8">#</TableHead>
                                <TableHead className="text-[10px] text-gray-600 uppercase tracking-wider h-8">Entry Date</TableHead>
                                <TableHead className="text-[10px] text-gray-600 uppercase tracking-wider h-8">Exit Date</TableHead>
                                <TableHead className="text-[10px] text-gray-600 uppercase tracking-wider h-8 text-right">DTE</TableHead>
                                <TableHead className="text-[10px] text-gray-600 uppercase tracking-wider h-8 text-right">Days Held</TableHead>
                                <TableHead className="text-[10px] text-gray-600 uppercase tracking-wider h-8 text-right">PnL</TableHead>
                                <TableHead className="text-[10px] text-gray-600 uppercase tracking-wider h-8">Exit Reason</TableHead>
                              </TableRow>
                            </TableHeader>
                            <TableBody>
                              {backtestResult.trades.map((trade) => (
                                <TableRow
                                  key={trade.id}
                                  className="border-gray-800/40 hover:bg-white/[0.02]"
                                >
                                  <TableCell className="text-xs text-gray-500 h-8">{trade.id}</TableCell>
                                  <TableCell className="text-xs text-gray-300 h-8 tabular-mono">
                                    {formatDate(trade.entry_date)}
                                  </TableCell>
                                  <TableCell className="text-xs text-gray-300 h-8 tabular-mono">
                                    {formatDate(trade.exit_date)}
                                  </TableCell>
                                  <TableCell className="text-xs text-gray-300 h-8 text-right tabular-mono">
                                    {trade.dte_at_entry}
                                  </TableCell>
                                  <TableCell className="text-xs text-gray-300 h-8 text-right tabular-mono">
                                    {trade.days_held}
                                  </TableCell>
                                  <TableCell className={`text-xs h-8 text-right tabular-mono font-medium ${pnlColor(trade.pnl)}`}>
                                    {pnlText(trade.pnl)}
                                  </TableCell>
                                  <TableCell className="text-xs text-gray-400 h-8">{trade.exit_reason}</TableCell>
                                </TableRow>
                              ))}
                            </TableBody>
                          </Table>
                        </div>
                      )}
                    </CardContent>
                  </Card>
                </TabsContent>
              </Tabs>
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

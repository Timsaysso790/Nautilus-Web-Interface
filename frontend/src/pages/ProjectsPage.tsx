import { useState, useEffect, useCallback } from "react";
import {
  Card, CardContent, CardHeader, CardTitle, CardDescription,
} from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Dialog, DialogContent, DialogDescription, DialogFooter,
  DialogHeader, DialogTitle,
} from "@/components/ui/dialog";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel,
  AlertDialogContent, AlertDialogDescription, AlertDialogFooter,
  AlertDialogHeader, AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import { Separator } from "@/components/ui/separator";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Skeleton } from "@/components/ui/skeleton";
import {
  FolderKanban, Plus, Trash2, Loader2, Files, FileJson,
  FolderOpen, Calendar, Database, AlertCircle, FileText,
} from "lucide-react";
import api from "@/lib/api";

/* ───────── Types ───────── */

interface BacktestProject {
  id: string;
  name: string;
  project_type: string;
  project_slug: string;
  created_at: string;
  updated_at: string;
  config_count: number;
}

interface FileEntry {
  id: string;
  name: string;
  path: string;
  size: number;
  mime_type?: string;
  created_at?: string;
}

interface ProjectDetail {
  id: string;
  name: string;
  project_type: string;
  project_slug: string;
  created_at: string;
  updated_at: string;
  config_count: number;
  files: FileEntry[];
}

/* ───────── Helpers ───────── */

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

function formatDateTime(iso: string): string {
  try {
    const d = new Date(iso);
    return d.toLocaleString(undefined, {
      month: "short", day: "numeric", year: "numeric",
      hour: "2-digit", minute: "2-digit",
    });
  } catch {
    return iso;
  }
}

function formatFileSize(bytes: number): string {
  if (bytes >= 1_000_000) return `${(bytes / 1_000_000).toFixed(1)} MB`;
  if (bytes >= 1_000) return `${(bytes / 1_000).toFixed(0)} KB`;
  return `${bytes} B`;
}

const TYPE_LABELS: Record<string, string> = {
  options: "Options Strategy",
  portfolio: "Stock Portfolio",
  backtest: "Backtest",
};

const TYPE_COLORS: Record<string, string> = {
  options: "bg-violet-500/15 text-violet-400 border-violet-500/30",
  portfolio: "bg-blue-500/15 text-blue-400 border-blue-500/30",
  backtest: "bg-emerald-500/15 text-emerald-400 border-emerald-500/30",
};

function getTypeLabel(t: string): string {
  return TYPE_LABELS[t] ?? t;
}

function getTypeBadgeClass(t: string): string {
  return TYPE_COLORS[t] ?? "bg-muted text-muted-foreground border-border";
}

/* ───────── Project Card ───────── */

function ProjectCard({
  project,
  selected,
  onSelect,
  onDelete,
}: {
  project: BacktestProject;
  selected: boolean;
  onSelect: () => void;
  onDelete: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onSelect}
      className={[
        "w-full text-left rounded-lg border p-4 transition-all duration-150",
        "hover:border-primary/40 hover:bg-primary/5",
        selected
          ? "border-primary/50 bg-primary/8 shadow-sm shadow-primary/5"
          : "border-border bg-[#0d1321]",
      ].join(" ")}
    >
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2 mb-1">
            <FolderKanban className="h-4 w-4 shrink-0 text-muted-foreground" />
            <span className="text-sm font-medium truncate">{project.name}</span>
          </div>
          <div className="flex items-center gap-2 mt-1.5">
            <Badge
              variant="outline"
              className={["text-[10px] px-1.5 py-0", getTypeBadgeClass(project.project_type)].join(" ")}
            >
              {getTypeLabel(project.project_type)}
            </Badge>
            <span className="text-[11px] text-muted-foreground">
              {project.config_count} config{project.config_count !== 1 ? "s" : ""}
            </span>
          </div>
          <div className="flex items-center gap-1 mt-2 text-[10px] text-muted-foreground">
            <Calendar className="h-3 w-3" />
            <span>{formatDate(project.created_at)}</span>
          </div>
        </div>
        <button
          type="button"
          onClick={(e) => {
            e.stopPropagation();
            onDelete();
          }}
          className="shrink-0 p-1.5 rounded-md text-muted-foreground hover:text-red-400 hover:bg-red-500/10 transition-colors"
          title="Delete project"
        >
          <Trash2 className="h-3.5 w-3.5" />
        </button>
      </div>
    </button>
  );
}

/* ───────── Create Dialog ───────── */

function CreateProjectDialog({
  open,
  onOpenChange,
  onCreated,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onCreated: () => void;
}) {
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
      await api.post<{ project: BacktestProject }>("/api/backtest/projects", {
        name: name.trim(),
        type,
      });
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
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <FolderKanban className="h-5 w-5" /> New Backtest Project
          </DialogTitle>
          <DialogDescription>
            Create a new project to organize your backtest strategies, configs, and data files.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4 py-2">
          <div className="space-y-1.5">
            <Label htmlFor="project-name">Project Name</Label>
            <Input
              id="project-name"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="e.g. QDTE Ladder Strategy"
              onKeyDown={(e) => e.key === "Enter" && handleCreate()}
              autoFocus
              disabled={creating}
            />
          </div>

          <div className="space-y-1.5">
            <Label>Project Type</Label>
            <Select value={type} onValueChange={setType}>
              <SelectTrigger className="w-full">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="options">
                  <span className="flex items-center gap-2">
                    <span className="w-2 h-2 rounded-full bg-violet-400" />
                    Options Strategy Backtest
                  </span>
                </SelectItem>
                <SelectItem value="portfolio">
                  <span className="flex items-center gap-2">
                    <span className="w-2 h-2 rounded-full bg-blue-400" />
                    Stock Portfolio Backtest
                  </span>
                </SelectItem>
              </SelectContent>
            </Select>
          </div>

          {error && (
            <div className="flex items-center gap-2 rounded-lg border border-red-500/30 bg-red-500/10 px-3 py-2 text-xs text-red-400">
              <AlertCircle className="h-3.5 w-3.5 shrink-0" />
              {error}
            </div>
          )}
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={creating}>
            Cancel
          </Button>
          <Button onClick={handleCreate} disabled={!name.trim() || creating}>
            {creating && <Loader2 className="h-4 w-4 animate-spin" />}
            {creating ? "Creating..." : "Create Project"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

/* ───────── Delete Confirmation ───────── */

function DeleteConfirmDialog({
  open,
  onOpenChange,
  projectName,
  onDeleted,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  projectName: string;
  onDeleted: () => void;
}) {
  const [deleting, setDeleting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleDelete = useCallback(async () => {
    setDeleting(true);
    setError(null);
    try {
      onDeleted();
      onOpenChange(false);
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : "Failed to delete project";
      setError(msg);
    } finally {
      setDeleting(false);
    }
  }, [onDeleted, onOpenChange]);

  return (
    <AlertDialog open={open} onOpenChange={onOpenChange}>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle className="flex items-center gap-2 text-red-400">
            <Trash2 className="h-5 w-5" /> Delete Project
          </AlertDialogTitle>
          <AlertDialogDescription>
            Are you sure you want to delete <strong className="text-foreground">{projectName}</strong>?
            This action cannot be undone. All associated files, configs, and data will be permanently removed.
          </AlertDialogDescription>
        </AlertDialogHeader>

        {error && (
          <div className="flex items-center gap-2 rounded-lg border border-red-500/30 bg-red-500/10 px-3 py-2 text-xs text-red-400">
            <AlertCircle className="h-3.5 w-3.5 shrink-0" />
            {error}
          </div>
        )}

        <AlertDialogFooter>
          <AlertDialogCancel disabled={deleting}>Cancel</AlertDialogCancel>
          <AlertDialogAction
            onClick={handleDelete}
            disabled={deleting}
            className="bg-red-600 hover:bg-red-700 text-white"
          >
            {deleting && <Loader2 className="h-4 w-4 animate-spin" />}
            {deleting ? "Deleting..." : "Delete Project"}
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}

/* ───────── Project Detail Panel ───────── */

function FileListCard({ files }: { files: FileEntry[] }) {
  if (files.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center py-8 text-center">
        <FileText className="h-8 w-8 text-muted-foreground/40 mb-2" />
        <p className="text-xs text-muted-foreground">No files uploaded yet</p>
      </div>
    );
  }

  return (
    <div className="space-y-1">
      {files.map((file) => (
        <div
          key={file.id}
          className="flex items-center justify-between rounded-lg border border-border/50 bg-[#0d1321] px-3 py-2.5 transition-colors hover:border-border"
        >
          <div className="flex items-center gap-2.5 min-w-0">
            <Files className="h-4 w-4 shrink-0 text-muted-foreground" />
            <div className="min-w-0">
              <p className="text-sm truncate">{file.name}</p>
              <p className="text-[10px] text-muted-foreground">
                {formatFileSize(file.size)}
                {file.created_at && ` · ${formatDate(file.created_at)}`}
              </p>
            </div>
          </div>
          {file.mime_type && (
            <Badge variant="outline" className="text-[10px] ml-2 shrink-0">
              {file.mime_type.split("/").pop()?.toUpperCase() ?? file.mime_type}
            </Badge>
          )}
        </div>
      ))}
    </div>
  );
}

function ProjectDetailPanel({
  project,
}: {
  project: ProjectDetail | null;
}) {
  if (!project) {
    return (
      <div className="flex flex-col items-center justify-center h-full py-20 text-center">
        <FolderOpen className="h-12 w-12 text-muted-foreground/30 mb-4" />
        <p className="text-sm font-medium text-muted-foreground">Select a project</p>
        <p className="text-xs text-muted-foreground/60 mt-1">
          Choose a project from the left panel to view its details
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-5">
      {/* Header */}
      <div>
        <div className="flex items-center gap-3 mb-2">
          <h2 className="text-lg font-semibold">{project.name}</h2>
          <Badge
            variant="outline"
            className={["text-xs", getTypeBadgeClass(project.project_type)].join(" ")}
          >
            {getTypeLabel(project.project_type)}
          </Badge>
        </div>
        <p className="text-xs text-muted-foreground">
          Created {formatDateTime(project.created_at)}
          {project.created_at !== project.updated_at && ` · Updated ${formatDateTime(project.updated_at)}`}
        </p>
      </div>

      <Separator />

      {/* Meta Row */}
      <div className="grid grid-cols-3 gap-3">
        <div className="rounded-lg border border-border/50 bg-[#0d1321] p-3 text-center">
          <div className="text-lg font-semibold tabular-mono">{project.files.length}</div>
          <div className="text-[10px] text-muted-foreground mt-0.5">Files</div>
        </div>
        <div className="rounded-lg border border-border/50 bg-[#0d1321] p-3 text-center">
          <div className="text-lg font-semibold tabular-mono">{project.config_count}</div>
          <div className="text-[10px] text-muted-foreground mt-0.5">Configs</div>
        </div>
        <div className="rounded-lg border border-border/50 bg-[#0d1321] p-3 text-center">
          <div className="text-lg font-semibold tabular-mono">
            {project.project_slug?.length > 12
              ? `${project.project_slug.slice(0, 12)}…`
              : project.project_slug}
          </div>
          <div className="text-[10px] text-muted-foreground mt-0.5">Slug</div>
        </div>
      </div>

      <Separator />

      {/* Files */}
      <div>
        <div className="flex items-center gap-2 mb-3">
          <Files className="h-4 w-4 text-muted-foreground" />
          <h3 className="text-sm font-medium">Files</h3>
          <span className="text-[10px] text-muted-foreground">({project.files.length})</span>
        </div>
        <FileListCard files={project.files} />
      </div>

      <Separator />

      {/* Configs */}
      <div>
        <div className="flex items-center gap-2 mb-3">
          <FileJson className="h-4 w-4 text-muted-foreground" />
          <h3 className="text-sm font-medium">Configurations</h3>
          <span className="text-[10px] text-muted-foreground">({project.config_count})</span>
        </div>
        <div className="flex flex-col items-center justify-center py-8 text-center border border-dashed border-border/50 rounded-lg">
          <FileJson className="h-8 w-8 text-muted-foreground/40 mb-2" />
          <p className="text-xs text-muted-foreground">
            {project.config_count > 0
              ? `${project.config_count} configuration(s) saved in this project`
              : "No configurations yet. Open this project in the respective editor to create one."}
          </p>
        </div>
      </div>
    </div>
  );
}

/* ───────── Main Page ───────── */

export default function ProjectsPage() {
  const [projects, setProjects] = useState<BacktestProject[]>([]);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [selectedProject, setSelectedProject] = useState<ProjectDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Dialogs
  const [showCreate, setShowCreate] = useState(false);
  const [deleteTarget, setDeleteTarget] = useState<{ id: string; name: string } | null>(null);

  /* ─── fetch projects ─── */
  const fetchProjects = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const data = await api.get<{ projects: BacktestProject[] }>("/api/backtest/projects");
      setProjects(data.projects ?? []);
      // If selected project no longer exists, clear it
      if (selectedId && !(data.projects ?? []).some((p) => p.id === selectedId)) {
        setSelectedId(null);
        setSelectedProject(null);
      }
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : "Failed to load projects";
      setError(msg);
    } finally {
      setLoading(false);
    }
  }, [selectedId]);

  /* ─── fetch project detail ─── */
  const fetchProjectDetail = useCallback(async (id: string) => {
    try {
      const data = await api.get<{ project: ProjectDetail }>(`/api/backtest/projects/${id}`);
      setSelectedProject(data.project ?? null);
    } catch {
      setSelectedProject(null);
    }
  }, []);

  // Initial load
  useEffect(() => {
    fetchProjects();
  }, [fetchProjects]);

  // Load detail when selection changes
  useEffect(() => {
    if (selectedId) {
      fetchProjectDetail(selectedId);
    } else {
      setSelectedProject(null);
    }
  }, [selectedId, fetchProjectDetail]);

  /* ─── delete project ─── */
  const handleDelete = useCallback(async () => {
    if (!deleteTarget) return;
    try {
      await api.delete(`/api/backtest/projects/${deleteTarget.id}`);
      // Clear selection if deleted project was selected
      if (selectedId === deleteTarget.id) {
        setSelectedId(null);
        setSelectedProject(null);
      }
      setDeleteTarget(null);
      fetchProjects();
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : "Failed to delete project";
      setError(msg);
    }
  }, [deleteTarget, selectedId, fetchProjects]);

  /* ─── select project ─── */
  const handleSelect = useCallback((id: string) => {
    setSelectedId((prev) => (prev === id ? null : id));
  }, []);

  return (
    <div className="flex" style={{ height: "calc(100vh - 120px)" }}>
      {/* ─── Left Panel: Project List ─── */}
      <div
        className="w-80 shrink-0 border-r border-border flex flex-col"
        style={{ backgroundColor: "#0a0e17" }}
      >
        {/* Header */}
        <div className="px-4 py-3 border-b border-border flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Database className="h-4 w-4 text-muted-foreground" />
            <span className="text-sm font-medium">Projects</span>
            {!loading && (
              <span className="text-[10px] text-muted-foreground">({projects.length})</span>
            )}
          </div>
          <Button size="sm" variant="outline" onClick={() => setShowCreate(true)}>
            <Plus className="h-3.5 w-3.5 mr-1" />
            New
          </Button>
        </div>

        {/* Project List */}
        <ScrollArea className="flex-1">
          <div className="p-3 space-y-2">
            {loading ? (
              <>
                {Array.from({ length: 4 }).map((_, i) => (
                  <div key={i} className="rounded-lg border border-border p-4 space-y-2">
                    <Skeleton className="h-4 w-2/3" />
                    <Skeleton className="h-3 w-1/3" />
                    <Skeleton className="h-3 w-1/4" />
                  </div>
                ))}
              </>
            ) : error ? (
              <div className="flex flex-col items-center justify-center py-12 text-center">
                <AlertCircle className="h-8 w-8 text-red-400/60 mb-3" />
                <p className="text-xs text-muted-foreground mb-3">{error}</p>
                <Button size="sm" variant="outline" onClick={fetchProjects}>
                  Retry
                </Button>
              </div>
            ) : projects.length === 0 ? (
              <div className="flex flex-col items-center justify-center py-12 text-center">
                <FolderKanban className="h-10 w-10 text-muted-foreground/30 mb-3" />
                <p className="text-sm font-medium text-muted-foreground mb-1">No projects yet</p>
                <p className="text-[11px] text-muted-foreground/60 mb-4">
                  Create your first backtest project
                </p>
                <Button size="sm" variant="outline" onClick={() => setShowCreate(true)}>
                  <Plus className="h-3.5 w-3.5 mr-1" />
                  New Project
                </Button>
              </div>
            ) : (
              projects.map((project) => (
                <ProjectCard
                  key={project.id}
                  project={project}
                  selected={selectedId === project.id}
                  onSelect={() => handleSelect(project.id)}
                  onDelete={() => setDeleteTarget({ id: project.id, name: project.name })}
                />
              ))
            )}
          </div>
        </ScrollArea>
      </div>

      {/* ─── Right Panel: Project Detail ─── */}
      <div
        className="flex-1 overflow-y-auto"
        style={{ backgroundColor: "#0a0e17" }}
      >
        <div className="p-6">
          {selectedId && !selectedProject ? (
            <div className="flex items-center justify-center py-20">
              <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
            </div>
          ) : (
            <ProjectDetailPanel project={selectedProject} />
          )}
        </div>
      </div>

      {/* ─── Dialogs ─── */}
      <CreateProjectDialog
        open={showCreate}
        onOpenChange={setShowCreate}
        onCreated={fetchProjects}
      />

      {deleteTarget && (
        <DeleteConfirmDialog
          open={!!deleteTarget}
          onOpenChange={(open) => !open && setDeleteTarget(null)}
          projectName={deleteTarget.name}
          onDeleted={handleDelete}
        />
      )}
    </div>
  );
}

import { useState, useEffect, useCallback } from "react";
import { Button } from "@/components/ui/button";
import {
  Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle,
} from "@/components/ui/dialog";
import { Badge } from "@/components/ui/badge";
import { Loader2, FolderOpen, FilePlus } from "lucide-react";
import { useNotification } from "@/contexts/NotificationContext";
import { optionBacktestService } from "@/services/optionBacktestService";

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onNewProject: () => void;
}

interface ProjectItem {
  id: string;
  name: string;
  project_type: string;
  created_at: string;
  config_count: number;
}

export default function OpenProjectDialog({ open, onOpenChange, onNewProject }: Props) {
  const { error: notifyError } = useNotification();
  const [projects, setProjects] = useState<ProjectItem[]>([]);
  const [loading, setLoading] = useState(false);
  const [selectedId, setSelectedId] = useState("");

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await optionBacktestService.listProjects();
      setProjects(res.projects);
    } catch (e: any) {
      notifyError(e?.detail || "Failed to load projects");
    } finally {
      setLoading(false);
    }
  }, [notifyError]);

  useEffect(() => {
    if (open) {
      setSelectedId("");
      load();
    }
  }, [open, load]);

  const handleOpen = () => {
    if (!selectedId) return;
    const project = projects.find(p => p.id === selectedId);
    if (!project) return;
    const path = project.project_type === "portfolio" ? "/trader/option-backtest" : "/trader/options-station";
    window.location.href = `${path}?project=${project.id}`;
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <FolderOpen className="h-5 w-5" /> Open Project
          </DialogTitle>
          <DialogDescription>
            Select a saved project to open in the backtest station.
          </DialogDescription>
        </DialogHeader>

        <div className="max-h-80 overflow-y-auto space-y-2">
          {loading && (
            <div className="flex items-center justify-center py-8">
              <Loader2 className="w-5 h-5 animate-spin text-muted-foreground" />
            </div>
          )}

          {!loading && projects.length === 0 && (
            <div className="text-center py-8">
              <p className="text-muted-foreground mb-3">No projects yet.</p>
              <Button variant="outline" size="sm" onClick={() => { onOpenChange(false); onNewProject(); }}>
                <FilePlus className="w-4 h-4 mr-1" /> New Project
              </Button>
            </div>
          )}

          {!loading && projects.map(p => (
            <div
              key={p.id}
              onClick={() => setSelectedId(p.id)}
              onDoubleClick={() => {
                setSelectedId(p.id);
                setTimeout(handleOpen, 50);
              }}
              className={`border border-border rounded-lg p-3 cursor-pointer transition-colors ${
                selectedId === p.id
                  ? "border-primary bg-primary/5"
                  : "hover:bg-muted/20"
              }`}
            >
              <div className="flex items-center justify-between">
                <span className="text-sm font-medium text-foreground">{p.name}</span>
                <Badge variant={p.project_type === "portfolio" ? "default" : "secondary"} className="text-[10px] h-5">
                  {p.project_type === "portfolio" ? "Portfolio" : "Options"}
                </Badge>
              </div>
              <p className="text-[10px] text-muted-foreground mt-1">
                {p.created_at ? new Date(p.created_at).toLocaleDateString() : ""}
                {p.config_count > 0 && ` · ${p.config_count} saved configs`}
              </p>
            </div>
          ))}
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>Cancel</Button>
          <Button onClick={handleOpen} disabled={!selectedId}>Open</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

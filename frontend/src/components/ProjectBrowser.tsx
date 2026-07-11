import { useState, useEffect, useCallback } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { useNotification } from "@/contexts/NotificationContext";
import { optionBacktestService } from "@/services/optionBacktestService";
import { Loader2, Trash2, ExternalLink } from "lucide-react";

interface Props {
  onSelect: () => void;
  onCreateNew?: () => void;
}

export default function ProjectBrowser({ onSelect, onCreateNew }: Props) {
  const { success, error: notifyError } = useNotification();
  const [projects, setProjects] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [deleting, setDeleting] = useState<string | null>(null);

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
    load();
  }, [load]);

  const handleDelete = useCallback(async (id: string, e: React.MouseEvent) => {
    e.stopPropagation();
    if (!window.confirm("Delete this project?")) return;
    setDeleting(id);
    try {
      await optionBacktestService.deleteProject(id);
      success("Project deleted");
      setProjects(prev => prev.filter(p => p.id !== id));
    } catch (e: any) {
      notifyError(e?.detail || "Failed to delete project");
    } finally {
      setDeleting(null);
    }
  }, [success, notifyError]);

  if (loading) {
    return (
      <div className="flex items-center justify-center py-16">
        <Loader2 className="w-6 h-6 animate-spin text-muted-foreground" />
      </div>
    );
  }

  if (projects.length === 0) {
    return (
      <Card className="max-w-lg mx-auto">
        <CardHeader>
          <CardTitle>Saved Projects</CardTitle>
        </CardHeader>
        <CardContent className="text-center py-8">
          <p className="text-muted-foreground mb-4">No projects yet. Create your first project to get started.</p>
          <Button onClick={() => onCreateNew?.()}>
            New Project
          </Button>
        </CardContent>
      </Card>
    );
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h2 className="text-lg font-semibold text-foreground">Saved Projects</h2>
        <Button variant="outline" onClick={() => onCreateNew?.()}>
          New Project
        </Button>
      </div>
      <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-4">
        {projects.map(p => (
          <Card key={p.id} className="hover:shadow-lg transition-shadow">
            <CardHeader className="pb-2">
              <CardTitle className="text-base">{p.name}</CardTitle>
            </CardHeader>
            <CardContent>
              {p.description && (
                <p className="text-xs text-muted-foreground mb-3 line-clamp-2">{p.description}</p>
              )}
              <div className="flex items-center justify-between">
                <span className="text-[10px] text-muted-foreground">
                  {p.created_at ? new Date(p.created_at).toLocaleDateString() : ""}
                </span>
                <div className="flex gap-1">
                  <Button
                    variant="ghost"
                    size="icon"
                    className="h-7 w-7"
                    onClick={(e) => handleDelete(p.id, e)}
                    disabled={deleting === p.id}
                  >
                    {deleting === p.id ? (
                      <Loader2 className="w-3 h-3 animate-spin" />
                    ) : (
                      <Trash2 className="w-3 h-3 text-destructive" />
                    )}
                  </Button>
                  <Button
                    variant="outline"
                    size="sm"
                    className="h-7 text-xs gap-1"
                    onClick={() => window.location.href = "/trader/option-backtest"}
                  >
                    <ExternalLink className="w-3 h-3" />
                    Open
                  </Button>
                </div>
              </div>
            </CardContent>
          </Card>
        ))}
      </div>
    </div>
  );
}

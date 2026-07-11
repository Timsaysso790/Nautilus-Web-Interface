import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Plus, Save, Loader2 } from "lucide-react";
import type { BacktestProject, BacktestTemplate } from "../types";

interface Props {
  projects: BacktestProject[];
  templates: BacktestTemplate[];
  selectedProjectId: string;
  selectedTemplateId: string;
  loadingProjects: boolean;
  loadingTemplates: boolean;
  onProjectChange: (id: string) => void;
  onTemplateChange: (id: string) => void;
  onNewProject: () => void;
  onSaveTemplate: () => void;
}

export function ProjectWorkspaceCard({
  projects,
  templates,
  selectedProjectId,
  selectedTemplateId,
  loadingProjects,
  loadingTemplates,
  onProjectChange,
  onTemplateChange,
  onNewProject,
  onSaveTemplate,
}: Props) {
  return (
    <Card>
      <CardHeader className="pb-3">
        <CardTitle className="text-base">Project Workspace</CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="space-y-2">
          <div className="flex items-center justify-between">
            <label className="text-xs text-muted-foreground">Active Project</label>
            <Button variant="ghost" size="sm" className="h-6 text-xs gap-1" onClick={onNewProject}>
              <Plus className="h-3 w-3" /> New
            </Button>
          </div>
          <div className="flex items-center gap-2">
            <Select value={selectedProjectId} onValueChange={onProjectChange}>
              <SelectTrigger className="flex-1 h-8 text-xs">
                <SelectValue placeholder="Select project..." />
              </SelectTrigger>
              <SelectContent>
                {loadingProjects ? (
                  <div className="flex items-center justify-center py-2">
                    <Loader2 className="h-4 w-4 animate-spin" />
                  </div>
                ) : projects.length === 0 ? (
                  <div className="px-2 py-1 text-xs text-muted-foreground">No projects yet</div>
                ) : (
                  projects.map(p => (
                    <SelectItem key={p.id} value={p.id}>{p.name}</SelectItem>
                  ))
                )}
              </SelectContent>
            </Select>
          </div>
        </div>

        <div className="border-t border-border pt-3 space-y-2">
          <div className="flex items-center justify-between">
            <label className="text-xs text-muted-foreground">Template</label>
            <Button variant="ghost" size="sm" className="h-6 text-xs gap-1" onClick={onSaveTemplate}>
              <Save className="h-3 w-3" /> Save
            </Button>
          </div>
          <Select value={selectedTemplateId} onValueChange={onTemplateChange}>
            <SelectTrigger className="w-full h-8 text-xs">
              <SelectValue placeholder="Load template..." />
            </SelectTrigger>
            <SelectContent>
              {loadingTemplates ? (
                <div className="flex items-center justify-center py-2">
                  <Loader2 className="h-4 w-4 animate-spin" />
                </div>
              ) : templates.length === 0 ? (
                <div className="px-2 py-1 text-xs text-muted-foreground">No templates saved</div>
              ) : (
                templates.map(t => (
                  <SelectItem key={t.id} value={t.id}>{t.name}</SelectItem>
                ))
              )}
            </SelectContent>
          </Select>
        </div>
      </CardContent>
    </Card>
  );
}

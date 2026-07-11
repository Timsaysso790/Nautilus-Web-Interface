import { useState, useCallback } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { useNotification } from "@/contexts/NotificationContext";
import { optionBacktestService } from "@/services/optionBacktestService";

interface Props {
  onCreated: () => void;
  onCancel: () => void;
}

export default function NewProjectForm({ onCreated, onCancel }: Props) {
  const { success, error: notifyError } = useNotification();
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [creating, setCreating] = useState(false);

  const handleCreate = useCallback(async () => {
    if (!name.trim()) {
      notifyError("Project name is required");
      return;
    }
    setCreating(true);
    try {
      await optionBacktestService.createProject(name.trim());
      success(`Project "${name.trim()}" created`);
      onCreated();
    } catch (e: any) {
      notifyError(e?.detail || "Failed to create project");
    } finally {
      setCreating(false);
    }
  }, [name, success, notifyError, onCreated]);

  return (
    <Card className="max-w-lg mx-auto">
      <CardHeader>
        <CardTitle>New Backtest Project</CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="space-y-1">
          <label className="text-sm text-muted-foreground">Project Name</label>
          <Input
            value={name}
            onChange={e => setName(e.target.value)}
            placeholder="e.g. QDTE Ladder Strategy"
          />
        </div>
        <div className="space-y-1">
          <label className="text-sm text-muted-foreground">Description (optional)</label>
          <textarea
            value={description}
            onChange={e => setDescription(e.target.value)}
            placeholder="Describe your backtest goals..."
            className="w-full bg-background border rounded px-3 py-2 text-sm text-foreground min-h-[80px] resize-y"
          />
        </div>
        <div className="flex gap-2 justify-end">
          <Button variant="outline" onClick={onCancel} disabled={creating}>
            Cancel
          </Button>
          <Button onClick={handleCreate} disabled={creating}>
            {creating ? "Creating..." : "Create Project"}
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}

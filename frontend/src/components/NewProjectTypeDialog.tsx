import { useState, useEffect } from "react";
import { Button } from "@/components/ui/button";
import {
  Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { FolderPlus, Loader2 } from "lucide-react";

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onConfirm: (name: string, type: "options" | "portfolio") => void;
  creating?: boolean;
}

export default function NewProjectTypeDialog({ open, onOpenChange, onConfirm, creating }: Props) {
  const [name, setName] = useState("");
  const [type, setType] = useState<"options" | "portfolio">("options");

  useEffect(() => {
    if (open) {
      setName("");
      setType("options");
    }
  }, [open]);

  const handleConfirm = () => {
    if (name.trim() && !creating) {
      console.log("[NewProjectDialog] Confirm clicked:", { name: name.trim(), type });
      onConfirm(name.trim(), type);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <FolderPlus className="h-5 w-5" /> New Project
          </DialogTitle>
          <DialogDescription>
            Choose the type of backtest project to create.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4 py-2">
          <div className="space-y-1">
            <Label htmlFor="project-name">Project Name</Label>
            <Input
              id="project-name"
              value={name}
              onChange={e => setName(e.target.value)}
              placeholder="e.g. QDTE Ladder Strategy"
              onKeyDown={e => e.key === "Enter" && handleConfirm()}
              autoFocus
              disabled={creating}
            />
          </div>

          <RadioGroup
            value={type}
            onValueChange={v => setType(v as "options" | "portfolio")}
          >
            <div className="flex items-start space-x-3 space-y-0 border border-border rounded-lg p-3 cursor-pointer hover:bg-muted/20">
              <RadioGroupItem value="options" id="type-options" />
              <div>
                <Label htmlFor="type-options" className="font-medium cursor-pointer">Options Strategy Backtest</Label>
                <p className="text-xs text-muted-foreground mt-0.5">
                  Multi-leg options strategy with condition triggers, exit rules, and project workspace.
                </p>
              </div>
            </div>
            <div className="flex items-start space-x-3 space-y-0 border border-border rounded-lg p-3 cursor-pointer hover:bg-muted/20">
              <RadioGroupItem value="portfolio" id="type-portfolio" />
              <div>
                <Label htmlFor="type-portfolio" className="font-medium cursor-pointer">Stock Portfolio</Label>
                <p className="text-xs text-muted-foreground mt-0.5">
                  Equity portfolio backtest with dividend automation, margin bridge, clearance buying, and VIX hedge.
                </p>
              </div>
            </div>
          </RadioGroup>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={creating}>Cancel</Button>
          <Button onClick={handleConfirm} disabled={!name.trim() || creating}>
            {creating && <Loader2 className="w-4 h-4 animate-spin mr-1" />}
            {creating ? "Creating..." : "Create Project"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

import { Button } from "@/components/ui/button";
import {
  Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle,
} from "@/components/ui/dialog";
import { Loader2, CheckCircle2, XCircle, FileText } from "lucide-react";

type ModalState = "idle" | "submitting" | "success" | "error";

interface Props {
  state: ModalState;
  errorMessage?: string;
  jsonPreview: string;
  onClose: () => void;
  onSubmit: () => void;
}

export function ProcessingModal({ state, errorMessage, jsonPreview, onClose, onSubmit }: Props) {
  const open = state !== "idle";

  return (
    <Dialog open={open} onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>
            {state === "submitting" && "Running Backtest..."}
            {state === "success" && "Backtest Complete"}
            {state === "error" && "Backtest Failed"}
          </DialogTitle>
          <DialogDescription>
            {state === "submitting" && "The simulation engine is processing your strategy."}
            {state === "success" && "Results have been computed successfully."}
            {state === "error" && (errorMessage || "An unexpected error occurred.")}
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          {state === "submitting" && (
            <div className="flex flex-col items-center justify-center py-8 gap-3">
              <Loader2 className="h-10 w-10 animate-spin text-primary" />
              <p className="text-sm text-muted-foreground">Computing indicators, evaluating conditions, iterating trades...</p>
            </div>
          )}

          {state === "success" && (
            <div className="flex flex-col items-center justify-center py-6 gap-3">
              <CheckCircle2 className="h-10 w-10 text-green-500" />
              <p className="text-sm text-muted-foreground">Results are displayed in the panel.</p>
            </div>
          )}

          {state === "error" && (
            <div className="flex flex-col items-center justify-center py-6 gap-3">
              <XCircle className="h-10 w-10 text-destructive" />
              <p className="text-sm text-muted-foreground">{errorMessage || "Check your configuration and try again."}</p>
            </div>
          )}

          <div className="border rounded-md bg-muted/30">
            <div className="flex items-center gap-2 px-3 py-2 border-b border-border">
              <FileText className="h-3.5 w-3.5 text-muted-foreground" />
              <span className="text-xs text-muted-foreground font-medium">Compiled Payload Preview</span>
            </div>
            <pre className="text-xs p-3 overflow-auto max-h-40 font-mono text-muted-foreground">{jsonPreview}</pre>
          </div>
        </div>

        <div className="flex justify-end gap-2">
          {state === "submitting" && (
            <Button variant="outline" disabled>
              Cancel (coming soon)
            </Button>
          )}
          {(state === "success" || state === "error") && (
            <Button variant="outline" onClick={onClose}>
              Close
            </Button>
          )}
          {state === "idle" && (
            <>
              <Button variant="outline" onClick={onClose}>
                Cancel
              </Button>
              <Button onClick={onSubmit}>
                Run Backtest
              </Button>
            </>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}

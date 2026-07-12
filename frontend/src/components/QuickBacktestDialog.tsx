import { useState } from "react";
import { Button } from "@/components/ui/button";
import {
  Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle,
} from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { Play } from "lucide-react";
import { useLocation } from "wouter";

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export default function QuickBacktestDialog({ open, onOpenChange }: Props) {
  const [type, setType] = useState<"options" | "portfolio">("options");
  const [, navigate] = useLocation();

  const handleStart = () => {
    onOpenChange(false);
    navigate(`/trader/backtest/${type}/sandbox`);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-sm">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Play className="h-5 w-5" /> Quick Backtest
          </DialogTitle>
          <DialogDescription>
            Pick a backtest type to start with fresh defaults — no project or save required.
          </DialogDescription>
        </DialogHeader>

        <div className="py-2">
          <RadioGroup
            value={type}
            onValueChange={v => setType(v as "options" | "portfolio")}
          >
            <div className="flex items-start space-x-3 space-y-0 border border-border rounded-lg p-3 cursor-pointer hover:bg-muted/20">
              <RadioGroupItem value="options" id="qb-options" />
              <div>
                <Label htmlFor="qb-options" className="font-medium cursor-pointer">Options Strategy</Label>
                <p className="text-xs text-muted-foreground mt-0.5">
                  Multi-leg options backtesting with condition triggers and exit rules.
                </p>
              </div>
            </div>
            <div className="flex items-start space-x-3 space-y-0 border border-border rounded-lg p-3 cursor-pointer hover:bg-muted/20">
              <RadioGroupItem value="portfolio" id="qb-portfolio" />
              <div>
                <Label htmlFor="qb-portfolio" className="font-medium cursor-pointer">Stock Portfolio</Label>
                <p className="text-xs text-muted-foreground mt-0.5">
                  Equity portfolio backtest with dividends, margin bridge, and VIX hedge.
                </p>
              </div>
            </div>
          </RadioGroup>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>Cancel</Button>
          <Button onClick={handleStart}>Start</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

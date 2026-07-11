import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import { Plus, Trash2 } from "lucide-react";
import type { PortfolioAsset } from "../types";

interface Props {
  assets: PortfolioAsset[];
  onChange: (assets: PortfolioAsset[]) => void;
}

function createAsset(): PortfolioAsset {
  return { ticker: "", allocation: 0, dripEnabled: true };
}

const PRESET_TICKERS = [
  "QDTE", "RDTE", "XDTE", "SPY", "QQQ", "IWM", "DIA", "TLT",
  "SCHD", "JEPI", "DIVO", "VIG", "VYM", "HDV", "SPHD",
  "O", "MAIN", "ARCC", "AGNC", "STAG",
  "AAPL", "MSFT", "GOOGL", "AMZN", "NVDA", "META", "TSLA",
  "BRK.B", "JPM", "V", "PG", "JNJ", "UNH", "HD",
  "KO", "PEP", "COST", "WMT", "DIS", "NFLX", "ADBE",
];

export function PortfolioAssetGrid({ assets, onChange }: Props) {
  const update = (idx: number, field: keyof PortfolioAsset, value: any) => {
    onChange(assets.map((a, i) => (i === idx ? { ...a, [field]: value } : a)));
  };

  const add = () => onChange([...assets, createAsset()]);
  const remove = (idx: number) => onChange(assets.filter((_, i) => i !== idx));

  const totalAlloc = assets.reduce((s, a) => s + a.allocation, 0);

  return (
    <Card>
      <CardHeader className="pb-3">
        <div className="flex items-center justify-between">
          <CardTitle className="text-base">Portfolio Assets</CardTitle>
          <div className="flex items-center gap-2">
            <span className="text-xs text-muted-foreground">{assets.length} tickers</span>
            <Button variant="outline" size="sm" className="h-7 text-xs gap-1" onClick={add}>
              <Plus className="h-3 w-3" /> Add
            </Button>
          </div>
        </div>
      </CardHeader>
      <CardContent className="space-y-2 max-h-96 overflow-y-auto">
        {assets.length === 0 && (
          <p className="text-xs text-muted-foreground text-center py-4">
            No assets configured. Click "Add" to begin building your portfolio.
          </p>
        )}
        {assets.map((asset, idx) => (
          <div key={idx} className="border border-border rounded-md p-2 space-y-2 bg-muted/10">
            <div className="flex items-center justify-between">
              <div className="flex-1 space-y-1">
                <Label className="text-[10px] text-muted-foreground">Ticker</Label>
                <Input
                  value={asset.ticker}
                  onChange={e => update(idx, "ticker", e.target.value.toUpperCase())}
                  className="h-7 text-xs"
                  list={`ticker-suggestions-${idx}`}
                  placeholder="e.g. SPY"
                />
                <datalist id={`ticker-suggestions-${idx}`}>
                  {PRESET_TICKERS.filter(t => !assets.some((a, i) => i !== idx && a.ticker === t)).map(t => (
                    <option key={t} value={t} />
                  ))}
                </datalist>
              </div>
              <div className="w-24 ml-2 space-y-1">
                <Label className="text-[10px] text-muted-foreground">Alloc %</Label>
                <Input
                  type="number"
                  min={0}
                  max={100}
                  value={asset.allocation || ""}
                  onChange={e => update(idx, "allocation", Math.max(0, Math.min(100, Number(e.target.value))))}
                  className="h-7 text-xs"
                />
              </div>
              <div className="flex flex-col items-center ml-2">
                <Label className="text-[10px] text-muted-foreground mb-1">DRIP</Label>
                <Switch
                  checked={asset.dripEnabled}
                  onCheckedChange={v => update(idx, "dripEnabled", v)}
                />
              </div>
              <Button
                variant="ghost"
                size="sm"
                className="h-6 w-6 p-0 ml-1 text-destructive"
                onClick={() => remove(idx)}
              >
                <Trash2 className="h-3.5 w-3.5" />
              </Button>
            </div>
          </div>
        ))}
        {assets.length > 0 && (
          <div className="flex justify-between text-xs text-muted-foreground pt-1 border-t border-border">
            <span>{assets.length} tickers</span>
            <span className={totalAlloc === 100 ? "text-green-500" : totalAlloc > 100 ? "text-destructive" : ""}>
              Total allocation: {totalAlloc.toFixed(0)}%
            </span>
          </div>
        )}
      </CardContent>
    </Card>
  );
}

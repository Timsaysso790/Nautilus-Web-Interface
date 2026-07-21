import { useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Slider } from "@/components/ui/slider";
import { Switch } from "@/components/ui/switch";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  LineChart, PieChart, Plus, Trash2, Loader2,
  ArrowUpRight, ArrowDownRight
} from "lucide-react";
import api from "@/lib/api";

interface Asset {
  ticker: string;
  allocation: number;
  dripEnabled: boolean;
}

export default function PortfolioDesigner() {
  const [assets, setAssets] = useState<Asset[]>([
    { ticker: "SPY", allocation: 45, dripEnabled: true },
    { ticker: "QQQ", allocation: 20, dripEnabled: true },
    { ticker: "TLT", allocation: 15, dripEnabled: true },
    { ticker: "GLD", allocation: 10, dripEnabled: true },
    { ticker: "SCHD", allocation: 10, dripEnabled: true },
  ]);
  const [addTicker, setAddTicker] = useState("");
  const [runResult, setRunResult] = useState<any>(null);
  const [loading, setLoading] = useState(false);
  const [tab, setTab] = useState("builder");

  const addAsset = () => {
    if (!addTicker) return;
    if (assets.some(a => a.ticker === addTicker.toUpperCase())) return;
    setAssets([...assets, { ticker: addTicker.toUpperCase(), allocation: 10, dripEnabled: true }]);
    setAddTicker("");
  };

  const updateAllocation = (index: number, value: number) => {
    const updated = [...assets];
    updated[index] = { ...updated[index], allocation: value };
    setAssets(updated);
  };

  const removeAsset = (index: number) => {
    setAssets(assets.filter((_, i) => i !== index));
  };

  const totalAllocation = assets.reduce((sum, a) => sum + a.allocation, 0);

  const handleRunBacktest = async () => {
    if (assets.length === 0) return;
    setLoading(true);
    setRunResult(null);
    try {
      const data = await api.post("/api/backtest/portfolio/run", {
        assets: assets.map(a => ({
          ticker: a.ticker,
          allocation: a.allocation,
          dripEnabled: a.dripEnabled,
        })),
        start_date: "2020-01-01",
        end_date: "2025-12-31",
        initial_balance: 100000,
        rebalance_frequency: "quarterly",
      });
      setRunResult(data);
    } catch (e: any) {
      setRunResult({ error: e?.detail || "Backtest failed" });
    }
    setLoading(false);
  };

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-lg font-semibold text-gray-100 flex items-center gap-2">
            <PieChart className="h-5 w-5 text-amber-400" />
            Portfolio Designer
          </h1>
          <p className="text-xs text-gray-500 mt-0.5">Design multi-asset portfolios with margin analysis</p>
        </div>
      </div>

      <Tabs value={tab} onValueChange={setTab}>
        <TabsList className="bg-[#0d1321] border border-gray-800/60">
          <TabsTrigger value="builder" className="text-xs">Builder</TabsTrigger>
          <TabsTrigger value="results" className="text-xs">Results</TabsTrigger>
          <TabsTrigger value="margin" className="text-xs">Margin Analysis</TabsTrigger>
        </TabsList>

        {tab === "builder" && (
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-4 mt-4">
            {/* Asset list */}
            <div className="lg:col-span-2 space-y-2">
              <div className="flex items-center gap-2 mb-2">
                <Input
                  value={addTicker}
                  onChange={e => setAddTicker(e.target.value.toUpperCase())}
                  placeholder="Add ticker..."
                  className="bg-[#0a0e17] border-gray-700 text-xs h-8 w-32"
                />
                <Button size="sm" variant="secondary" onClick={addAsset} className="h-8 text-xs">
                  <Plus className="h-3 w-3 mr-1" /> Add
                </Button>
              </div>

              {assets.map((asset, i) => (
                <Card key={asset.ticker} className="bg-[#0d1321] border-gray-800/60">
                  <CardContent className="p-3">
                    <div className="flex items-center justify-between mb-2">
                      <div className="flex items-center gap-2">
                        <span className="text-sm font-medium text-gray-200">{asset.ticker}</span>
                        <Badge className="text-[10px] bg-gray-800 text-gray-400">
                          {asset.allocation}%
                        </Badge>
                      </div>
                      <div className="flex items-center gap-2">
                        <label className="text-[10px] text-gray-500">DRIP</label>
                        <Switch
                          checked={asset.dripEnabled}
                          onCheckedChange={(v) => {
                            const updated = [...assets];
                            updated[i] = { ...updated[i], dripEnabled: v };
                            setAssets(updated);
                          }}
                        />
                        <Button size="sm" variant="ghost" onClick={() => removeAsset(i)} className="h-6 w-6 p-0">
                          <Trash2 className="h-3 w-3 text-red-400" />
                        </Button>
                      </div>
                    </div>
                    <Slider
                      value={[asset.allocation]}
                      onValueChange={([v]) => updateAllocation(i, v)}
                      max={100}
                      step={1}
                      className="py-1"
                    />
                  </CardContent>
                </Card>
              ))}

              {assets.length > 0 && (
                <div className="flex items-center justify-between text-xs text-gray-500 bg-[#0d1321] border border-gray-800/60 rounded-lg p-2">
                  <span>Total allocation: <span className={totalAllocation === 100 ? "text-emerald-400" : "text-red-400"}>{totalAllocation}%</span></span>
                  <Button
                    size="sm"
                    onClick={handleRunBacktest}
                    disabled={loading || totalAllocation !== 100}
                    className="text-xs h-7"
                  >
                    {loading ? <Loader2 className="h-3 w-3 animate-spin mr-1" /> : <LineChart className="h-3 w-3 mr-1" />}
                    {loading ? "Running..." : "Run Backtest"}
                  </Button>
                </div>
              )}
            </div>

            {/* Allocation pie placeholder */}
            <div className="space-y-2">
              <Card className="bg-[#0d1321] border-gray-800/60">
                <CardContent className="p-4">
                  <div className="text-xs text-gray-400 mb-2">Allocation</div>
                  {assets.map((a, i) => (
                    <div key={a.ticker} className="flex items-center justify-between py-1 text-xs">
                      <span className="text-gray-300">{a.ticker}</span>
                      <span className="text-gray-500">{a.allocation}%</span>
                    </div>
                  ))}
                </CardContent>
              </Card>
            </div>
          </div>
        )}

        {tab === "results" && (
          <div className="mt-4">
            {!runResult ? (
              <div className="text-center py-12 text-xs text-gray-500">
                Run a backtest to see results
              </div>
            ) : runResult.error ? (
              <Card className="bg-[#0d1321] border-red-800/40 p-4">
                <div className="text-xs text-red-400">{runResult.error}</div>
              </Card>
            ) : (
              <div className="space-y-3">
                <div className="grid grid-cols-4 gap-3">
                  <Card className="bg-[#0d1321] border-gray-800/60 p-3">
                    <div className="text-[10px] text-gray-500 uppercase">Total Return</div>
                    <div className="text-lg font-bold text-emerald-400">+${(runResult.total_return || 0).toLocaleString()}</div>
                  </Card>
                  <Card className="bg-[#0d1321] border-gray-800/60 p-3">
                    <div className="text-[10px] text-gray-500 uppercase">Sharpe</div>
                    <div className="text-lg font-bold text-gray-100">{(runResult.sharpe || 0).toFixed(2)}</div>
                  </Card>
                  <Card className="bg-[#0d1321] border-gray-800/60 p-3">
                    <div className="text-[10px] text-gray-500 uppercase">Max DD</div>
                    <div className="text-lg font-bold text-red-400">{(runResult.max_drawdown || 0).toFixed(1)}%</div>
                  </Card>
                  <Card className="bg-[#0d1321] border-gray-800/60 p-3">
                    <div className="text-[10px] text-gray-500 uppercase">Win Rate</div>
                    <div className="text-lg font-bold text-gray-100">{(runResult.win_rate || 0).toFixed(1)}%</div>
                  </Card>
                </div>
              </div>
            )}
          </div>
        )}

        {tab === "margin" && (
          <div className="mt-4">
            <Card className="bg-[#0d1321] border-gray-800/60 p-4">
              <div className="text-xs text-gray-500 text-center py-8">
                Margin analysis requires a connected broker. Connect Robinhood or Tastytrade in the Live Trading section.
              </div>
            </Card>
          </div>
        )}
      </Tabs>
    </div>
  );
}

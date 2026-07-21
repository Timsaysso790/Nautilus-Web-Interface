import { useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import ChartView from "@/components/ChartView";
import { BarChart3, Download } from "lucide-react";

interface TradeAnnotation {
  entry_date: string;
  exit_date: string;
  pnl: number;
  entry_price?: number;
  exit_price?: number;
}

export default function ChartPage() {
  const [ticker, setTicker] = useState("SPY");
  const [range, setRange] = useState("1y");
  const [indicatorSet, setIndicatorSet] = useState("bb,sma20,rsi");
  const [showTrades, setShowTrades] = useState(false);
  const [trades] = useState<TradeAnnotation[]>([]);

  const rangeMap: Record<string, { start: string; end: string }> = {
    "1m": { start: "2026-06-20", end: "2026-07-20" },
    "3m": { start: "2026-04-20", end: "2026-07-20" },
    "6m": { start: "2026-01-20", end: "2026-07-20" },
    "1y": { start: "2025-07-20", end: "2026-07-20" },
    "2y": { start: "2024-07-20", end: "2026-07-20" },
    "5y": { start: "2021-07-20", end: "2026-07-20" },
  };

  const r = rangeMap[range] || rangeMap["1y"];

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-lg font-semibold text-gray-100 flex items-center gap-2">
            <BarChart3 className="h-5 w-5 text-amber-400" />
            Chart View
          </h1>
          <p className="text-xs text-gray-500 mt-0.5">Historical price charts with indicators and trade overlays</p>
        </div>
      </div>

      {/* Controls */}
      <Card className="bg-[#0d1321] border-gray-800/60">
        <CardContent className="p-3">
          <div className="flex items-center gap-3 flex-wrap">
            <div className="flex items-center gap-2">
              <label className="text-[11px] text-gray-500">Ticker</label>
              <Input
                value={ticker}
                onChange={e => setTicker(e.target.value.toUpperCase())}
                className="w-20 h-7 text-xs bg-[#0a0e17] border-gray-700"
              />
            </div>
            <div className="flex items-center gap-2">
              <label className="text-[11px] text-gray-500">Range</label>
              <Select value={range} onValueChange={setRange}>
                <SelectTrigger className="w-20 h-7 text-xs bg-[#0a0e17] border-gray-700">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="1m" className="text-xs">1 Month</SelectItem>
                  <SelectItem value="3m" className="text-xs">3 Months</SelectItem>
                  <SelectItem value="6m" className="text-xs">6 Months</SelectItem>
                  <SelectItem value="1y" className="text-xs">1 Year</SelectItem>
                  <SelectItem value="2y" className="text-xs">2 Years</SelectItem>
                  <SelectItem value="5y" className="text-xs">5 Years</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="flex items-center gap-2">
              <label className="text-[11px] text-gray-500">Indicators</label>
              <Select value={indicatorSet} onValueChange={setIndicatorSet}>
                <SelectTrigger className="w-32 h-7 text-xs bg-[#0a0e17] border-gray-700">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="bb,sma20,rsi" className="text-xs">BB + SMA20 + RSI</SelectItem>
                  <SelectItem value="bb,sma20,sma50" className="text-xs">BB + SMA20 + SMA50</SelectItem>
                  <SelectItem value="ema12,ema26,rsi" className="text-xs">EMA12 + EMA26 + RSI</SelectItem>
                  <SelectItem value="" className="text-xs">None (price only)</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Chart */}
      <ChartView
        ticker={ticker}
        height={520}
        indicators={indicatorSet}
        startDate={r.start}
        endDate={r.end}
        trades={showTrades ? trades : []}
      />
    </div>
  );
}

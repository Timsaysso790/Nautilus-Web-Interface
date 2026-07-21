import { useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import {
  Table, TableHeader, TableBody, TableRow, TableHead, TableCell,
} from "@/components/ui/table";
import { Search, Filter, Loader2 } from "lucide-react";
import api from "@/lib/api";

export default function StrategyScreener() {
  const [ticker, setTicker] = useState("SPY");
  const [dteMin, setDteMin] = useState(30);
  const [dteMax, setDteMax] = useState(60);
  const [deltaMin, setDeltaMin] = useState(0.15);
  const [deltaMax, setDeltaMax] = useState(0.25);
  const [creditMin, setCreditMin] = useState(0.20);
  const [strategy, setStrategy] = useState("credit_spread");
  const [results, setResults] = useState<any[]>([]);
  const [loading, setLoading] = useState(false);
  const [ran, setRan] = useState(false);

  const handleSearch = async () => {
    setLoading(true);
    setRan(true);
    try {
      const data = await api.get("/api/options-lab/screener", {
        params: {
          ticker: ticker.toUpperCase(),
          dte_min: dteMin,
          dte_max: dteMax,
          delta_min: deltaMin,
          delta_max: deltaMax,
          credit_min: creditMin,
          strategy,
        },
      });
      setResults(data.results || []);
    } catch {
      setResults([]);
    }
    setLoading(false);
  };

  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-lg font-semibold text-gray-100 flex items-center gap-2">
          <Search className="h-5 w-5 text-amber-400" />
          Strategy Screener
        </h1>
        <p className="text-xs text-gray-500 mt-0.5">Find option strategies matching your criteria</p>
      </div>

      {/* Filters */}
      <Card className="bg-[#0d1321] border-gray-800/60">
        <CardContent className="p-3">
          <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-7 gap-2">
            <div>
              <label className="text-[10px] text-gray-500 block mb-0.5">Ticker</label>
              <Input value={ticker} onChange={e => setTicker(e.target.value.toUpperCase())} className="bg-[#0a0e17] border-gray-700 text-xs h-7" />
            </div>
            <div>
              <label className="text-[10px] text-gray-500 block mb-0.5">Min DTE</label>
              <Input type="number" value={dteMin} onChange={e => setDteMin(parseInt(e.target.value) || 30)} className="bg-[#0a0e17] border-gray-700 text-xs h-7" />
            </div>
            <div>
              <label className="text-[10px] text-gray-500 block mb-0.5">Max DTE</label>
              <Input type="number" value={dteMax} onChange={e => setDteMax(parseInt(e.target.value) || 60)} className="bg-[#0a0e17] border-gray-700 text-xs h-7" />
            </div>
            <div>
              <label className="text-[10px] text-gray-500 block mb-0.5">Min Delta</label>
              <Input type="number" value={deltaMin} onChange={e => setDeltaMin(parseFloat(e.target.value) || 0.1)} step={0.05} className="bg-[#0a0e17] border-gray-700 text-xs h-7" />
            </div>
            <div>
              <label className="text-[10px] text-gray-500 block mb-0.5">Max Delta</label>
              <Input type="number" value={deltaMax} onChange={e => setDeltaMax(parseFloat(e.target.value) || 0.25)} step={0.05} className="bg-[#0a0e17] border-gray-700 text-xs h-7" />
            </div>
            <div>
              <label className="text-[10px] text-gray-500 block mb-0.5">Min Credit</label>
              <Input type="number" value={creditMin} onChange={e => setCreditMin(parseFloat(e.target.value) || 0)} step={0.05} className="bg-[#0a0e17] border-gray-700 text-xs h-7" />
            </div>
            <div>
              <label className="text-[10px] text-gray-500 block mb-0.5">Strategy</label>
              <Select value={strategy} onValueChange={setStrategy}>
                <SelectTrigger className="bg-[#0a0e17] border-gray-700 text-xs h-7">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="credit_spread" className="text-xs">Credit Spread</SelectItem>
                  <SelectItem value="debit_spread" className="text-xs">Debit Spread</SelectItem>
                  <SelectItem value="iron_condor" className="text-xs">Iron Condor</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>
          <Button onClick={handleSearch} disabled={loading} className="w-full mt-2 h-7 text-xs">
            {loading ? <Loader2 className="h-3 w-3 animate-spin mr-1" /> : <Filter className="h-3 w-3 mr-1" />}
            {loading ? "Scanning..." : `Scan ${ticker}`}
          </Button>
        </CardContent>
      </Card>

      {/* Results */}
      {ran && (
        <Card className="bg-[#0d1321] border-gray-800/60">
          <CardHeader className="p-3 pb-0">
            <CardTitle className="text-xs text-gray-400">
              {results.length} results for {ticker} (DTE {dteMin}-{dteMax}, Δ {deltaMin}-{deltaMax})
            </CardTitle>
          </CardHeader>
          <CardContent className="p-0">
            {results.length === 0 ? (
              <div className="text-xs text-gray-500 text-center py-6">No matching results</div>
            ) : (
              <div className="overflow-x-auto">
                <Table>
                  <TableHeader>
                    <TableRow className="border-gray-800/60">
                      <TableHead className="text-[10px] text-gray-500">Exp</TableHead>
                      <TableHead className="text-[10px] text-gray-500">DTE</TableHead>
                      <TableHead className="text-[10px] text-gray-500">Strike</TableHead>
                      <TableHead className="text-[10px] text-gray-500">Credit</TableHead>
                      <TableHead className="text-[10px] text-gray-500">IV</TableHead>
                      <TableHead className="text-[10px] text-gray-500">Δ</TableHead>
                      <TableHead className="text-[10px] text-gray-500">γ</TableHead>
                      <TableHead className="text-[10px] text-gray-500">θ</TableHead>
                      <TableHead className="text-[10px] text-gray-500">ν</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {results.slice(0, 50).map((r, i) => (
                      <TableRow key={i} className="border-gray-800/40 hover:bg-white/5">
                        <TableCell className="text-[11px] text-gray-300">{r.expiration_date || r.expiration}</TableCell>
                        <TableCell className="text-[11px] text-gray-300">{r.dte}</TableCell>
                        <TableCell className="text-[11px] text-gray-300">${r.strike}</TableCell>
                        <TableCell className="text-[11px] text-emerald-400">${r.credit}</TableCell>
                        <TableCell className="text-[11px] text-gray-300">{r.iv.toFixed(3)}</TableCell>
                        <TableCell className={`text-[11px] ${Math.abs(r.delta) > 0.5 ? 'text-amber-400' : 'text-gray-300'}`}>
                          {r.delta.toFixed(3)}
                        </TableCell>
                        <TableCell className="text-[11px] text-gray-300">{r.gamma.toFixed(4)}</TableCell>
                        <TableCell className="text-[11px] text-gray-300">{r.theta.toFixed(4)}</TableCell>
                        <TableCell className="text-[11px] text-gray-300">{r.vega.toFixed(4)}</TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
            )}
          </CardContent>
        </Card>
      )}
    </div>
  );
}

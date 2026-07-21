import { useState, useEffect } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  Database, Search, Download, HardDrive,
  BarChart3, RefreshCw, Plus, ChevronRight, Table, Loader2
} from "lucide-react";
import api from "@/lib/api";

export default function DataCatalog() {
  const [catalog, setCatalog] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [tab, setTab] = useState("browse");
  const [addSymbol, setAddSymbol] = useState("");
  const [addType, setAddType] = useState<"options" | "equities">("equities");
  const [checkResult, setCheckResult] = useState<any>(null);
  const [ingesting, setIngesting] = useState(false);
  const [jobs, setJobs] = useState<any[]>([]);

  useEffect(() => {
    loadCatalog();
    loadJobs();
  }, []);

  const loadCatalog = async () => {
    try {
      const data = await api.get("/api/data-ingestion/catalog");
      setCatalog(data);
    } catch {}
    setLoading(false);
  };

  const loadJobs = async () => {
    try {
      const data = await api.get("/api/data-ingestion/jobs");
      setJobs(data.jobs || []);
    } catch {}
  };

  const handleCheck = async () => {
    if (!addSymbol) return;
    try {
      const data = await api.post("/api/data-ingestion/check", { ticker: addSymbol });
      setCheckResult(data);
    } catch {}
  };

  const handleIngest = async () => {
    if (!addSymbol || !checkResult) return;
    setIngesting(true);
    try {
      await api.post("/api/data-ingestion/ingest", {
        ticker: addSymbol,
        data_type: addType,
        source: addType === "options" ? "thetadata" : "yfinance",
      });
      setAddSymbol("");
      setCheckResult(null);
      setTimeout(() => { loadJobs(); loadCatalog(); }, 2000);
    } catch {}
    setIngesting(false);
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <Loader2 className="h-6 w-6 text-amber-400 animate-spin" />
      </div>
    );
  }

  const optionsTickers = catalog?.options ? Object.entries(catalog.options) : [];
  const equityTickers = catalog?.equities ? Object.entries(catalog.equities) : [];

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-lg font-semibold text-gray-100 flex items-center gap-2">
            <Database className="h-5 w-5 text-amber-400" />
            Data Catalog
          </h1>
          <p className="text-xs text-gray-500 mt-0.5">Browse, ingest, and manage your market data archive</p>
        </div>
        <Button size="sm" variant="ghost" onClick={loadCatalog}>
          <RefreshCw className="h-3.5 w-3.5 mr-1" /> Refresh
        </Button>
      </div>

      <Tabs value={tab} onValueChange={setTab}>
        <TabsList className="bg-[#0d1321] border border-gray-800/60">
          <TabsTrigger value="browse" className="text-xs">Browse Archive</TabsTrigger>
          <TabsTrigger value="add" className="text-xs">Add Data</TabsTrigger>
          <TabsTrigger value="jobs" className="text-xs">Jobs ({jobs.length})</TabsTrigger>
        </TabsList>

        {/* Browse */}
        {tab === "browse" && (
          <div className="space-y-6 mt-4">
            {/* Options Archive */}
            <div>
              <h2 className="text-sm font-medium text-gray-300 mb-2">
                Options Archive <span className="text-gray-500 text-[11px]">({optionsTickers.length} tickers)</span>
              </h2>
              <div className="grid grid-cols-3 sm:grid-cols-4 md:grid-cols-5 lg:grid-cols-6 gap-2">
                {optionsTickers.sort().slice(0, 60).map(([ticker, info]: [string, any]) => (
                  <Card key={ticker} className="bg-[#0d1321] border-gray-800/60 p-2 hover:border-amber-500/30 cursor-pointer">
                    <div className="text-xs font-medium text-gray-200">{ticker}</div>
                    <div className="text-[10px] text-gray-500">{info.files} files · {info.size_mb}MB</div>
                  </Card>
                ))}
                {optionsTickers.length > 60 && (
                  <div className="text-[11px] text-gray-500 flex items-center justify-center">
                    +{optionsTickers.length - 60} more
                  </div>
                )}
              </div>
            </div>

            {/* Equity Archive */}
            {equityTickers.length > 0 && (
              <div>
                <h2 className="text-sm font-medium text-gray-300 mb-2">
                  Equity Archive <span className="text-gray-500 text-[11px]">({equityTickers.length} tickers)</span>
                </h2>
                <div className="grid grid-cols-3 sm:grid-cols-4 md:grid-cols-5 gap-2">
                  {equityTickers.sort().map(([ticker, info]: [string, any]) => (
                    <Card key={ticker} className="bg-[#0d1321] border-gray-800/60 p-2">
                      <div className="text-xs font-medium text-gray-200">{ticker}</div>
                      <div className="text-[10px] text-gray-500">{info.files} files · {info.size_mb}MB</div>
                    </Card>
                  ))}
                </div>
              </div>
            )}

            {/* Summary bar */}
            <div className="flex items-center gap-3 text-[11px] text-gray-500 bg-[#0d1321] border border-gray-800/60 rounded-lg p-3">
              <HardDrive className="h-3.5 w-3.5" />
              <span>{optionsTickers.length} option tickers · {equityTickers.length} equity tickers</span>
              <span className="text-gray-700">|</span>
              <span>Path: {catalog?.options_archive_path}</span>
            </div>
          </div>
        )}

        {/* Add Data */}
        {tab === "add" && (
          <div className="mt-4 max-w-lg">
            <Card className="bg-[#0d1321] border-gray-800/60">
              <CardContent className="p-4 space-y-3">
                <div>
                  <label className="text-xs text-gray-400 mb-1 block">Ticker Symbol</label>
                  <div className="flex gap-2">
                    <Input
                      value={addSymbol}
                      onChange={e => setAddSymbol(e.target.value.toUpperCase())}
                      placeholder="e.g. QDTE"
                      className="bg-[#0a0e17] border-gray-700 text-xs h-8"
                    />
                    <Button size="sm" variant="secondary" onClick={handleCheck} className="h-8 text-xs">
                      <Search className="h-3 w-3 mr-1" /> Check
                    </Button>
                  </div>
                </div>

                <div>
                  <label className="text-xs text-gray-400 mb-1 block">Data Type</label>
                  <div className="flex gap-2">
                    <Button size="sm" variant={addType === "options" ? "default" : "outline"} onClick={() => setAddType("options")} className="text-xs h-8">
                      Options (ThetaData)
                    </Button>
                    <Button size="sm" variant={addType === "equities" ? "default" : "outline"} onClick={() => setAddType("equities")} className="text-xs h-8">
                      Equities (Yahoo)
                    </Button>
                  </div>
                </div>

                {checkResult && (
                  <div className="bg-[#0a0e17] border border-gray-800/60 rounded p-2 text-xs space-y-1">
                    <div className="text-gray-300 font-medium">{checkResult.ticker}</div>
                    <div className="text-gray-500">
                      Options archive: {checkResult.exists_in_options ? "✅ Present" : "❌ Not found"}
                    </div>
                    <div className="text-gray-500">
                      Equity archive: {checkResult.exists_in_equities ? "✅ Present" : "❌ Not found"}
                    </div>
                    {!checkResult.exists_in_options && !checkResult.exists_in_equities && (
                      <Button
                        size="sm"
                        onClick={handleIngest}
                        disabled={ingesting}
                        className="w-full mt-2 text-xs h-8"
                      >
                        {ingesting ? <Loader2 className="h-3 w-3 animate-spin mr-1" /> : <Plus className="h-3 w-3 mr-1" />}
                        {ingesting ? "Fetching..." : `Fetch ${addSymbol} (${addType})`}
                      </Button>
                    )}
                  </div>
                )}
              </CardContent>
            </Card>
          </div>
        )}

        {/* Jobs */}
        {tab === "jobs" && (
          <div className="mt-4">
            {jobs.length === 0 ? (
              <div className="text-center py-8 text-xs text-gray-500">No ingestion jobs yet</div>
            ) : (
              <div className="space-y-2">
                {jobs.slice(0, 20).map((job: any) => (
                  <Card key={job.id} className="bg-[#0d1321] border-gray-800/60 p-3">
                    <div className="flex items-center justify-between">
                      <div className="text-xs">
                        <span className="text-gray-200 font-medium">{job.ticker}</span>
                        <span className="text-gray-500 ml-2">{job.data_type}</span>
                        <Badge className={`ml-2 text-[10px] ${
                          job.status === "completed" ? "bg-emerald-900/30 text-emerald-400" :
                          job.status === "running" ? "bg-amber-900/30 text-amber-400" :
                          job.status === "failed" ? "bg-red-900/30 text-red-400" :
                          "bg-gray-800 text-gray-400"
                        }`}>{job.status}</Badge>
                      </div>
                      <div className="text-[10px] text-gray-500">{job.progress ? `${(job.progress * 100).toFixed(0)}%` : ""}</div>
                    </div>
                    {job.message && <div className="text-[10px] text-gray-600 mt-1">{job.message}</div>}
                  </Card>
                ))}
              </div>
            )}
          </div>
        )}
      </Tabs>
    </div>
  );
}

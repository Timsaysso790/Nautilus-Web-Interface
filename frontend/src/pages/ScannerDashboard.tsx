import { useState, useEffect } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  Search, RefreshCw, Loader2, TrendingDown,
  Activity, CheckCircle, XCircle, AlertTriangle, Zap,
  Table, Filter, BookOpen, Download,
} from "lucide-react";
import api from "@/lib/api";

function highlightMatch(text: string, query: string): React.ReactNode {
  if (!query.trim()) return text;
  const parts = text.split(new RegExp(`(${query.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')})`, "gi"));
  return parts.map((part, i) =>
    part.toLowerCase() === query.toLowerCase()
      ? <span key={i} className="text-amber-400 font-medium">{part}</span>
      : part
  );
}

interface SpreadSetup {
  ticker?: string;
  short_strike?: number;
  long_strike?: number;
  credit?: number;
  width?: number;
  credit_width_ratio?: number;
  delta?: number;
  dte?: number;
  iv_rank?: number;
  rsi?: number;
  quality_score?: number;
  reason?: string;
  [key: string]: any;
}

export default function ScannerDashboard() {
  const [data, setData] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [running, setRunning] = useState(false);
  const [tab, setTab] = useState("setups");

  // Trade Ideas state
  const [transcripts, setTranscripts] = useState<any>(null);
  const [transcriptsLoading, setTranscriptsLoading] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");
  const [searchResults, setSearchResults] = useState<any>(null);
  const [fetchingTranscripts, setFetchingTranscripts] = useState(false);

  const loadResults = async () => {
    setLoading(true);
    try {
      const d = await api.get("/api/scanner/results");
      setData(d);
    } catch {}
    setLoading(false);
  };

  useEffect(() => { loadResults(); }, []);

  const loadTranscripts = async () => {
    setTranscriptsLoading(true);
    try {
      const d = await api.get("/api/scanner-dashboard/transcripts");
      setTranscripts(d);
    } catch {}
    setTranscriptsLoading(false);
  };

  const doSearch = async () => {
    if (!searchQuery.trim()) return;
    try {
      const d = await api.get(`/api/scanner-dashboard/transcripts/search?q=${encodeURIComponent(searchQuery)}`);
      setSearchResults(d);
    } catch {}
  };

  const handleFetchTranscripts = async () => {
    setFetchingTranscripts(true);
    try {
      await api.post("/api/scanner-dashboard/transcripts/fetch");
      await loadTranscripts();
    } catch {}
    setFetchingTranscripts(false);
  };

  useEffect(() => { loadTranscripts(); }, []);

  const handleRun = async () => {
    setRunning(true);
    try {
      await api.post("/api/scanner/run");
      setTimeout(loadResults, 2000);
    } catch {}
    setRunning(false);
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <Loader2 className="h-6 w-6 text-amber-400 animate-spin" />
      </div>
    );
  }

  const tier3 = data?.tier3?.setups || [];
  const phase4 = data?.phase4?.results || [];
  const tier2 = data?.tier2?.signals || [];

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-lg font-semibold text-gray-100 flex items-center gap-2">
            <Search className="h-5 w-5 text-emerald-400" />
            Market Scanner
          </h1>
          <p className="text-xs text-gray-500 mt-0.5">
            {data?.status === "ready"
              ? `Last scan: ${data?.scan_date || "unknown"} · ${tier3.length} setups found`
              : "No scan data available"}
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Button size="sm" variant="ghost" onClick={loadResults} className="text-xs h-7">
            <RefreshCw className="h-3 w-3 mr-1" /> Refresh
          </Button>
          <Button size="sm" onClick={handleRun} disabled={running} className="text-xs h-7">
            {running ? <Loader2 className="h-3 w-3 animate-spin mr-1" /> : <Zap className="h-3 w-3 mr-1" />}
            {running ? "Scanning..." : "Run Scan"}
          </Button>
        </div>
      </div>

      {/* Summary cards */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
        <Card className="bg-[#0d1321] border-gray-800/60 p-2">
          <div className="text-[10px] text-gray-500">Universe</div>
          <div className="text-lg font-bold text-gray-200">{data?.tier1?.count || 0}</div>
        </Card>
        <Card className="bg-[#0d1321] border-gray-800/60 p-2">
          <div className="text-[10px] text-gray-500">Signals</div>
          <div className="text-lg font-bold text-amber-400">{tier2.length}</div>
        </Card>
        <Card className="bg-[#0d1321] border-gray-800/60 p-2">
          <div className="text-[10px] text-gray-500">Spread Setups</div>
          <div className="text-lg font-bold text-emerald-400">{tier3.length}</div>
        </Card>
        <Card className="bg-[#0d1321] border-gray-800/60 p-2">
          <div className="text-[10px] text-gray-500">Priced</div>
          <div className="text-lg font-bold text-blue-400">{phase4.length}</div>
        </Card>
      </div>

      {data?.status !== "ready" ? (
        <Card className="bg-[#0d1321] border-gray-800/60 p-8 text-center">
          <div className="text-xs text-gray-500">{data?.message || "No scanner data available"}</div>
        </Card>
      ) : (
        <Tabs value={tab} onValueChange={setTab}>
          <TabsList className="bg-[#0d1321] border border-gray-800/60">
            <TabsTrigger value="setups" className="text-xs">Spread Setups ({tier3.length})</TabsTrigger>
            <TabsTrigger value="signals" className="text-xs">Signals ({tier2.length})</TabsTrigger>
            <TabsTrigger value="priced" className="text-xs">Priced ({phase4.length})</TabsTrigger>
            <TabsTrigger value="universe" className="text-xs">Universe ({data?.tier1?.count || 0})</TabsTrigger>
            <TabsTrigger value="ideas" className="text-xs">Trade Ideas ({transcripts ? Object.keys(transcripts.transcripts || {}).length : "?"})</TabsTrigger>
          </TabsList>

          {/* Spread Setups — most important */}
          {tab === "setups" && (
            <Card className="bg-[#0d1321] border-gray-800/60 mt-3">
              {tier3.length === 0 ? (
                <div className="text-xs text-gray-500 text-center p-6">No spread setups found in latest scan</div>
              ) : (
                <div className="overflow-x-auto">
                  <table className="w-full text-[11px]">
                    <thead>
                      <tr className="border-b border-gray-800/60 text-gray-500">
                        <th className="text-left p-2 font-medium">Ticker</th>
                        <th className="text-right p-2 font-medium">Short Strike</th>
                        <th className="text-right p-2 font-medium">Long Strike</th>
                        <th className="text-right p-2 font-medium">Width</th>
                        <th className="text-right p-2 font-medium">Credit</th>
                        <th className="text-right p-2 font-medium">C/W Ratio</th>
                        <th className="text-right p-2 font-medium">Delta</th>
                        <th className="text-right p-2 font-medium">DTE</th>
                        <th className="text-right p-2 font-medium">IV</th>
                        <th className="text-right p-2 font-medium">RSI</th>
                        <th className="text-center p-2 font-medium">Score</th>
                      </tr>
                    </thead>
                    <tbody>
                      {tier3.map((s: SpreadSetup, i: number) => {
                        const spread = s.spread_options?.[0] || {};
                        return (
                        <tr key={i} className="border-b border-gray-800/40 hover:bg-white/5">
                          <td className="p-2 text-gray-200 font-medium">{s.ticker || "?"}</td>
                          <td className="p-2 text-right text-gray-300">${s.short_put_strike?.toFixed(1) || "—"}</td>
                          <td className="p-2 text-right text-gray-300">${spread.long_strike?.toFixed(1) || spread.strike?.toFixed(1) || "—"}</td>
                          <td className="p-2 text-right text-gray-300">${(s.short_put_strike - (spread.long_strike || spread.strike || 0))?.toFixed(1) || "—"}</td>
                          <td className="p-2 text-right text-emerald-400">${s.price?.toFixed(2) || "—"}</td>
                          <td className="p-2 text-right text-gray-300">{s.credit_width_ratio ? `${(s.credit_width_ratio * 100).toFixed(0)}%` : "—"}</td>
                          <td className="p-2 text-right text-gray-300">{s.short_put_delta?.toFixed(3) || "—"}</td>
                          <td className="p-2 text-right text-gray-300">{s.dte || "—"}</td>
                          <td className="p-2 text-right text-gray-300">{s.short_put_iv ? `${(s.short_put_iv * 100).toFixed(0)}%` : "—"}</td>
                          <td className="p-2 text-right text-gray-300">{s.rsi?.toFixed(0) || "—"}</td>
                          <td className="p-2 text-center">
                            <Badge className={`text-[10px] ${
                              (s.composite_score || 0) >= 7 ? "bg-emerald-900/30 text-emerald-400" :
                              (s.composite_score || 0) >= 4 ? "bg-amber-900/30 text-amber-400" :
                              "bg-red-900/30 text-red-400"
                            }`}>
                              {s.composite_score?.toFixed(1) || "—"}
                            </Badge>
                          </td>
                        </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              )}
            </Card>
          )}

          {/* Signals */}
          {tab === "signals" && (
            <Card className="bg-[#0d1321] border-gray-800/60 mt-3">
              {tier2.length === 0 ? (
                <div className="text-xs text-gray-500 text-center p-6">No signals in latest scan</div>
              ) : (
                <div className="overflow-x-auto">
                  <table className="w-full text-[11px]">
                    <thead>
                      <tr className="border-b border-gray-800/60 text-gray-500">
                        <th className="text-left p-2 font-medium">Ticker</th>
                        <th className="text-left p-2 font-medium">Type</th>
                        <th className="text-left p-2 font-medium">Reason</th>
                        <th className="text-left p-2 font-medium">News Check</th>
                        <th className="text-right p-2 font-medium">RSI</th>
                        <th className="text-right p-2 font-medium">BB %</th>
                      </tr>
                    </thead>
                    <tbody>
                      {tier2.map((s: any, i: number) => (
                        <tr key={i} className="border-b border-gray-800/40 hover:bg-white/5">
                          <td className="p-2 text-gray-200 font-medium">{s.ticker || s.symbol || "?"}</td>
                          <td className="p-2">
                            <Badge className={`text-[10px] ${
                              s.signal_type === "trigger" || s.type === "trigger"
                                ? "bg-emerald-900/30 text-emerald-400"
                                : "bg-amber-900/30 text-amber-400"
                            }`}>
                              {s.signal_type || s.type || "signal"}
                            </Badge>
                          </td>
                          <td className="p-2 text-gray-300 text-[10px] max-w-[200px] truncate">{s.reason || "—"}</td>
                          <td className="p-2">
                            <Badge className={`text-[10px] ${
                              s.news_result === "pass" ? "bg-emerald-900/30 text-emerald-400" :
                              s.news_result === "fail" ? "bg-red-900/30 text-red-400" :
                              "bg-gray-800 text-gray-400"
                            }`}>
                              {s.news_result || "—"}
                            </Badge>
                          </td>
                          <td className="p-2 text-right text-gray-300">{s.rsi?.toFixed(0) || "—"}</td>
                          <td className="p-2 text-right text-gray-300">
                            {s.bb_position ? `${(s.bb_position * 100).toFixed(0)}%` : "—"}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </Card>
          )}

          {/* Priced */}
          {tab === "priced" && (
            <Card className="bg-[#0d1321] border-gray-800/60 mt-3">
              {phase4.length === 0 ? (
                <div className="text-xs text-gray-500 text-center p-6">No priced spreads available</div>
              ) : (
                <div className="overflow-x-auto">
                  <table className="w-full text-[11px]">
                    <thead>
                      <tr className="border-b border-gray-800/60 text-gray-500">
                        <th className="text-left p-2 font-medium">Ticker</th>
                        <th className="text-right p-2 font-medium">Spread</th>
                        <th className="text-right p-2 font-medium">Bid</th>
                        <th className="text-right p-2 font-medium">Ask</th>
                        <th className="text-right p-2 font-medium">Mid</th>
                        <th className="text-right p-2 font-medium">Delta</th>
                        <th className="text-right p-2 font-medium">IV</th>
                        <th className="text-right p-2 font-medium">DTE</th>
                      </tr>
                    </thead>
                    <tbody>
                      {phase4.map((s: any, i: number) => (
                        <tr key={i} className="border-b border-gray-800/40 hover:bg-white/5">
                          <td className="p-2 text-gray-200 font-medium">{s.ticker || s.symbol || "?"}</td>
                          <td className="p-2 text-right text-gray-300">
                            ${s.short_strike?.toFixed(1) || "?"}/${s.long_strike?.toFixed(1) || "?"}
                          </td>
                          <td className="p-2 text-right text-gray-300">${s.bid?.toFixed(2) || "—"}</td>
                          <td className="p-2 text-right text-gray-300">${s.ask?.toFixed(2) || "—"}</td>
                          <td className="p-2 text-right text-emerald-400">${s.mid?.toFixed(2) || "—"}</td>
                          <td className="p-2 text-right text-gray-300">{s.delta?.toFixed(3) || "—"}</td>
                          <td className="p-2 text-right text-gray-300">{s.iv ? `${(s.iv * 100).toFixed(1)}%` : "—"}</td>
                          <td className="p-2 text-right text-gray-300">{s.dte || "—"}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </Card>
          )}

          {/* Universe */}
          {tab === "universe" && (
            <Card className="bg-[#0d1321] border-gray-800/60 mt-3">
              {!data?.tier1?.tickers?.length ? (
                <div className="text-xs text-gray-500 text-center p-6">{data?.tier1?.count || 0} tickers passed</div>
              ) : (
                <div className="flex flex-wrap gap-1.5 p-3">
                  {data.tier1.tickers.map((t: string, i: number) => (
                    <Badge key={i} className="text-[10px] bg-[#0a0e17] text-gray-400 border border-gray-800/60">
                      {t}
                    </Badge>
                  ))}
                </div>
              )}
            </Card>
          )}

          {/* Trade Ideas — TastyLive Transcripts */}
          {tab === "ideas" && (
            <div className="mt-3 space-y-4">
              <Card className="bg-[#0d1321] border-gray-800/60">
                <CardHeader className="pb-2 flex flex-row items-center justify-between">
                  <CardTitle className="text-sm font-semibold text-gray-100 flex items-center gap-2">
                    <BookOpen className="h-4 w-4 text-amber-400/70" />
                    TastyLive Trade Ideas
                  </CardTitle>
                  <div className="flex items-center gap-2">
                    {!transcripts?.available && (
                      <span className="text-[10px] text-gray-500">Fetcher not configured</span>
                    )}
                    {transcripts?.available && (
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={handleFetchTranscripts}
                        disabled={fetchingTranscripts}
                        className="h-7 text-[10px] border-gray-700 text-gray-400"
                      >
                        {fetchingTranscripts ? <Loader2 className="h-3 w-3 animate-spin mr-1" /> : <Download className="h-3 w-3 mr-1" />}
                        {fetchingTranscripts ? "Fetching..." : "Fetch All"}
                      </Button>
                    )}
                  </div>
                </CardHeader>
                <CardContent>
                  {transcriptsLoading ? (
                    <div className="flex items-center justify-center py-8">
                      <Loader2 className="h-5 w-5 text-amber-400 animate-spin" />
                    </div>
                  ) : (
                    <>
                      {/* Status */}
                      <div className="flex items-center gap-4 mb-4 text-xs text-gray-500">
                        <span>{transcripts?.library?.length || 0} videos in library</span>
                        <span>·</span>
                        <span>{transcripts ? Object.keys(transcripts.transcripts || {}).length : 0} cached</span>
                      </div>

                      {/* Search */}
                      <div className="flex gap-2 mb-4">
                        <Input
                          value={searchQuery}
                          onChange={(e) => setSearchQuery(e.target.value)}
                          onKeyDown={(e) => e.key === "Enter" && doSearch()}
                          placeholder="Search transcripts for a strategy idea..."
                          className="flex-1 h-8 text-xs bg-[#0a0e17] border-gray-700 text-gray-200"
                        />
                        <Button
                          size="sm"
                          onClick={doSearch}
                          disabled={!searchQuery.trim()}
                          className="h-8 text-xs bg-amber-500/20 text-amber-400 border border-amber-500/30 hover:bg-amber-500/30"
                        >
                          <Search className="h-3 w-3 mr-1" />
                          Search
                        </Button>
                      </div>

                      {/* Search results */}
                      {searchResults && (
                        <div className="space-y-2 mb-4">
                          <p className="text-xs text-gray-500">{searchResults.total} result{searchResults.total !== 1 ? "s" : ""}</p>
                          {searchResults.results?.map((r: any, i: number) => (
                            <Card key={i} className="bg-[#0a0e17] border-gray-800/40">
                              <CardContent className="p-3">
                                <div className="flex items-start justify-between mb-2">
                                  <div>
                                    <p className="text-xs font-medium text-gray-200">{r.title}</p>
                                    <p className="text-[10px] text-gray-500">{r.matches} matching segments</p>
                                  </div>
                                  <a
                                    href={`https://www.youtube.com/watch?v=${r.id}`}
                                    target="_blank"
                                    rel="noopener noreferrer"
                                    className="text-[10px] text-blue-400 hover:underline"
                                  >
                                    Watch →
                                  </a>
                                </div>
                                {r.snippets?.map((snippet: string, j: number) => (
                                  <p key={j} className="text-[11px] text-gray-400 leading-relaxed mb-1 last:mb-0">
                                    {highlightMatch(snippet, searchQuery)}
                                  </p>
                                ))}
                              </CardContent>
                            </Card>
                          ))}
                          {searchResults.total === 0 && (
                            <p className="text-xs text-gray-500 text-center py-4">No matches found</p>
                          )}
                        </div>
                      )}

                      {/* Video library */}
                      {transcripts?.library?.length > 0 && (
                        <div>
                          <p className="text-xs text-gray-500 mb-2">Video Library</p>
                          <div className="space-y-1">
                            {transcripts.library.map((v: any, i: number) => (
                              <div key={v.id} className="flex items-center justify-between px-3 py-2 rounded bg-[#0a0e17] border border-gray-800/40">
                                <div className="flex items-center gap-2 min-w-0">
                                  <span className="text-[10px] text-gray-600 w-6">{i + 1}.</span>
                                  <span className="text-xs text-gray-300 truncate">{v.title}</span>
                                </div>
                                <div className="flex items-center gap-2 shrink-0">
                                  <Badge className={`text-[9px] ${
                                    v.status === "ok" ? "bg-emerald-900/30 text-emerald-400" :
                                    v.status === "not_fetched" ? "bg-gray-800 text-gray-500" :
                                    "bg-red-900/30 text-red-400"
                                  }`}>
                                    {v.status === "ok" ? `${v.chars.toLocaleString()} chars` : v.status}
                                  </Badge>
                                  <a
                                    href={`https://www.youtube.com/watch?v=${v.id}`}
                                    target="_blank"
                                    rel="noopener noreferrer"
                                    className="text-[10px] text-blue-400 hover:underline"
                                  >
                                    Watch
                                  </a>
                                </div>
                              </div>
                            ))}
                          </div>
                        </div>
                      )}
                    </>
                  )}
                </CardContent>
              </Card>
            </div>
          )}
        </Tabs>
      )}
    </div>
  );
}

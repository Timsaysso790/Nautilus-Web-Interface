import { useState, useEffect, useCallback } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { StockChart } from "@/components/StockChart";
import { stockService, type Quote, type Bar, type WatchlistItem, type StockInfo, type SearchResult } from "@/services/stockService";
import { useNotification } from "@/contexts/NotificationContext";

export default function StocksPage() {
  const { success, error: notifyError } = useNotification();
  const [query, setQuery] = useState("");
  const [searchResults, setSearchResults] = useState<SearchResult[]>([]);
  const [searching, setSearching] = useState(false);
  const [selected, setSelected] = useState<string>("");
  const [quote, setQuote] = useState<Quote | null>(null);
  const [bars, setBars] = useState<Bar[]>([]);
  const [info, setInfo] = useState<StockInfo | null>(null);
  const [watchlist, setWatchlist] = useState<WatchlistItem[]>([]);
  const [loadingQuote, setLoadingQuote] = useState(false);

  const loadWatchlist = useCallback(async () => {
    try {
      const res = await stockService.getWatchlist();
      setWatchlist(res.watchlist);
    } catch { /* ignore */ }
  }, []);

  useEffect(() => {
    loadWatchlist();
    if (selected) loadStockData(selected);
  }, []);

  const loadStockData = async (symbol: string) => {
    setSelected(symbol);
    setLoadingQuote(true);
    try {
      const [q, h, i] = await Promise.all([
        stockService.getQuote(symbol),
        stockService.getHistory(symbol),
        stockService.getInfo(symbol),
      ]);
      setQuote(q);
      setBars(h.bars);
      setInfo(i);
    } catch {
      notifyError("Failed to load stock data");
    } finally {
      setLoadingQuote(false);
    }
  };

  const handleSearch = async () => {
    if (!query.trim()) return;
    setSearching(true);
    try {
      const res = await stockService.search(query.trim());
      setSearchResults(res.results);
      if (res.results.length > 0) {
        loadStockData(res.results[0].symbol);
      }
    } catch {
      notifyError("Search failed");
    } finally {
      setSearching(false);
    }
  };

  const handleAddWatchlist = async (symbol: string) => {
    try {
      await stockService.addToWatchlist(symbol);
      success("Added to watchlist");
      loadWatchlist();
    } catch {
      notifyError("Failed to add to watchlist");
    }
  };

  const handleRemoveWatchlist = async (symbol: string) => {
    try {
      await stockService.removeFromWatchlist(symbol);
      success("Removed from watchlist");
      loadWatchlist();
    } catch {
      notifyError("Failed to remove from watchlist");
    }
  };

  const formatCurrency = (v: number | null | undefined) => {
    if (v == null) return "—";
    return new Intl.NumberFormat("en-US", { style: "currency", currency: "USD" }).format(v);
  };

  const formatLarge = (v: number | null | undefined) => {
    if (v == null) return "—";
    if (v >= 1e12) return `$${(v / 1e12).toFixed(2)}T`;
    if (v >= 1e9) return `$${(v / 1e9).toFixed(2)}B`;
    if (v >= 1e6) return `$${(v / 1e6).toFixed(2)}M`;
    return formatCurrency(v);
  };

  return (
    <div className="min-h-screen bg-background">
      <header className="bg-card border-b border-border">
        <div className="container mx-auto px-4 py-4">
          <div className="flex items-center justify-between">
            <div>
              <h1 className="text-2xl font-bold text-foreground">Stocks</h1>
              <p className="text-sm text-muted-foreground">Real-time quotes, charts, and watchlist</p>
            </div>
            <Button variant="outline" onClick={() => window.location.href = '/trader'}>
              Back to Trader
            </Button>
          </div>
        </div>
      </header>

      <main className="container mx-auto px-4 py-8">
        <div className="grid grid-cols-1 lg:grid-cols-4 gap-6">
          {/* Left sidebar — Watchlist + Search */}
          <div className="lg:col-span-1 space-y-4">
            {/* Search */}
            <Card>
              <CardHeader className="pb-3">
                <CardTitle className="text-base">Search</CardTitle>
              </CardHeader>
              <CardContent className="space-y-2">
                <div className="flex gap-2">
                  <Input
                    value={query}
                    onChange={e => setQuery(e.target.value)}
                    onKeyDown={e => e.key === "Enter" && handleSearch()}
                    placeholder="Symbol or name..."
                  />
                  <Button size="sm" onClick={handleSearch} disabled={searching}>
                    {searching ? "..." : "Go"}
                  </Button>
                </div>
                {searchResults.length > 0 && (
                  <div className="max-h-48 overflow-y-auto space-y-1">
                    {searchResults.map(r => (
                      <button
                        key={r.symbol}
                        onClick={() => { loadStockData(r.symbol); setSearchResults([]); setQuery(""); }}
                        className={`w-full text-left px-3 py-2 rounded text-sm transition-colors ${
                          selected === r.symbol
                            ? "bg-primary/10 text-primary"
                            : "hover:bg-muted text-foreground"
                        }`}
                      >
                        <span className="font-medium">{r.symbol}</span>
                        <span className="text-muted-foreground ml-2 text-xs">{r.name}</span>
                      </button>
                    ))}
                  </div>
                )}
              </CardContent>
            </Card>

            {/* Watchlist */}
            <Card>
              <CardHeader className="pb-3">
                <CardTitle className="text-base">Watchlist</CardTitle>
              </CardHeader>
              <CardContent>
                {watchlist.length === 0 && (
                  <p className="text-sm text-muted-foreground">Watchlist empty.</p>
                )}
                <div className="space-y-1">
                  {watchlist.map(w => (
                    <div key={w.symbol} className="flex items-center justify-between px-3 py-2 rounded hover:bg-muted">
                      <button
                        onClick={() => loadStockData(w.symbol)}
                        className="text-sm font-medium text-foreground hover:text-primary"
                      >
                        {w.symbol}
                      </button>
                      <button
                        onClick={() => handleRemoveWatchlist(w.symbol)}
                        className="text-xs text-muted-foreground hover:text-destructive"
                        title="Remove"
                      >
                        ✕
                      </button>
                    </div>
                  ))}
                </div>
              </CardContent>
            </Card>
          </div>

          {/* Main content */}
          <div className="lg:col-span-3 space-y-4">
            {!selected && !loadingQuote && (
              <div className="text-center py-16 text-muted-foreground">
                <p className="text-lg">Search for a stock to get started</p>
              </div>
            )}

            {loadingQuote && (
              <div className="space-y-4">
                <div className="h-24 bg-card border rounded-lg animate-pulse" />
                <div className="h-80 bg-card border rounded-lg animate-pulse" />
              </div>
            )}

            {quote && (
              <Card>
                <CardContent className="pt-6">
                  <div className="flex items-start justify-between">
                    <div>
                      <div className="flex items-center gap-3">
                        <h2 className="text-2xl font-bold text-foreground">{quote.symbol}</h2>
                        <span className="text-sm text-muted-foreground">{quote.name}</span>
                        {quote.exchange && (
                          <span className="text-xs px-2 py-0.5 bg-muted rounded text-muted-foreground">{quote.exchange}</span>
                        )}
                      </div>
                      <div className="flex items-baseline gap-3 mt-2">
                        <span className="text-3xl font-bold text-foreground">
                          {quote.price != null ? formatCurrency(quote.price) : "—"}
                        </span>
                        {quote.change != null && (
                          <span className={`text-lg font-medium ${quote.change >= 0 ? 'text-green-500' : 'text-red-500'}`}>
                            {quote.change >= 0 ? "+" : ""}{quote.change.toFixed(2)}
                            <span className="ml-1">({quote.change_pct != null ? `${quote.change_pct >= 0 ? "+" : ""}${quote.change_pct.toFixed(2)}%` : "—"})</span>
                          </span>
                        )}
                      </div>
                    </div>
                    <div className="flex gap-2">
                      {!watchlist.find(w => w.symbol === quote.symbol) ? (
                        <Button size="sm" variant="outline" onClick={() => handleAddWatchlist(quote.symbol)}>
                          + Watchlist
                        </Button>
                      ) : (
                        <Button size="sm" variant="outline" onClick={() => handleRemoveWatchlist(quote.symbol)}>
                          Remove
                        </Button>
                      )}
                    </div>
                  </div>

                  <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mt-6 text-sm">
                    <div>
                      <p className="text-muted-foreground">Open</p>
                      <p className="text-foreground font-medium">{formatCurrency(quote.open)}</p>
                    </div>
                    <div>
                      <p className="text-muted-foreground">Prev Close</p>
                      <p className="text-foreground font-medium">{formatCurrency(quote.prev_close)}</p>
                    </div>
                    <div>
                      <p className="text-muted-foreground">Bid / Ask</p>
                      <p className="text-foreground font-medium">{quote.bid != null ? formatCurrency(quote.bid) : "—"} / {quote.ask != null ? formatCurrency(quote.ask) : "—"}</p>
                    </div>
                    <div>
                      <p className="text-muted-foreground">Volume</p>
                      <p className="text-foreground font-medium">{quote.volume != null ? quote.volume.toLocaleString() : "—"}</p>
                    </div>
                  </div>
                </CardContent>
              </Card>
            )}

            <StockChart symbol={selected} bars={bars} loading={loadingQuote} />

            {info && (
              <Card>
                <CardHeader>
                  <CardTitle className="text-base">Company Info</CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="grid grid-cols-2 md:grid-cols-4 gap-4 text-sm">
                    <div>
                      <p className="text-muted-foreground">Sector</p>
                      <p className="text-foreground font-medium">{info.sector || "—"}</p>
                    </div>
                    <div>
                      <p className="text-muted-foreground">Industry</p>
                      <p className="text-foreground font-medium">{info.industry || "—"}</p>
                    </div>
                    <div>
                      <p className="text-muted-foreground">Market Cap</p>
                      <p className="text-foreground font-medium">{formatLarge(info.market_cap)}</p>
                    </div>
                    <div>
                      <p className="text-muted-foreground">P/E Ratio</p>
                      <p className="text-foreground font-medium">{info.pe_ratio != null ? info.pe_ratio.toFixed(2) : "—"}</p>
                    </div>
                    <div>
                      <p className="text-muted-foreground">Dividend Yield</p>
                      <p className="text-foreground font-medium">{info.dividend_yield != null ? `${(info.dividend_yield * 100).toFixed(2)}%` : "—"}</p>
                    </div>
                    <div>
                      <p className="text-muted-foreground">Beta</p>
                      <p className="text-foreground font-medium">{info.beta != null ? info.beta.toFixed(2) : "—"}</p>
                    </div>
                    <div>
                      <p className="text-muted-foreground">52W High</p>
                      <p className="text-foreground font-medium">{formatCurrency(info["52w_high"])}</p>
                    </div>
                    <div>
                      <p className="text-muted-foreground">52W Low</p>
                      <p className="text-foreground font-medium">{formatCurrency(info["52w_low"])}</p>
                    </div>
                  </div>
                  {info.description && (
                    <p className="mt-4 text-sm text-muted-foreground leading-relaxed">{info.description}</p>
                  )}
                </CardContent>
              </Card>
            )}
          </div>
        </div>
      </main>
    </div>
  );
}

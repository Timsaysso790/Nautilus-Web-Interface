import React, { useState, useEffect, useRef } from 'react';
import { LineChart, Line, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid } from 'recharts';
import api from '../lib/api';
import AppLayout from "@/components/AppLayout";
import { Button } from "@/components/ui/button";
import { chartDefaults } from "@/lib/chart-config";
import { RefreshCw, BarChart3 } from "lucide-react";

interface Instrument {
  symbol: string;
  base: string;
  quote: string;
  exchange: string;
  price: number;
  change_24h: number;
}

interface MarketQuote {
  symbol: string;
  price: number;
  bid: number;
  ask: number;
  volume_24h: number;
  change_24h: number;
  timestamp: string;
}

export default function MarketDataPage() {
  const [instruments, setInstruments] = useState<Instrument[]>([]);
  const [selected, setSelected] = useState<string | null>(null);
  const [quote, setQuote] = useState<MarketQuote | null>(null);
  const [priceHistory, setPriceHistory] = useState<{ time: string; price: number }[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);

  useEffect(() => {
    fetchInstruments();
    return () => { if (intervalRef.current) clearInterval(intervalRef.current); };
  }, []);

  useEffect(() => {
    if (selected) {
      setPriceHistory([]);
      fetchQuote(selected);
      if (intervalRef.current) clearInterval(intervalRef.current);
      intervalRef.current = setInterval(() => fetchQuote(selected), 3000);
    }
  }, [selected]);

  const fetchInstruments = async () => {
    try {
      const data = await api.get<{ instruments: Instrument[] }>('/api/market-data/instruments');
      setInstruments(data.instruments || []);
      if (data.instruments?.length > 0) setSelected(data.instruments[0].symbol);
    } catch (err) {
      console.error('Failed to fetch instruments:', err);
    } finally {
      setLoading(false);
    }
  };

  const fetchQuote = async (symbol: string) => {
    try {
      const data = await api.get<MarketQuote>(`/api/market-data/${symbol}`);
      setQuote(data);
      const time = new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' });
      setPriceHistory(prev => {
        const next = [...prev, { time, price: data.price }];
        return next.length > 60 ? next.slice(-60) : next;
      });
    } catch (err) {
      console.error('Failed to fetch quote:', err);
    }
  };

  const handleRefresh = async () => {
    setRefreshing(true);
    await fetchInstruments();
    if (selected) await fetchQuote(selected);
    setRefreshing(false);
  };

  if (loading) {
    return (
      <AppLayout title="Market Data" subtitle="Real-time market feeds and quotes">
        <div className="text-center text-muted-foreground py-12">Loading market data...</div>
      </AppLayout>
    );
  }

  return (
    <AppLayout
      title="Market Data"
      subtitle="Real-time market feeds and quotes"
      actions={
        <>
          <Button onClick={handleRefresh} disabled={refreshing} variant="outline" size="sm">
            <RefreshCw className={`h-3.5 w-3.5 mr-1 ${refreshing ? 'animate-spin' : ''}`} />
            {refreshing ? 'Refreshing...' : 'Refresh'}
          </Button>
        </>
      }
    >
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <div className="lg:col-span-1">
          <div className="border border-border rounded-lg overflow-hidden">
            <div className="px-4 py-3 border-b border-border">
              <h2 className="text-sm font-semibold text-foreground">Instruments</h2>
            </div>
            <div className="divide-y divide-border">
              {instruments.map(inst => (
                <button
                  key={inst.symbol}
                  onClick={() => setSelected(inst.symbol)}
                  className={`w-full px-4 py-3 text-left transition-colors flex items-center justify-between ${
                    selected === inst.symbol 
                      ? 'bg-muted border-l-2 border-primary' 
                      : 'hover:bg-muted/50'
                  }`}
                >
                  <div>
                    <div className="font-medium text-sm text-foreground">{inst.symbol}</div>
                    <div className="text-xs text-muted-foreground">{inst.exchange}</div>
                  </div>
                  <div className="text-right">
                    <div className="tabular-mono text-sm text-foreground">
                      ${inst.price.toLocaleString()}
                    </div>
                    <div className={`tabular-mono text-xs font-semibold ${
                      inst.change_24h >= 0 ? 'text-profit' : 'text-loss'
                    }`}>
                      {inst.change_24h >= 0 ? '+' : ''}{inst.change_24h.toFixed(2)}%
                    </div>
                  </div>
                </button>
              ))}
            </div>
          </div>
        </div>

        <div className="lg:col-span-2">
          {quote ? (
            <div className="space-y-4">
              <div className="border border-border rounded-lg p-5">
                <div className="flex items-start justify-between mb-4">
                  <div>
                    <h2 className="text-lg font-semibold text-foreground">{quote.symbol}</h2>
                    <div className="text-xs text-muted-foreground">
                      Last updated: {new Date(quote.timestamp).toLocaleTimeString()}
                    </div>
                  </div>
                  <span className={`tabular-mono text-sm font-semibold px-2.5 py-1 rounded-md ${
                    quote.change_24h >= 0 
                      ? 'bg-profit-bg text-profit' 
                      : 'bg-loss-bg text-loss'
                  }`}>
                    {quote.change_24h >= 0 ? '+' : ''}{quote.change_24h.toFixed(2)}% 24h
                  </span>
                </div>

                <div className="text-3xl tabular-mono font-bold text-foreground mb-5">
                  ${quote.price.toLocaleString(undefined, { minimumFractionDigits: 2 })}
                </div>

                <div className="grid grid-cols-2 gap-3">
                  <div className="bg-profit-bg rounded-lg p-4">
                    <div className="text-xs text-muted-foreground mb-1">Bid</div>
                    <div className="tabular-mono text-lg font-bold text-profit">
                      ${quote.bid.toLocaleString(undefined, { minimumFractionDigits: 2 })}
                    </div>
                  </div>
                  <div className="bg-loss-bg rounded-lg p-4">
                    <div className="text-xs text-muted-foreground mb-1">Ask</div>
                    <div className="tabular-mono text-lg font-bold text-loss">
                      ${quote.ask.toLocaleString(undefined, { minimumFractionDigits: 2 })}
                    </div>
                  </div>
                </div>
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div className="border border-border rounded-lg p-4">
                  <div className="text-xs text-muted-foreground mb-2">Spread</div>
                  <div className="tabular-mono text-lg font-bold text-foreground">
                    ${(quote.ask - quote.bid).toFixed(4)}
                  </div>
                  <div className="tabular-mono text-xs text-muted-foreground">
                    {(((quote.ask - quote.bid) / quote.price) * 100).toFixed(4)}%
                  </div>
                </div>
                <div className="border border-border rounded-lg p-4">
                  <div className="text-xs text-muted-foreground mb-2">Volume 24h</div>
                  <div className="tabular-mono text-lg font-bold text-foreground">
                    ${(quote.volume_24h / 1_000_000).toFixed(2)}M
                  </div>
                  <div className="text-xs text-muted-foreground">USD equivalent</div>
                </div>
              </div>

              {priceHistory.length > 1 && (
                <div className="border border-border rounded-lg p-4">
                  <div className="text-sm font-semibold text-foreground mb-3">Price History (live)</div>
                  <ResponsiveContainer width="100%" height={160}>
                    <LineChart data={priceHistory} margin={{ top: 4, right: 8, bottom: 4, left: 8 }}>
                      <CartesianGrid {...chartDefaults.grid} />
                      <XAxis
                        dataKey="time"
                        tick={chartDefaults.axis.tick}
                        interval="preserveStartEnd"
                        tickLine={false}
                      />
                      <YAxis
                        domain={['auto', 'auto']}
                        tick={chartDefaults.axis.tick}
                        tickLine={false}
                        axisLine={false}
                        width={70}
                        tickFormatter={(v: number) => v.toLocaleString(undefined, { maximumFractionDigits: 2 })}
                      />
                      <Tooltip
                        {...chartDefaults.tooltip}
                        formatter={(v: number) => [`$${v.toLocaleString(undefined, { minimumFractionDigits: 2 })}`, 'Price']}
                        labelStyle={{ fontSize: 11 }}
                      />
                      <Line
                        type="monotone"
                        dataKey="price"
                        stroke={quote.change_24h >= 0 ? chartDefaults.profitStroke : chartDefaults.lossStroke}
                        strokeWidth={2}
                        dot={false}
                        isAnimationActive={false}
                      />
                    </LineChart>
                  </ResponsiveContainer>
                </div>
              )}

              <div className="bg-muted border border-border rounded-lg px-4 py-3">
                <div className="flex items-center gap-3">
                  <div className="w-2 h-2 bg-profit rounded-full animate-pulse"></div>
                  <div>
                    <div className="text-sm font-medium text-foreground">Live Data Feed</div>
                    <div className="text-xs text-muted-foreground">
                      Subscribed to {quote.symbol} — updates every 3 seconds
                    </div>
                  </div>
                </div>
              </div>
            </div>
          ) : (
            <div className="border border-border rounded-lg p-12 text-center">
              <BarChart3 className="h-12 w-12 text-muted-foreground mx-auto mb-4" />
              <div className="text-muted-foreground">Select an instrument to view market data</div>
            </div>
          )}
        </div>
      </div>
    </AppLayout>
  );
}

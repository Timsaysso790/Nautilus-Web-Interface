import React, { useState, useEffect } from 'react';
import {
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  ReferenceLine,
} from 'recharts';
import api from '../lib/api';
import AppLayout from "@/components/AppLayout";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Table,
  TableHeader,
  TableBody,
  TableRow,
  TableHead,
  TableCell,
} from "@/components/ui/table";
import {
  Accordion,
  AccordionItem,
  AccordionTrigger,
  AccordionContent,
} from "@/components/ui/accordion";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Badge } from "@/components/ui/badge";
import { chartDefaults } from "@/lib/chart-config";
import { Play, Loader2, FlaskConical } from "lucide-react";

interface Strategy {
  id: string;
  name: string;
  type: string;
  status: string;
}

interface EquityPoint {
  time: string;
  equity: number;
}

interface BacktestResult {
  strategy_id: string;
  strategy_name?: string;
  start_date: string;
  end_date: string;
  starting_balance: number;
  ending_balance: number;
  total_pnl: number;
  total_trades: number;
  winning_trades?: number;
  losing_trades?: number;
  win_rate: number;
  max_drawdown?: number;
  sharpe_ratio?: number;
  total_orders?: number;
  completed_at: string;
  equity_curve?: EquityPoint[];
  positions?: any[];
  fast_period?: number;
  slow_period?: number;
}

interface SweepResult {
  fast_period: number;
  slow_period: number;
  total_pnl: number;
  win_rate: number;
  total_trades: number;
  ending_balance: number;
  max_drawdown: number;
  sharpe_ratio: number | null;
}

interface SweepResponse {
  success: boolean;
  combinations_tested: number;
  combinations_requested: number;
  starting_balance: number;
  num_bars: number;
  results: SweepResult[];
  best: SweepResult | null;
}

type Mode = 'demo' | 'real' | 'sweep';

function formatEquityLabel(value: number) {
  if (value >= 1_000_000) return `$${(value / 1_000_000).toFixed(1)}M`;
  if (value >= 1_000) return `$${(value / 1_000).toFixed(0)}K`;
  return `$${value}`;
}

function formatTime(iso: string) {
  try {
    const d = new Date(iso);
    return d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
  } catch {
    return iso;
  }
}

function MetricCard({ label, value, sub, color }: { label: string; value: string; sub?: string; color?: string }) {
  return (
    <div className="border border-border rounded-lg p-4">
      <div className="text-xs text-muted-foreground mb-1">{label}</div>
      <div className={`tabular-mono text-xl font-bold ${color ?? 'text-foreground'}`}>{value}</div>
      {sub && <div className="text-xs text-muted-foreground mt-0.5">{sub}</div>}
    </div>
  );
}

export default function BacktestingPage() {
  const [mode, setMode] = useState<Mode>('demo');

  const [fastPeriod, setFastPeriod] = useState(10);
  const [slowPeriod, setSlowPeriod] = useState(20);
  const [numBars, setNumBars] = useState(500);
  const [demoBalance, setDemoBalance] = useState(100000);

  const [strategies, setStrategies] = useState<Strategy[]>([]);
  const [selectedStrategy, setSelectedStrategy] = useState('');
  const [startDate, setStartDate] = useState('2024-01-01');
  const [endDate, setEndDate] = useState('2024-12-31');
  const [realBalance, setRealBalance] = useState(100000);

  const [sweepFastMin, setSweepFastMin] = useState(5);
  const [sweepFastMax, setSweepFastMax] = useState(25);
  const [sweepFastStep, setSweepFastStep] = useState(5);
  const [sweepSlowMin, setSweepSlowMin] = useState(15);
  const [sweepSlowMax, setSweepSlowMax] = useState(60);
  const [sweepSlowStep, setSweepSlowStep] = useState(10);
  const [sweepBalance, setSweepBalance] = useState(100000);
  const [sweepBars, setSweepBars] = useState(500);
  const [sweepResult, setSweepResult] = useState<SweepResponse | null>(null);

  const [result, setResult] = useState<BacktestResult | null>(null);
  const [running, setRunning] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    api.get<{ strategies: Strategy[] }>('/api/strategies')
      .then(data => {
        const strats: Strategy[] = data.strategies ?? [];
        setStrategies(strats);
        if (strats.length > 0) setSelectedStrategy(strats[0].id);
      })
      .catch(err => {
        setError(err instanceof Error ? err.message : 'Failed to load strategies');
      });
  }, []);

  const runBacktest = async () => {
    setRunning(true);
    setError(null);
    setResult(null);
    setSweepResult(null);

    try {
      if (mode === 'demo') {
        if (fastPeriod >= slowPeriod) {
          setError('Fast period must be less than slow period.');
          setRunning(false);
          return;
        }
        const data = await api.post<{ result: BacktestResult }>('/api/nautilus/demo-backtest', {
          fast_period: fastPeriod,
          slow_period: slowPeriod,
          starting_balance: demoBalance,
          num_bars: numBars,
        });
        setResult(data.result);
      } else if (mode === 'sweep') {
        const data = await api.post<SweepResponse>('/api/nautilus/parameter-sweep', {
          fast_period_min: sweepFastMin,
          fast_period_max: sweepFastMax,
          fast_period_step: sweepFastStep,
          slow_period_min: sweepSlowMin,
          slow_period_max: sweepSlowMax,
          slow_period_step: sweepSlowStep,
          starting_balance: sweepBalance,
          num_bars: sweepBars,
        });
        setSweepResult(data);
      } else {
        if (!selectedStrategy) {
          setError('Please select a strategy first.');
          setRunning(false);
          return;
        }
        const data = await api.post<{ result: BacktestResult }>('/api/nautilus/backtest', {
          strategy_id: selectedStrategy,
          start_date: startDate,
          end_date: endDate,
          starting_balance: realBalance,
        });
        setResult(data.result);
      }
    } catch (err: any) {
      setError(err.message ?? 'Backtest failed. Please try again.');
    } finally {
      setRunning(false);
    }
  };

  const equityCurve = result?.equity_curve ?? [];
  const startingBalance = result?.starting_balance ?? 0;

  return (
    <AppLayout
      title="Backtesting"
      subtitle="Run strategy simulations on historical or synthetic data"
    >
      <div className="grid grid-cols-1 lg:grid-cols-5 gap-6">

        <div className="lg:col-span-2 border border-border rounded-lg p-5 self-start">
          <Tabs value={mode} onValueChange={(v) => { setMode(v as Mode); setError(null); }}>
            <TabsList className="w-full mb-4">
              <TabsTrigger value="demo" className="flex-1">Demo</TabsTrigger>
              <TabsTrigger value="real" className="flex-1">Real Data</TabsTrigger>
              <TabsTrigger value="sweep" className="flex-1">Sweep</TabsTrigger>
            </TabsList>
          </Tabs>

          {mode === 'demo' && (
            <div className="space-y-4">
              <p className="text-xs text-muted-foreground bg-muted rounded-lg px-3 py-2">
                Demo mode generates synthetic EUR/USD price data and runs a real SMA Crossover strategy through the NautilusTrader BacktestEngine.
              </p>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-medium text-muted-foreground mb-1">Fast SMA Period</label>
                  <Input type="number" min={2} max={50} value={fastPeriod}
                    onChange={e => setFastPeriod(Number(e.target.value))} />
                </div>
                <div>
                  <label className="block text-xs font-medium text-muted-foreground mb-1">Slow SMA Period</label>
                  <Input type="number" min={3} max={200} value={slowPeriod}
                    onChange={e => setSlowPeriod(Number(e.target.value))} />
                </div>
              </div>
              <div>
                <label className="block text-xs font-medium text-muted-foreground mb-1">Number of 1-min Bars</label>
                <Select value={String(numBars)} onValueChange={v => setNumBars(Number(v))}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="200">200 bars (~3 hours)</SelectItem>
                    <SelectItem value="500">500 bars (~8 hours)</SelectItem>
                    <SelectItem value="1000">1 000 bars (~17 hours)</SelectItem>
                    <SelectItem value="2000">2 000 bars (~33 hours)</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div>
                <label className="block text-xs font-medium text-muted-foreground mb-1">Starting Balance ($)</label>
                <Input type="number" min={1000} step={1000} value={demoBalance}
                  onChange={e => setDemoBalance(Number(e.target.value))} />
              </div>
            </div>
          )}

          {mode === 'real' && (
            <div className="space-y-4">
              <div>
                <label className="block text-xs font-medium text-muted-foreground mb-1">Strategy</label>
                {strategies.length === 0 ? (
                  <div className="text-sm text-muted-foreground bg-muted rounded-lg px-3 py-2">
                    No strategies yet.{' '}
                    <a href="/trader/strategies" className="text-primary hover:underline">Create one</a>
                  </div>
                ) : (
                  <Select value={selectedStrategy} onValueChange={setSelectedStrategy}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>
                      {strategies.map(s => (
                        <SelectItem key={s.id} value={s.id}>{s.name} ({s.type})</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                )}
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-medium text-muted-foreground mb-1">Start Date</label>
                  <Input type="date" value={startDate}
                    onChange={e => setStartDate(e.target.value)} />
                </div>
                <div>
                  <label className="block text-xs font-medium text-muted-foreground mb-1">End Date</label>
                  <Input type="date" value={endDate}
                    onChange={e => setEndDate(e.target.value)} />
                </div>
              </div>
              <div>
                <label className="block text-xs font-medium text-muted-foreground mb-1">Starting Balance ($)</label>
                <Input type="number" min={1000} step={1000} value={realBalance}
                  onChange={e => setRealBalance(Number(e.target.value))} />
              </div>
            </div>
          )}

          {mode === 'sweep' && (
            <div className="space-y-4">
              <p className="text-xs text-muted-foreground bg-muted border border-border rounded-lg px-3 py-2">
                Grid search: tests all (fast, slow) SMA combinations. Ranked by P&L. Max 25 combinations.
              </p>
              <div className="grid grid-cols-3 gap-2">
                <div><label className="block text-xs font-medium text-muted-foreground mb-1">Fast Min</label>
                  <Input type="number" min={2} max={100} value={sweepFastMin}
                    onChange={e => setSweepFastMin(Number(e.target.value))} /></div>
                <div><label className="block text-xs font-medium text-muted-foreground mb-1">Fast Max</label>
                  <Input type="number" min={2} max={100} value={sweepFastMax}
                    onChange={e => setSweepFastMax(Number(e.target.value))} /></div>
                <div><label className="block text-xs font-medium text-muted-foreground mb-1">Fast Step</label>
                  <Input type="number" min={1} max={50} value={sweepFastStep}
                    onChange={e => setSweepFastStep(Number(e.target.value))} /></div>
              </div>
              <div className="grid grid-cols-3 gap-2">
                <div><label className="block text-xs font-medium text-muted-foreground mb-1">Slow Min</label>
                  <Input type="number" min={3} max={500} value={sweepSlowMin}
                    onChange={e => setSweepSlowMin(Number(e.target.value))} /></div>
                <div><label className="block text-xs font-medium text-muted-foreground mb-1">Slow Max</label>
                  <Input type="number" min={3} max={500} value={sweepSlowMax}
                    onChange={e => setSweepSlowMax(Number(e.target.value))} /></div>
                <div><label className="block text-xs font-medium text-muted-foreground mb-1">Slow Step</label>
                  <Input type="number" min={1} max={100} value={sweepSlowStep}
                    onChange={e => setSweepSlowStep(Number(e.target.value))} /></div>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div><label className="block text-xs font-medium text-muted-foreground mb-1">Starting Balance</label>
                  <Input type="number" min={1000} step={1000} value={sweepBalance}
                    onChange={e => setSweepBalance(Number(e.target.value))} /></div>
                <div><label className="block text-xs font-medium text-muted-foreground mb-1">Num Bars</label>
                  <Select value={String(sweepBars)} onValueChange={v => setSweepBars(Number(v))}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="200">200 bars</SelectItem>
                      <SelectItem value="500">500 bars</SelectItem>
                      <SelectItem value="1000">1 000 bars</SelectItem>
                    </SelectContent>
                  </Select></div>
              </div>
            </div>
          )}

          {error && (
            <div className="mt-4 bg-loss-bg border border-loss/30 text-loss rounded-lg px-3 py-2 text-sm">
              {error}
            </div>
          )}

          <Button
            onClick={runBacktest}
            disabled={running}
            className="mt-5 w-full"
          >
            {running ? (
              <><Loader2 className="h-4 w-4 mr-2 animate-spin" /> Running...</>
            ) : (
              <><Play className="h-4 w-4 mr-2" /> Run Backtest</>
            )}
          </Button>
        </div>

        <div className="lg:col-span-3 space-y-4">
          {running && (
            <div className="border border-border rounded-lg p-10 text-center">
              <Loader2 className="h-8 w-8 text-primary animate-spin mx-auto mb-3" />
              <div className="text-sm font-medium text-foreground">
                {mode === 'sweep' ? 'Running parameter sweep...' : 'Running NautilusTrader backtest...'}
              </div>
              <div className="text-xs text-muted-foreground mt-1">
                {mode === 'sweep' ? 'Testing SMA combinations' : 'Executing strategy against historical data'}
              </div>
            </div>
          )}

          {!running && !result && !sweepResult && (
            <div className="border border-border rounded-lg p-12 text-center">
              <FlaskConical className="h-12 w-12 text-muted-foreground mx-auto mb-4" />
              <div className="text-base font-semibold text-foreground mb-1">No Results Yet</div>
              <div className="text-sm text-muted-foreground">Configure parameters and click Run Backtest</div>
            </div>
          )}

          {sweepResult && !running && mode === 'sweep' && (
            <div className="space-y-4">
              <div className="border border-border rounded-lg p-5">
                <div className="flex items-center justify-between mb-3">
                  <h3 className="text-sm font-semibold text-foreground">Parameter Sweep Results</h3>
                  <Badge variant="secondary" className="tabular-mono">{sweepResult.combinations_tested} tested</Badge>
                </div>
                {sweepResult.best && (
                  <div className={`rounded-lg p-4 mb-3 ${
                    sweepResult.best.total_pnl >= 0 ? 'bg-profit-bg border border-profit/30' : 'bg-loss-bg border border-loss/30'
                  }`}>
                    <div className="text-xs text-muted-foreground mb-1">Best Configuration</div>
                    <div className={`tabular-mono text-xl font-bold ${
                      sweepResult.best.total_pnl >= 0 ? 'text-profit' : 'text-loss'
                    }`}>
                      {sweepResult.best.total_pnl >= 0 ? '+' : ''}${sweepResult.best.total_pnl.toLocaleString(undefined, { minimumFractionDigits: 2 })}
                    </div>
                    <div className="text-xs text-muted-foreground mt-1">
                      SMA({sweepResult.best.fast_period}, {sweepResult.best.slow_period}) &nbsp;·&nbsp;
                      Win rate: {sweepResult.best.win_rate.toFixed(1)}% &nbsp;·&nbsp;
                      {sweepResult.best.total_trades} trades
                    </div>
                  </div>
                )}
              </div>

              <div className="border border-border rounded-lg overflow-hidden">
                <div className="px-4 py-3 border-b border-border">
                  <h3 className="text-sm font-semibold text-foreground">All Combinations (ranked by P&L)</h3>
                </div>
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead className="w-12">Rank</TableHead>
                      <TableHead>Fast</TableHead>
                      <TableHead>Slow</TableHead>
                      <TableHead className="text-right">Total P&L</TableHead>
                      <TableHead className="text-right">Win Rate</TableHead>
                      <TableHead className="text-right">Trades</TableHead>
                      <TableHead className="text-right">Max DD</TableHead>
                      <TableHead className="text-right">Sharpe</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {sweepResult.results.map((r, i) => (
                      <TableRow key={i} className={i === 0 ? 'bg-muted/50' : ''}>
                        <TableCell className="tabular-mono text-muted-foreground font-medium">#{i + 1}</TableCell>
                        <TableCell className="tabular-mono">{r.fast_period}</TableCell>
                        <TableCell className="tabular-mono">{r.slow_period}</TableCell>
                        <TableCell className={`tabular-mono text-right font-medium ${
                          r.total_pnl >= 0 ? 'text-profit' : 'text-loss'
                        }`}>
                          {r.total_pnl >= 0 ? '+' : ''}${r.total_pnl.toLocaleString(undefined, { minimumFractionDigits: 2 })}
                        </TableCell>
                        <TableCell className={`tabular-mono text-right ${
                          r.win_rate >= 50 ? 'text-profit' : 'text-muted-foreground'
                        }`}>
                          {r.win_rate.toFixed(1)}%
                        </TableCell>
                        <TableCell className="tabular-mono text-right">{r.total_trades}</TableCell>
                        <TableCell className="tabular-mono text-right text-alert">{r.max_drawdown.toFixed(2)}%</TableCell>
                        <TableCell className="tabular-mono text-right">
                          {r.sharpe_ratio != null ? r.sharpe_ratio.toFixed(2) : '-'}
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
            </div>
          )}

          {result && !running && (
            <>
              <div className={`rounded-lg border p-5 ${
                result.total_pnl >= 0 ? 'bg-profit-bg border-profit/30' : 'bg-loss-bg border-loss/30'
              }`}>
                <div className="flex items-end justify-between">
                  <div>
                    <div className="text-xs text-muted-foreground mb-0.5">Total P&L</div>
                    <div className={`tabular-mono text-3xl font-bold ${
                      result.total_pnl >= 0 ? 'text-profit' : 'text-loss'
                    }`}>
                      {result.total_pnl >= 0 ? '+' : ''}${result.total_pnl.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                    </div>
                    <div className="text-sm text-muted-foreground mt-1">
                      {((result.total_pnl / result.starting_balance) * 100).toFixed(2)}% return
                      &nbsp;·&nbsp;
                      ${result.starting_balance.toLocaleString()} → ${result.ending_balance.toLocaleString()}
                    </div>
                  </div>
                  <div className="text-right text-xs text-muted-foreground">
                    {result.strategy_name && <div className="font-medium text-foreground mb-0.5">{result.strategy_name}</div>}
                    <div>{result.start_date} → {result.end_date}</div>
                    <div>Completed: {new Date(result.completed_at).toLocaleString()}</div>
                  </div>
                </div>
              </div>

              <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                <MetricCard label="Total Trades" value={String(result.total_trades)} />
                <MetricCard label="Win Rate" value={`${result.win_rate.toFixed(1)}%`}
                  color={result.win_rate >= 50 ? 'text-profit' : 'text-loss'} />
                <MetricCard label="Max Drawdown" value={result.max_drawdown != null ? `${result.max_drawdown.toFixed(2)}%` : '-'}
                  color="text-alert" />
                <MetricCard label="Sharpe Ratio" value={result.sharpe_ratio != null ? result.sharpe_ratio.toFixed(2) : '-'}
                  color={result.sharpe_ratio && result.sharpe_ratio >= 1 ? 'text-profit' : undefined} />
              </div>
              {result.winning_trades != null && (
                <div className="grid grid-cols-3 gap-3">
                  <MetricCard label="Winning Trades" value={String(result.winning_trades)} color="text-profit" />
                  <MetricCard label="Losing Trades" value={String(result.losing_trades ?? 0)} color="text-loss" />
                  <MetricCard label="Total Orders" value={String(result.total_orders ?? 0)} />
                </div>
              )}

              {equityCurve.length > 1 && (
                <div className="border border-border rounded-lg p-5">
                  <h3 className="text-sm font-semibold text-foreground mb-3">Equity Curve</h3>
                  <ResponsiveContainer width="100%" height={220}>
                    <LineChart data={equityCurve} margin={{ top: 5, right: 10, left: 10, bottom: 5 }}>
                      <CartesianGrid {...chartDefaults.grid} />
                      <XAxis
                        dataKey="time"
                        tickFormatter={formatTime}
                        tick={chartDefaults.axis.tick}
                        interval="preserveStartEnd"
                      />
                      <YAxis
                        tickFormatter={formatEquityLabel}
                        tick={chartDefaults.axis.tick}
                        width={60}
                      />
                      <Tooltip
                        {...chartDefaults.tooltip}
                        formatter={(value: number) => [`$${value.toLocaleString(undefined, { minimumFractionDigits: 2 })}`, 'Equity']}
                        labelFormatter={(label: string) => `Time: ${label}`}
                      />
                      <ReferenceLine y={startingBalance} stroke="hsl(var(--muted-foreground))" strokeDasharray="4 2" />
                      <Line
                        type="monotone"
                        dataKey="equity"
                        stroke={result.total_pnl >= 0 ? chartDefaults.profitStroke : chartDefaults.lossStroke}
                        strokeWidth={2}
                        dot={false}
                        activeDot={{ r: 4 }}
                      />
                    </LineChart>
                  </ResponsiveContainer>
                  <div className="flex justify-between text-xs text-muted-foreground mt-1">
                    <span>Start: ${startingBalance.toLocaleString()}</span>
                    <span>End: ${result.ending_balance.toLocaleString()}</span>
                  </div>
                </div>
              )}

              {result.positions && result.positions.length > 0 && (
                <Accordion type="single" collapsible>
                  <AccordionItem value="positions" className="border border-border rounded-lg">
                    <AccordionTrigger className="px-4 py-3 hover:no-underline">
                      <span className="text-sm font-medium">Positions ({result.positions.length})</span>
                    </AccordionTrigger>
                    <AccordionContent>
                      <div className="overflow-x-auto px-4 pb-4">
                        <Table>
                          <TableHeader>
                            <TableRow>
                              <TableHead>Instrument</TableHead>
                              <TableHead>Side</TableHead>
                              <TableHead className="text-right">Qty</TableHead>
                              <TableHead className="text-right">Avg Open</TableHead>
                              <TableHead className="text-right">Avg Close</TableHead>
                              <TableHead className="text-right">Realized P&L</TableHead>
                              <TableHead className="text-center">Status</TableHead>
                            </TableRow>
                          </TableHeader>
                          <TableBody>
                            {result.positions.slice(0, 50).map((pos, i) => {
                              const side = String(pos.side ?? '');
                              const isBuy = side.includes('LONG') || side.includes('BUY');
                              return (
                                <TableRow key={i}>
                                  <TableCell className="tabular-mono">{pos.instrument_id}</TableCell>
                                  <TableCell>
                                    <span className={`tabular-mono text-sm font-semibold ${
                                      isBuy ? 'text-profit' : 'text-loss'
                                    }`}>{isBuy ? 'LONG' : 'SHORT'}</span>
                                  </TableCell>
                                  <TableCell className="tabular-mono text-right">{Number(pos.quantity).toLocaleString()}</TableCell>
                                  <TableCell className="tabular-mono text-right">{pos.avg_px_open?.toFixed(5) ?? '-'}</TableCell>
                                  <TableCell className="tabular-mono text-right">{pos.avg_px_close?.toFixed(5) ?? '-'}</TableCell>
                                  <TableCell className={`tabular-mono text-right font-medium ${
                                    pos.realized_pnl >= 0 ? 'text-profit' : 'text-loss'
                                  }`}>
                                    {pos.realized_pnl >= 0 ? '+' : ''}{pos.realized_pnl?.toFixed(2) ?? '0.00'}
                                  </TableCell>
                                  <TableCell className="text-center">
                                    <Badge variant={pos.is_closed ? 'outline' : 'default'}>
                                      {pos.is_closed ? 'CLOSED' : 'OPEN'}
                                    </Badge>
                                  </TableCell>
                                </TableRow>
                              );
                            })}
                          </TableBody>
                        </Table>
                        {result.positions.length > 50 && (
                          <div className="text-center text-xs text-muted-foreground py-2">
                            Showing 50 of {result.positions.length} positions
                          </div>
                        )}
                      </div>
                    </AccordionContent>
                  </AccordionItem>
                </Accordion>
              )}
            </>
          )}
        </div>
      </div>
    </AppLayout>
  );
}

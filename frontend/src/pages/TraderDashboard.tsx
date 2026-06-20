import { useState, useEffect } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { useNotification } from "@/contexts/NotificationContext";
import nautilusService from '@/services/nautilusService';
import { useWebSocket } from '@/hooks/useWebSocket';

export default function TraderDashboard() {
  const { success, error: showError } = useNotification();
  const { connected: wsConnected, lastMessage } = useWebSocket();
  const [engineInfo, setEngineInfo] = useState<any>(null);
  const [components, setComponents] = useState<any[]>([]);
  const [riskMetrics, setRiskMetrics] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  // Live counters from WebSocket (update every 3s without extra HTTP)
  const [liveStrategiesCount, setLiveStrategiesCount] = useState<number | null>(null);
  const [livePositionsCount, setLivePositionsCount] = useState<number | null>(null);

  useEffect(() => {
    loadDashboardData();
    // Full refresh every 30s; WebSocket keeps counts fresh in between
    const interval = setInterval(loadDashboardData, 30_000);
    return () => clearInterval(interval);
  }, []);

  // Consume WebSocket live_data push
  useEffect(() => {
    if (lastMessage?.type === 'live_data') {
      if (lastMessage.engine?.strategies_count !== undefined) {
        setLiveStrategiesCount(lastMessage.engine.strategies_count);
      }
      if (lastMessage.open_positions_count !== undefined) {
        setLivePositionsCount(lastMessage.open_positions_count);
      }
    }
  }, [lastMessage]);

  const loadDashboardData = async () => {
    try {
      const [engine, comps, risk] = await Promise.all([
        nautilusService.getEngineInfo(),
        nautilusService.getComponents(),
        nautilusService.getRiskMetrics()
      ]);
      setEngineInfo(engine);
      setComponents(comps);
      setRiskMetrics(risk);
      setLoading(false);
    } catch (err) {
      console.error('Failed to load dashboard data:', err);
      setLoading(false);
    }
  };

  const getStatusColor = (status: string) => {
    const colors: Record<string, string> = {
      'running': 'bg-green-500',
      'active': 'bg-green-500',
      'stopped': 'bg-red-500',
      'paused': 'bg-yellow-500',
      'error': 'bg-red-500'
    };
    return colors[status.toLowerCase()] || 'bg-muted-foreground/50';
  };

  return (
    <div className="min-h-screen bg-background">
      <header className="bg-gradient-to-r from-primary to-primary/80 text-primary-foreground">
        <div className="container mx-auto px-4 py-6">
          <div className="flex items-center justify-between">
            <div>
              <h1 className="text-3xl font-bold">📈 Nautilus Trader Panel</h1>
              <p className="text-primary-foreground/80 mt-1">Professional algorithmic trading platform</p>
            </div>
            <div className="flex items-center gap-4">
              {engineInfo && (
                <div className="flex items-center gap-2 bg-background/10 px-4 py-2 rounded-lg">
                  <div className={`w-2 h-2 rounded-full ${engineInfo.is_running ? 'bg-green-400' : 'bg-red-400'} animate-pulse`}></div>
                  <div>
                    <div className="text-xs text-primary-foreground/70">Status</div>
                    <div className="font-semibold">{engineInfo.is_running ? 'Live' : 'Stopped'}</div>
                  </div>
                </div>
              )}
              <div className={`flex items-center gap-1.5 text-xs px-3 py-1.5 rounded-full ${wsConnected ? 'bg-green-500/20 text-green-200' : 'bg-red-500/20 text-red-200'}`}>
                <div className={`w-2 h-2 rounded-full ${wsConnected ? 'bg-green-400 animate-pulse' : 'bg-red-400'}`} />
                {wsConnected ? 'WS Live' : 'WS Off'}
              </div>
              <Button onClick={() => window.location.href = '/'} variant="outline" className="bg-background text-primary">
                ← Home
              </Button>
            </div>
          </div>
        </div>
      </header>

      <main className="container mx-auto px-4 py-8">
        {engineInfo && (
          <Card className="mb-6 border-border">
            <CardHeader className="bg-muted/50">
              <CardTitle className="flex items-center gap-2">
                <span className={`w-3 h-3 rounded-full ${engineInfo.is_running ? 'bg-green-500' : 'bg-red-500'} animate-pulse`}></span>
                Trading Engine: {engineInfo.trader_id}
              </CardTitle>
              <CardDescription>
                {engineInfo.engine_type} | Status: {engineInfo.status}
              </CardDescription>
            </CardHeader>
            <CardContent className="pt-6">
              <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                <div className="text-center p-4 bg-muted/30 rounded-lg">
                  <div className="text-2xl font-bold text-primary">
                    {liveStrategiesCount ?? engineInfo.strategies_count ?? 0}
                    {wsConnected && <span className="text-xs text-green-500 ml-1">●</span>}
                  </div>
                  <div className="text-sm text-muted-foreground">Active Strategies</div>
                </div>
                <div className="text-center p-4 bg-muted/30 rounded-lg">
                  <div className="text-2xl font-bold text-green-600 dark:text-green-400">{components.filter(c => c.status === 'running' || c.status === 'active').length}</div>
                  <div className="text-sm text-muted-foreground">Components Online</div>
                </div>
                <div className="text-center p-4 bg-muted/30 rounded-lg">
                  <div className="text-2xl font-bold text-purple-600 dark:text-purple-400">
                    {livePositionsCount ?? riskMetrics?.position_count ?? 0}
                    {wsConnected && <span className="text-xs text-green-500 ml-1">●</span>}
                  </div>
                  <div className="text-sm text-muted-foreground">Open Positions</div>
                </div>
                <div className="text-center p-4 bg-muted/30 rounded-lg">
                  <div className="text-2xl font-bold text-orange-600 dark:text-orange-400">
                    ${(riskMetrics?.total_exposure || 0).toLocaleString()}
                  </div>
                  <div className="text-sm text-muted-foreground">Total Exposure</div>
                </div>
              </div>
            </CardContent>
          </Card>
        )}

        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          <Card className="hover:shadow-lg transition-shadow">
            <CardHeader>
              <CardTitle>📈 Strategies</CardTitle>
              <CardDescription>Manage trading strategies</CardDescription>
            </CardHeader>
            <CardContent>
              <p className="text-sm text-muted-foreground mb-4">
                Create, configure, and monitor your algorithmic trading strategies.
              </p>
              <Button className="w-full" onClick={() => window.location.href = '/trader/strategies'}>
                Manage Strategies
              </Button>
            </CardContent>
          </Card>

          <Card className="hover:shadow-lg transition-shadow">
            <CardHeader>
              <CardTitle>📋 Orders</CardTitle>
              <CardDescription>Order management</CardDescription>
            </CardHeader>
            <CardContent>
              <p className="text-sm text-muted-foreground mb-4">
                Create, modify, and cancel orders. View order history and execution details.
              </p>
              <Button className="w-full" variant="secondary" onClick={() => window.location.href = '/trader/orders'}>
                Manage Orders
              </Button>
            </CardContent>
          </Card>

          <Card className="hover:shadow-lg transition-shadow">
            <CardHeader>
              <CardTitle>💼 Positions</CardTitle>
              <CardDescription>Position tracking</CardDescription>
            </CardHeader>
            <CardContent>
              <p className="text-sm text-muted-foreground mb-4">
                Monitor open positions, P&L, and position sizing across all instruments.
              </p>
              <Button className="w-full" variant="secondary" onClick={() => window.location.href = '/trader/positions'}>
                View Positions
              </Button>
            </CardContent>
          </Card>

          <Card className="hover:shadow-lg transition-shadow">
            <CardHeader>
              <CardTitle>⚖️ Risk Management</CardTitle>
              <CardDescription>Risk controls & limits</CardDescription>
            </CardHeader>
            <CardContent>
              <p className="text-sm text-muted-foreground mb-4">
                Configure risk limits, monitor exposure, and manage risk parameters.
              </p>
              <Button className="w-full" variant="destructive" onClick={() => window.location.href = '/trader/risk'}>
                Risk Dashboard
              </Button>
            </CardContent>
          </Card>

          <Card className="hover:shadow-lg transition-shadow">
            <CardHeader>
              <CardTitle>📈 Stocks</CardTitle>
              <CardDescription>Real-time stock quotes & charts</CardDescription>
            </CardHeader>
            <CardContent>
              <p className="text-sm text-muted-foreground mb-4">
                Search stocks, view live quotes, historical charts, and manage your watchlist.
              </p>
              <Button className="w-full" variant="secondary" onClick={() => window.location.href = '/trader/stocks'}>
                Open Stocks
              </Button>
            </CardContent>
          </Card>

          <Card className="hover:shadow-lg transition-shadow">
            <CardHeader>
              <CardTitle>🎯 Options</CardTitle>
              <CardDescription>Option chains, greeks & strategy builder</CardDescription>
            </CardHeader>
            <CardContent>
              <p className="text-sm text-muted-foreground mb-4">
                Browse option chains, analyze Greeks, build multi-leg strategies, and calculate BSM prices.
              </p>
              <Button className="w-full" variant="secondary" onClick={() => window.location.href = '/trader/options'}>
                Open Options
              </Button>
            </CardContent>
          </Card>

          <Card className="hover:shadow-lg transition-shadow">
            <CardHeader>
              <CardTitle>📊 Strategy Backtest</CardTitle>
              <CardDescription>Multi-leg option strategy backtesting</CardDescription>
            </CardHeader>
            <CardContent>
              <p className="text-sm text-muted-foreground mb-4">
                Backtest credit spreads, iron condors, calendar spreads, and more on historical data with margin & commission simulation.
              </p>
              <Button className="w-full" variant="secondary" onClick={() => window.location.href = '/trader/option-backtest'}>
                Run Backtest
              </Button>
            </CardContent>
          </Card>

          <Card className="hover:shadow-lg transition-shadow">
            <CardHeader>
              <CardTitle>📊 Market Data</CardTitle>
              <CardDescription>Real-time market feeds</CardDescription>
            </CardHeader>
            <CardContent>
              <p className="text-sm text-muted-foreground mb-4">
                Subscribe to market data, view quotes, and analyze market conditions.
              </p>
              <Button className="w-full" variant="secondary" onClick={() => window.location.href = '/trader/market-data'}>
                Market Data
              </Button>
            </CardContent>
          </Card>

          <Card className="hover:shadow-lg transition-shadow">
            <CardHeader>
              <CardTitle>📉 Performance</CardTitle>
              <CardDescription>Analytics & reporting</CardDescription>
            </CardHeader>
            <CardContent>
              <p className="text-sm text-muted-foreground mb-4">
                Analyze trading performance, view P&L reports, and track metrics.
              </p>
              <Button className="w-full" variant="secondary" onClick={() => window.location.href = '/trader/performance'}>
                View Analytics
              </Button>
            </CardContent>
          </Card>

          <Card className="hover:shadow-lg transition-shadow">
            <CardHeader>
              <CardTitle>🔔 Alerts</CardTitle>
              <CardDescription>Notifications & alerts</CardDescription>
            </CardHeader>
            <CardContent>
              <p className="text-sm text-muted-foreground mb-4">
                Configure price alerts, system notifications, and trading signals.
              </p>
              <Button className="w-full" variant="secondary" onClick={() => window.location.href = '/trader/alerts'}>
                Manage Alerts
              </Button>
            </CardContent>
          </Card>

          <Card className="hover:shadow-lg transition-shadow">
            <CardHeader>
              <CardTitle>🔬 Backtesting</CardTitle>
              <CardDescription>Strategy testing</CardDescription>
            </CardHeader>
            <CardContent>
              <p className="text-sm text-muted-foreground mb-4">
                Test strategies on historical data and analyze backtest results.
              </p>
              <Button className="w-full" variant="secondary" onClick={() => window.location.href = '/trader/backtesting'}>
                Run Backtest
              </Button>
            </CardContent>
          </Card>

          <Card className="hover:shadow-lg transition-shadow">
            <CardHeader>
              <CardTitle>📚 Documentation</CardTitle>
              <CardDescription>Help & guides</CardDescription>
            </CardHeader>
            <CardContent>
              <p className="text-sm text-muted-foreground mb-4">
                Access trading guides, API documentation, and tutorials.
              </p>
              <Button className="w-full" variant="outline" onClick={() => window.location.href = '/docs'}>
                View Docs
              </Button>
            </CardContent>
          </Card>
        </div>

        <Card className="mt-6">
          <CardHeader>
            <CardTitle>🔧 System Components</CardTitle>
            <CardDescription>Real-time component status</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
              {components.map((component) => (
                <div key={component.id} className="flex items-center gap-3 p-3 border rounded-lg bg-card">
                  <div className={`w-3 h-3 rounded-full ${getStatusColor(component.status)}`}></div>
                  <div className="flex-1">
                    <div className="font-semibold text-sm text-foreground">{component.name}</div>
                    <div className="text-xs text-muted-foreground">{component.type}</div>
                  </div>
                  <div className="text-xs px-2 py-1 bg-muted rounded text-muted-foreground">
                    {component.status}
                  </div>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>

        {riskMetrics && (
          <Card className="mt-6 border-border">
            <CardHeader className="bg-muted/50">
              <CardTitle>⚠️ Risk Metrics</CardTitle>
              <CardDescription>Current risk exposure and limits</CardDescription>
            </CardHeader>
            <CardContent className="pt-6">
              <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-4">
                <div className="text-center">
                  <div className="text-lg font-bold text-orange-600 dark:text-orange-400">
                    ${(riskMetrics.total_exposure || 0).toLocaleString()}
                  </div>
                  <div className="text-xs text-muted-foreground">Total Exposure</div>
                </div>
                <div className="text-center">
                  <div className="text-lg font-bold text-primary">
                    ${(riskMetrics.margin_used || 0).toLocaleString()}
                  </div>
                  <div className="text-xs text-muted-foreground">Margin Used</div>
                </div>
                <div className="text-center">
                  <div className="text-lg font-bold text-green-600 dark:text-green-400">
                    ${(riskMetrics.margin_available || 0).toLocaleString()}
                  </div>
                  <div className="text-xs text-muted-foreground">Available Margin</div>
                </div>
                <div className="text-center">
                  <div className="text-lg font-bold text-red-600 dark:text-red-400">
                    {(riskMetrics.max_drawdown || 0).toFixed(2)}%
                  </div>
                  <div className="text-xs text-muted-foreground">Max Drawdown</div>
                </div>
                <div className="text-center">
                  <div className="text-lg font-bold text-purple-600 dark:text-purple-400">
                    ${(riskMetrics.var_1d || 0).toLocaleString()}
                  </div>
                  <div className="text-xs text-muted-foreground">VaR (1D)</div>
                </div>
                <div className="text-center">
                  <div className="text-lg font-bold text-indigo-600 dark:text-indigo-400">
                    {riskMetrics.position_count || 0}
                  </div>
                  <div className="text-xs text-muted-foreground">Positions</div>
                </div>
              </div>
            </CardContent>
          </Card>
        )}
      </main>
    </div>
  );
}


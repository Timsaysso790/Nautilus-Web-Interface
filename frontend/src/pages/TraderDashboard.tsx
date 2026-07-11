import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { useWebSocket } from '@/hooks/useWebSocket';

export default function TraderDashboard() {
  const { connected: wsConnected } = useWebSocket();

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
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">

          <Card className="hover:shadow-lg transition-shadow">
            <CardHeader>
              <CardTitle>📊 Live Trading</CardTitle>
              <CardDescription>Manage your active trading operations</CardDescription>
            </CardHeader>
            <CardContent>
              <p className="text-sm text-muted-foreground mb-4">
                Create and monitor strategies, place orders, track positions, and manage broker connections.
              </p>
              <div className="grid grid-cols-2 gap-2">
                <Button variant="secondary" onClick={() => window.location.href = '/trader/strategies'}>
                  Strategies
                </Button>
                <Button variant="secondary" onClick={() => window.location.href = '/trader/orders'}>
                  Orders
                </Button>
                <Button variant="secondary" onClick={() => window.location.href = '/trader/broker-orders'}>
                  Broker Orders
                </Button>
              </div>
            </CardContent>
          </Card>

          <Card className="hover:shadow-lg transition-shadow">
            <CardHeader>
              <CardTitle>🔬 Research</CardTitle>
              <CardDescription>Analyze markets, test strategies, and review performance</CardDescription>
            </CardHeader>
            <CardContent>
              <p className="text-sm text-muted-foreground mb-4">
                Explore market data, analyze stocks and options, run backtests, and review trading performance.
              </p>
              <div className="grid grid-cols-2 gap-2">
                <Button variant="secondary" onClick={() => window.location.href = '/trader/market-data'}>
                  Market Data
                </Button>
                <Button variant="secondary" onClick={() => window.location.href = '/trader/stocks'}>
                  Stocks
                </Button>
                <Button variant="secondary" onClick={() => window.location.href = '/trader/options'}>
                  Options
                </Button>
                <Button variant="secondary" onClick={() => window.location.href = '/trader/backtesting'}>
                  Backtesting
                </Button>
                <Button className="col-span-2" variant="secondary" onClick={() => window.location.href = '/trader/option-backtest'}>
                  Strategy Backtest
                </Button>
              </div>
            </CardContent>
          </Card>

        </div>
      </main>
    </div>
  );
}

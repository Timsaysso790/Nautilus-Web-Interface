import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { useWebSocket } from '@/hooks/useWebSocket';
import AppLayout from "@/components/AppLayout";
import { LayoutDashboard, LineChart, TestTube } from "lucide-react";

export default function TraderDashboard() {
  const { connected: wsConnected } = useWebSocket();

  return (
    <AppLayout
      title="Trader Panel"
      subtitle="Professional algorithmic trading platform"
    >
      <div className="max-w-3xl mx-auto">
        <div className="mb-6">
          <div className="flex items-center gap-2 mb-4">
            <div className={`flex items-center gap-1.5 text-xs px-2.5 py-1 rounded-full font-medium ${
              wsConnected
                ? "bg-profit-bg text-profit"
                : "bg-loss-bg text-loss"
            }`}>
              <div className={`w-1.5 h-1.5 rounded-full ${wsConnected ? "bg-profit" : "bg-loss"}`} />
              {wsConnected ? "Live" : "Disconnected"}
            </div>
          </div>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          <Card className="hover:border-primary/30 transition-all">
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <LineChart className="h-5 w-5 text-primary" />
                Live Trading
              </CardTitle>
              <CardDescription>Manage your active trading operations</CardDescription>
            </CardHeader>
            <CardContent>
              <p className="text-sm text-muted-foreground mb-4">
                Create and monitor strategies, place orders, track positions, and manage broker connections.
              </p>
              <div className="grid grid-cols-2 gap-2">
                <Button variant="outline" onClick={() => window.location.href = '/trader/strategies'}>
                  Strategies
                </Button>
                <Button variant="outline" onClick={() => window.location.href = '/trader/orders'}>
                  Orders
                </Button>
                <Button variant="outline" onClick={() => window.location.href = '/trader/broker-orders'}>
                  Broker Orders
                </Button>
              </div>
            </CardContent>
          </Card>

          <Card className="hover:border-primary/30 transition-all">
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <TestTube className="h-5 w-5 text-primary" />
                Research
              </CardTitle>
              <CardDescription>Analyze markets, test strategies, and review performance</CardDescription>
            </CardHeader>
            <CardContent>
              <p className="text-sm text-muted-foreground mb-4">
                Explore market data, analyze stocks and options, run backtests, and review trading performance.
              </p>
              <div className="grid grid-cols-1 gap-2">
                <Button variant="outline" onClick={() => window.location.href = '/admin/data-lake?tab=research&view=new'}>
                  New Project
                </Button>
                <Button variant="outline" onClick={() => window.location.href = '/admin/data-lake?tab=research&view=projects'}>
                  Open Project
                </Button>
                <Button variant="outline" onClick={() => window.location.href = '/admin/data-lake?tab=research&view=quick-backtest'}>
                  Quick Backtest
                </Button>
              </div>
            </CardContent>
          </Card>
        </div>
      </div>
    </AppLayout>
  );
}

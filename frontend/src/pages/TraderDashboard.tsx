import { useState } from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { useWebSocket } from '@/hooks/useWebSocket';
import AppLayout from "@/components/AppLayout";
import NewProjectTypeDialog from "@/components/NewProjectTypeDialog";
import OpenProjectDialog from "@/components/OpenProjectDialog";
import { optionBacktestService } from "@/services/optionBacktestService";
import { LayoutDashboard, LineChart, TestTube } from "lucide-react";

export default function TraderDashboard() {
  const { connected: wsConnected } = useWebSocket();
  const [showNewProject, setShowNewProject] = useState(false);
  const [showOpenProject, setShowOpenProject] = useState(false);

  const handleNewProject = async (name: string, type: "options" | "portfolio") => {
    try {
      const res = await optionBacktestService.createProject(name, type);
      const path = type === "portfolio" ? "/trader/option-backtest" : "/trader/options-station";
      window.location.href = `${path}?project=${res.project.id}`;
    } catch {
      // error handled by service
    }
  };

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
                <Button variant="outline" onClick={() => setShowNewProject(true)}>
                  New Project
                </Button>
                <Button variant="outline" onClick={() => setShowOpenProject(true)}>
                  Open Project
                </Button>
                <Button variant="outline" onClick={() => window.location.href = '/trader/option-backtest'}>
                  Quick Backtest
                </Button>
              </div>
            </CardContent>
          </Card>
        </div>
      </div>

      <NewProjectTypeDialog
        open={showNewProject}
        onOpenChange={setShowNewProject}
        onConfirm={handleNewProject}
      />

      <OpenProjectDialog
        open={showOpenProject}
        onOpenChange={setShowOpenProject}
        onNewProject={() => {
          setShowOpenProject(false);
          setTimeout(() => setShowNewProject(true), 100);
        }}
      />
    </AppLayout>
  );
}

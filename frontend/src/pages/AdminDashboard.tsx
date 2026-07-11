import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { useEffect, useState } from "react";
import nautilusService, { type EngineInfo } from "@/services/nautilusService";

export default function AdminDashboard() {
  const [engineInfo, setEngineInfo] = useState<EngineInfo | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    loadEngineInfo();
  }, []);

  const loadEngineInfo = async () => {
    try {
      setLoading(true);
      const data = await nautilusService.getEngineInfo();
      setEngineInfo(data);
    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-background">
      <header className="bg-card border-b border-border">
        <div className="container mx-auto px-4 py-4">
          <div className="flex items-center justify-between">
            <div>
              <h1 className="text-2xl font-bold text-foreground">Nautilus Admin Panel</h1>
              <p className="text-sm text-muted-foreground mt-1">
                {loading ? "Connecting..." : engineInfo ? `Connected: ${engineInfo.trader_id}` : "Disconnected"}
              </p>
            </div>
            <Button variant="outline" onClick={() => window.location.href = '/'}>
              ← Back to Home
            </Button>
          </div>
        </div>
      </header>

      <main className="container mx-auto px-4 py-8">
        <div className="mb-8">
          <h2 className="text-3xl font-bold text-foreground mb-2">Dashboard</h2>
          <p className="text-muted-foreground">System management tools</p>
        </div>

        <div className="max-w-md mx-auto space-y-4">
          <Card>
            <CardHeader>
              <CardTitle>🗄️ Database Management</CardTitle>
              <CardDescription>
                Download market data, manage archive & cache, and browse backtest projects
              </CardDescription>
            </CardHeader>
            <CardContent>
              <p className="text-sm text-muted-foreground mb-4">
                One place to manage data downloads from ThetaData, browse your ticker archive,
                convert to NVMe cache, and view backtest project files and results.
              </p>
              <Button className="w-full" onClick={() => window.location.href = '/admin/db-management'}>
                Open Database Management
              </Button>
            </CardContent>
          </Card>
        </div>

        <div className="mt-8 text-center text-sm text-muted-foreground">
          <p>Nautilus Web Interface v1.0.0</p>
        </div>
      </main>
    </div>
  );
}

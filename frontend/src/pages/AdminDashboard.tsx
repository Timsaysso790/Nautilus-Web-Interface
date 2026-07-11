import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { useEffect, useState } from "react";
import nautilusService, { type EngineInfo } from "@/services/nautilusService";
import AppLayout from "@/components/AppLayout";
import { Database, Users } from "lucide-react";

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
    <AppLayout
      title="Admin Panel"
      subtitle={loading ? "Connecting..." : engineInfo ? `Connected: ${engineInfo.trader_id}` : "Disconnected"}
    >
      <div className="mb-6">
        <h2 className="text-xl font-semibold text-foreground">Dashboard</h2>
        <p className="text-sm text-muted-foreground">System management tools</p>
      </div>

      <div className="max-w-lg mx-auto space-y-4">
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Database className="h-5 w-5 text-primary" />
              Database Management
            </CardTitle>
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

        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Users className="h-5 w-5 text-primary" />
              User Management
            </CardTitle>
            <CardDescription>
              Manage user accounts, roles, and passwords
            </CardDescription>
          </CardHeader>
          <CardContent>
            <p className="text-sm text-muted-foreground mb-4">
              Create users with trader or admin roles, set passwords, deactivate accounts,
              and enforce access control for the platform.
            </p>
            <Button className="w-full" onClick={() => window.location.href = '/admin/users'}>
              Manage Users
            </Button>
          </CardContent>
        </Card>
      </div>

      <div className="mt-8 text-center text-xs text-muted-foreground">
        Nautilus Web Interface v1.0.0
      </div>
    </AppLayout>
  );
}

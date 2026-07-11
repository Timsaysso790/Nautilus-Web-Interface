import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { useNotification } from "@/contexts/NotificationContext";
import nautilusService from "@/services/nautilusService";
import AppLayout from "@/components/AppLayout";
import { Database } from "lucide-react";

export default function DatabasePage() {
  const { success, info, warning, error } = useNotification();

  const handleBackup = async (db: string) => {
    try {
      info(`Starting backup for ${db}...`);
      const result = await nautilusService.backupDatabase(db.toLowerCase());
      success(result.message);
    } catch (err) {
      error(`Failed to backup ${db}`);
    }
  };

  const handleOptimize = async (db: string) => {
    try {
      info(`Optimizing ${db}...`);
      const result = await nautilusService.optimizeDatabase(db.toLowerCase());
      success(result.message);
    } catch (err) {
      error(`Failed to optimize ${db}`);
    }
  };

  const handleClean = async (db: string) => {
    try {
      warning(`Cleaning ${db} cache...`);
      const result = await nautilusService.cleanCache(db.toLowerCase());
      success(result.message);
    } catch (err) {
      error(`Failed to clean ${db}`);
    }
  };

  return (
    <AppLayout
      title="Database Management"
      subtitle="Backup and maintain databases"
    >
      <div className="grid md:grid-cols-3 gap-6">
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Database className="h-5 w-5 text-primary" />
              PostgreSQL
            </CardTitle>
            <CardDescription>Main database cache</CardDescription>
          </CardHeader>
          <CardContent className="space-y-2">
            <Button className="w-full" onClick={() => handleBackup('PostgreSQL')}>
              Backup Database
            </Button>
            <Button className="w-full" variant="outline" onClick={() => handleOptimize('PostgreSQL')}>
              Optimize Tables
            </Button>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Database className="h-5 w-5 text-primary" />
              Parquet
            </CardTitle>
            <CardDescription>Columnar storage format</CardDescription>
          </CardHeader>
          <CardContent className="space-y-2">
            <Button className="w-full" onClick={() => handleBackup('Parquet')}>
              Backup Data
            </Button>
            <Button className="w-full" variant="outline" onClick={() => handleOptimize('Parquet')}>
              Compact Files
            </Button>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Database className="h-5 w-5 text-primary" />
              Redis Cache
            </CardTitle>
            <CardDescription>In-memory cache layer</CardDescription>
          </CardHeader>
          <CardContent className="space-y-2">
            <Button className="w-full" onClick={() => handleBackup('Redis')}>
              Backup Cache
            </Button>
            <Button className="w-full" variant="outline" onClick={() => handleClean('Redis')}>
              Clear Cache
            </Button>
          </CardContent>
        </Card>
      </div>
    </AppLayout>
  );
}

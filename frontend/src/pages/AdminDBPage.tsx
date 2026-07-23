import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { useNotification } from "@/contexts/NotificationContext";
import { useEffect, useState } from "react";
import API_CONFIG from "@/config";
import AppLayout from "@/components/AppLayout";
import { RefreshCw } from "lucide-react";

const ADMIN_API_URL = API_CONFIG.ADMIN_DB_API_URL;

interface Setting {
  id: number;
  key: string;
  value: string;
  category: string;
  description: string;
}

interface User {
  id: number;
  username: string;
  email: string;
  role: string;
  is_active: boolean;
  created_at: string;
}

interface APIConfig {
  id: number;
  name: string;
  endpoint: string;
  is_enabled: boolean;
}

export default function AdminDBPage() {
  const { success, error, info } = useNotification();
  const [settings, setSettings] = useState<Setting[]>([]);
  const [users, setUsers] = useState<User[]>([]);
  const [apiConfigs, setAPIConfigs] = useState<APIConfig[]>([]);
  const [loading, setLoading] = useState(true);
  const [editingKey, setEditingKey] = useState<string | null>(null);
  const [editValue, setEditValue] = useState("");

  useEffect(() => {
    loadData();
  }, []);

  const loadData = async () => {
    try {
      setLoading(true);
      
      const [settingsRes, usersRes, configsRes] = await Promise.all([
        fetch(`${ADMIN_API_URL}/api/admin/settings`),
        fetch(`${ADMIN_API_URL}/api/admin/users`),
        fetch(`${ADMIN_API_URL}/api/admin/api-configs`)
      ]);

      const settingsData = await settingsRes.json();
      const usersData = await usersRes.json();
      const configsData = await configsRes.json();

      setSettings(settingsData.settings || []);
      setUsers(usersData.users || []);
      setAPIConfigs(configsData.configs || []);
      
      success('Admin database loaded successfully!');
    } catch (err) {
      error('Failed to load admin database');
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  const handleUpdateSetting = async (key: string, value: string) => {
    try {
      const response = await fetch(`${ADMIN_API_URL}/api/admin/settings/${key}?value=${encodeURIComponent(value)}`, {
        method: 'PUT',
      });
      
      if (!response.ok) throw new Error('Update failed');
      
      success(`Setting '${key}' updated!`);
      setEditingKey(null);
      loadData();
    } catch (err) {
      error(`Failed to update setting '${key}'`);
    }
  };

  const groupedSettings = settings.reduce((acc, setting) => {
    if (!acc[setting.category]) {
      acc[setting.category] = [];
    }
    acc[setting.category].push(setting);
    return acc;
  }, {} as Record<string, Setting[]>);

  if (loading) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center">
        <div className="text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-primary mx-auto mb-4"></div>
          <p className="text-muted-foreground">Loading admin database...</p>
        </div>
      </div>
    );
  }

  return (
    <AppLayout
      title="Admin Database"
      subtitle="Manage system settings, users, and configurations"
      actions={
        <Button size="sm" onClick={loadData}>
          <RefreshCw className="h-3.5 w-3.5 mr-1" />
          Refresh
        </Button>
      }
    >
        {/* Settings Section */}
        <div className="mb-8">
          <h2 className="text-xl font-bold mb-4">System Settings</h2>
          <div className="grid gap-4">
            {Object.entries(groupedSettings).map(([category, categorySettings]) => (
              <Card key={category}>
                <CardHeader>
                  <CardTitle className="capitalize">{category}</CardTitle>
                  <CardDescription>{categorySettings.length} settings</CardDescription>
                </CardHeader>
                <CardContent>
                  <div className="space-y-3">
                    {categorySettings.map((setting) => (
                      <div key={setting.key} className="flex items-center justify-between p-3 bg-muted/50 rounded">
                        <div className="flex-1">
                          <div className="font-medium">{setting.key}</div>
                          <div className="text-sm text-muted-foreground">{setting.description}</div>
                          {editingKey === setting.key ? (
                            <input
                              type="text"
                              value={editValue}
                              onChange={(e) => setEditValue(e.target.value)}
                              className="mt-2 px-3 py-1 border rounded w-full max-w-md"
                              autoFocus
                            />
                          ) : (
                            <div className="mt-1 text-primary font-mono">{setting.value}</div>
                          )}
                        </div>
                        <div className="flex gap-2">
                          {editingKey === setting.key ? (
                            <>
                              <Button size="sm" onClick={() => handleUpdateSetting(setting.key, editValue)}>
                                Save
                              </Button>
                              <Button size="sm" variant="outline" onClick={() => setEditingKey(null)}>
                                Cancel
                              </Button>
                            </>
                          ) : (
                            <Button 
                              size="sm" 
                              variant="outline"
                              onClick={() => {
                                setEditingKey(setting.key);
                                setEditValue(setting.value);
                              }}
                            >
                              Edit
                            </Button>
                          )}
                        </div>
                      </div>
                    ))}
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>
        </div>

        {/* Users Section */}
        <div className="mb-8">
          <h2 className="text-xl font-bold mb-4">Users</h2>
          <Card>
            <CardHeader>
              <CardTitle>Admin Users</CardTitle>
              <CardDescription>{users.length} users</CardDescription>
            </CardHeader>
            <CardContent>
              <div className="space-y-2">
                {users.map((user) => (
                  <div key={user.id} className="flex items-center justify-between p-3 bg-muted/50 rounded">
                    <div>
                      <div className="font-medium">{user.username}</div>
                      <div className="text-sm text-muted-foreground">{user.email}</div>
                    </div>
                    <div className="flex items-center gap-3">
                      <Badge variant="secondary">{user.role}</Badge>
                      <Badge variant={user.is_active ? 'default' : 'outline'}>
                        {user.is_active ? 'Active' : 'Inactive'}
                      </Badge>
                    </div>
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>
        </div>

        {/* API Configs Section */}
        <div className="mb-8">
          <h2 className="text-xl font-bold mb-4">API Configurations</h2>
          <Card>
            <CardHeader>
              <CardTitle>External APIs</CardTitle>
              <CardDescription>{apiConfigs.length} configurations</CardDescription>
            </CardHeader>
            <CardContent>
              {apiConfigs.length === 0 ? (
                <p className="text-muted-foreground text-center py-4">No API configurations yet</p>
              ) : (
                <div className="space-y-2">
                  {apiConfigs.map((config) => (
                    <div key={config.id} className="flex items-center justify-between p-3 bg-muted/50 rounded">
                      <div>
                        <div className="font-medium">{config.name}</div>
                        <div className="text-sm text-muted-foreground">{config.endpoint}</div>
                      </div>
                      <Badge variant={config.is_enabled ? 'default' : 'outline'}>
                        {config.is_enabled ? 'Enabled' : 'Disabled'}
                      </Badge>
                    </div>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>
        </div>
    </AppLayout>
  );
}


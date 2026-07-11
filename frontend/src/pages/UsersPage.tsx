import { useEffect, useState } from "react";
import api from "@/lib/api";
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
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import { Badge } from "@/components/ui/badge";
import { Users, RefreshCw, RotateCcw } from "lucide-react";

interface User {
  id: string;
  username: string;
  role: string;
  is_active: number;
  created_at: string;
}

interface CreateUserForm {
  username: string;
  password: string;
  role: "trader" | "admin";
}

function roleBadgeVariant(role: string) {
  return role === "admin" ? "default" as const : "secondary" as const;
}

export default function UsersPage() {
  const [users, setUsers] = useState<User[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [creating, setCreating] = useState(false);
  const [form, setForm] = useState<CreateUserForm>({ username: "", password: "", role: "trader" });
  const [formError, setFormError] = useState<string | null>(null);
  const [successMsg, setSuccessMsg] = useState<string | null>(null);
  const [changePwUserId, setChangePwUserId] = useState<string | null>(null);
  const [newPw, setNewPw] = useState("");
  const [pwError, setPwError] = useState<string | null>(null);

  useEffect(() => {
    fetchUsers();
  }, []);

  const fetchUsers = async () => {
    try {
      const data = await api.get<{ users: User[] }>("/api/users");
      setUsers(data.users || []);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load users");
    } finally {
      setLoading(false);
    }
  };

  const handleCreate = async (e: React.FormEvent) => {
    e.preventDefault();
    setFormError(null);
    setCreating(true);
    try {
      await api.post("/api/users", form);
      setSuccessMsg(`User "${form.username}" created`);
      setForm({ username: "", password: "", role: "trader" });
      setTimeout(() => setSuccessMsg(null), 3000);
      fetchUsers();
    } catch (err: unknown) {
      setFormError(err instanceof Error ? err.message : "Failed to create user");
    } finally {
      setCreating(false);
    }
  };

  const handleDelete = async (userId: string, username: string) => {
    if (!confirm(`Deactivate user "${username}"?`)) return;
    try {
      await api.delete(`/api/users/${userId}`);
      setSuccessMsg(`User "${username}" deactivated`);
      setTimeout(() => setSuccessMsg(null), 3000);
      fetchUsers();
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "Failed to deactivate user");
    }
  };

  const handleChangePassword = async (e: React.FormEvent) => {
    e.preventDefault();
    if (newPw.length < 8) {
      setPwError("Password must be at least 8 characters");
      return;
    }
    setPwError(null);
    try {
      await api.post(`/api/users/${changePwUserId}/password`, { password: newPw });
      setSuccessMsg("Password updated successfully");
      setTimeout(() => setSuccessMsg(null), 3000);
      setChangePwUserId(null);
      setNewPw("");
    } catch (err: unknown) {
      setPwError(err instanceof Error ? err.message : "Failed to update password");
    }
  };

  return (
    <AppLayout
      title="User Management"
      subtitle="Manage user accounts and access control"
    >
      {successMsg && (
        <div className="mb-4 bg-profit-bg border border-profit/30 text-profit rounded-lg px-4 py-3 text-sm font-medium">
          {successMsg}
        </div>
      )}
      {error && (
        <div className="mb-4 bg-loss-bg border border-loss/30 text-loss rounded-lg px-4 py-3 text-sm">
          {error}
        </div>
      )}

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <div className="lg:col-span-1">
          <div className="border border-border rounded-lg p-5">
            <h2 className="text-sm font-semibold text-foreground mb-4">Create User</h2>
            <form onSubmit={handleCreate} className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-foreground mb-1">Username</label>
                <Input
                  type="text"
                  value={form.username}
                  onChange={(e) => setForm({ ...form, username: e.target.value })}
                  placeholder="e.g. trader1"
                  autoComplete="off"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-foreground mb-1">Password</label>
                <Input
                  type="password"
                  value={form.password}
                  onChange={(e) => setForm({ ...form, password: e.target.value })}
                  placeholder="Min 8 characters"
                  autoComplete="new-password"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-foreground mb-1">Role</label>
                <Select
                  value={form.role}
                  onValueChange={(v: "trader" | "admin") => setForm({ ...form, role: v })}
                >
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="trader">Trader</SelectItem>
                    <SelectItem value="admin">Admin</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              {formError && (
                <p className="text-sm text-loss">{formError}</p>
              )}
              <Button type="submit" disabled={creating} className="w-full">
                {creating ? "Creating..." : "Create User"}
              </Button>
            </form>
          </div>
        </div>

        <div className="lg:col-span-2">
          <div className="border border-border rounded-lg overflow-hidden">
            <div className="px-5 py-3 border-b border-border flex items-center justify-between">
              <h2 className="text-sm font-semibold text-foreground">
                Active Users <span className="text-muted-foreground font-normal">({users.length})</span>
              </h2>
              <Button variant="ghost" size="sm" onClick={fetchUsers}>
                <RefreshCw className="h-3.5 w-3.5 mr-1" />
                Refresh
              </Button>
            </div>

            {loading ? (
              <div className="p-8 text-center text-muted-foreground">Loading...</div>
            ) : users.length === 0 ? (
              <div className="p-8 text-center text-muted-foreground">No users found</div>
            ) : (
              <div className="divide-y divide-border">
                {users.map((user) => (
                  <div key={user.id} className="px-5 py-4 flex items-center justify-between">
                    <div>
                      <div className="flex items-center gap-2">
                        <span className="font-medium text-foreground">{user.username}</span>
                        <Badge variant={roleBadgeVariant(user.role)} className="text-xs">
                          {user.role}
                        </Badge>
                      </div>
                      <div className="text-xs text-muted-foreground mt-0.5">
                        Created {new Date(user.created_at).toLocaleDateString()}
                      </div>
                    </div>
                    <div className="flex items-center gap-2">
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => {
                          setChangePwUserId(user.id);
                          setNewPw("");
                          setPwError(null);
                        }}
                      >
                        <RotateCcw className="h-3 w-3 mr-1" />
                        Change PW
                      </Button>
                      {user.username !== "admin" && (
                        <Button
                          variant="outline"
                          size="sm"
                          className="text-loss hover:text-loss"
                          onClick={() => handleDelete(user.id, user.username)}
                        >
                          Deactivate
                        </Button>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      </div>

      <Dialog open={!!changePwUserId} onOpenChange={(open) => !open && setChangePwUserId(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Change Password</DialogTitle>
          </DialogHeader>
          <form onSubmit={handleChangePassword} className="space-y-4 py-2">
            <div>
              <label className="block text-sm font-medium text-foreground mb-1">New Password</label>
              <Input
                type="password"
                value={newPw}
                onChange={(e) => setNewPw(e.target.value)}
                placeholder="Min 8 characters"
                autoFocus
                autoComplete="new-password"
              />
            </div>
            {pwError && <p className="text-sm text-loss">{pwError}</p>}
            <DialogFooter>
              <Button variant="outline" type="button" onClick={() => setChangePwUserId(null)}>
                Cancel
              </Button>
              <Button type="submit">Update</Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </AppLayout>
  );
}

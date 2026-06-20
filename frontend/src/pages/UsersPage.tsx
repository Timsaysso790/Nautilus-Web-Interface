import { useEffect, useState } from "react";
import api from "@/lib/api";

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
    setLoading(true);
    setError(null);
    try {
      const data = await api.get<{ users: User[] }>("/api/users");
      setUsers(data.users.filter((u) => u.is_active));
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "Failed to load users");
    } finally {
      setLoading(false);
    }
  };

  const handleCreate = async (e: React.FormEvent) => {
    e.preventDefault();
    setFormError(null);
    if (!form.username.trim() || form.username.length < 3) {
      setFormError("Username must be at least 3 characters");
      return;
    }
    if (form.password.length < 8) {
      setFormError("Password must be at least 8 characters");
      return;
    }
    setCreating(true);
    try {
      await api.post("/api/users", form);
      setSuccessMsg(`User '${form.username}' created successfully`);
      setForm({ username: "", password: "", role: "trader" });
      setTimeout(() => setSuccessMsg(null), 3000);
      await fetchUsers();
    } catch (err: unknown) {
      setFormError(err instanceof Error ? err.message : "Failed to create user");
    } finally {
      setCreating(false);
    }
  };

  const handleDelete = async (userId: string, username: string) => {
    if (!window.confirm(`Deactivate user '${username}'?`)) return;
    try {
      await api.delete(`/api/users/${userId}`);
      setSuccessMsg(`User '${username}' deactivated`);
      setTimeout(() => setSuccessMsg(null), 3000);
      await fetchUsers();
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "Failed to deactivate user");
    }
  };

  const handleChangePassword = async (e: React.FormEvent) => {
    e.preventDefault();
    setPwError(null);
    if (newPw.length < 8) {
      setPwError("Password must be at least 8 characters");
      return;
    }
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

  const roleColor = (role: string) =>
    role === "admin" ? "bg-purple-100 text-purple-700" : "bg-blue-100 text-blue-700";

  return (
    <div className="min-h-screen bg-background p-8">
      <div className="max-w-4xl mx-auto">
        {/* Header */}
        <div className="flex justify-between items-center mb-8">
          <div>
            <h1 className="text-4xl font-bold text-foreground mb-1">👥 User Management</h1>
            <p className="text-muted-foreground">Manage user accounts and access control</p>
          </div>
          <button
            onClick={() => window.history.back()}
            className="px-5 py-2.5 bg-card border-2 border-input text-foreground rounded-lg hover:bg-muted/50 font-semibold"
          >
            ← Back
          </button>
        </div>

        {/* Feedback */}
        {successMsg && (
          <div className="mb-4 p-4 bg-green-50 border border-green-200 rounded-xl text-green-800 font-medium">
            ✓ {successMsg}
          </div>
        )}
        {error && (
          <div className="mb-4 p-4 bg-destructive/10 border border-destructive/30 rounded-xl text-destructive">
            {error}
          </div>
        )}

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          {/* Create User Form */}
          <div className="lg:col-span-1">
            <div className="bg-card rounded-xl shadow-sm border border-border p-6">
              <h2 className="font-bold text-foreground mb-4">Create User</h2>
              <form onSubmit={handleCreate} className="space-y-4">
                <div>
                  <label className="block text-sm font-medium text-foreground mb-1">Username</label>
                  <input
                    type="text"
                    value={form.username}
                    onChange={(e) => setForm({ ...form, username: e.target.value })}
                    className="w-full px-3 py-2 border border-input rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
                    placeholder="e.g. trader1"
                    autoComplete="off"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-foreground mb-1">Password</label>
                  <input
                    type="password"
                    value={form.password}
                    onChange={(e) => setForm({ ...form, password: e.target.value })}
                    className="w-full px-3 py-2 border border-input rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
                    placeholder="Min 8 characters"
                    autoComplete="new-password"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-foreground mb-1">Role</label>
                  <select
                    value={form.role}
                    onChange={(e) => setForm({ ...form, role: e.target.value as "trader" | "admin" })}
                    className="w-full px-3 py-2 border border-input rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
                  >
                    <option value="trader">Trader</option>
                    <option value="admin">Admin</option>
                  </select>
                </div>
                {formError && (
                  <p className="text-sm text-red-600 dark:text-red-400">{formError}</p>
                )}
                <button
                  type="submit"
                  disabled={creating}
                  className="w-full px-4 py-2 bg-indigo-600 text-white rounded-lg hover:bg-indigo-700 font-semibold text-sm disabled:opacity-50 transition-colors"
                >
                  {creating ? "Creating..." : "Create User"}
                </button>
              </form>
            </div>
          </div>

          {/* User List */}
          <div className="lg:col-span-2">
            <div className="bg-card rounded-xl border border-border overflow-hidden">
              <div className="px-5 py-4 border-b border-border flex items-center justify-between">
                <h2 className="font-bold text-foreground">
                  Active Users <span className="text-muted-foreground font-normal">({users.length})</span>
                </h2>
                <button
                  onClick={fetchUsers}
                  className="text-sm text-indigo-600 hover:underline"
                >
                  Refresh
                </button>
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
                          <span className="font-semibold text-foreground">{user.username}</span>
                          <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${roleColor(user.role)}`}>
                            {user.role}
                          </span>
                        </div>
                        <div className="text-xs text-muted-foreground mt-0.5">
                          Created {new Date(user.created_at).toLocaleDateString()}
                        </div>
                      </div>
                      <div className="flex items-center gap-2">
                        <button
                          onClick={() => {
                            setChangePwUserId(user.id);
                            setNewPw("");
                            setPwError(null);
                          }}
                          className="px-3 py-1.5 text-xs border border-input rounded-lg hover:bg-muted/50 text-muted-foreground transition-colors"
                        >
                          Change PW
                        </button>
                        {user.username !== "admin" && (
                          <button
                            onClick={() => handleDelete(user.id, user.username)}
                            className="px-3 py-1.5 text-xs border border-red-200 rounded-lg hover:bg-red-50 text-red-600 dark:text-red-400 transition-colors"
                          >
                            Deactivate
                          </button>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        </div>

        {/* Change Password Modal */}
        {changePwUserId && (
          <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50">
            <div className="bg-card rounded-xl shadow-xl p-6 w-80">
              <h3 className="font-bold text-foreground mb-4">Change Password</h3>
              <form onSubmit={handleChangePassword} className="space-y-4">
                <div>
                  <label className="block text-sm font-medium text-foreground mb-1">New Password</label>
                  <input
                    type="password"
                    value={newPw}
                    onChange={(e) => setNewPw(e.target.value)}
                    className="w-full px-3 py-2 border border-input rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
                    placeholder="Min 8 characters"
                    autoFocus
                    autoComplete="new-password"
                  />
                </div>
                {pwError && <p className="text-sm text-red-600 dark:text-red-400">{pwError}</p>}
                <div className="flex gap-2">
                  <button
                    type="submit"
                    className="flex-1 px-4 py-2 bg-indigo-600 text-white rounded-lg hover:bg-indigo-700 font-semibold text-sm transition-colors"
                  >
                    Update
                  </button>
                  <button
                    type="button"
                    onClick={() => setChangePwUserId(null)}
                    className="flex-1 px-4 py-2 border border-input text-foreground rounded-lg hover:bg-muted/50 font-semibold text-sm transition-colors"
                  >
                    Cancel
                  </button>
                </div>
              </form>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

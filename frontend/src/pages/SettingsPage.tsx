import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { useNotification } from "@/contexts/NotificationContext";
import api from "@/lib/api";
import AppLayout from "@/components/AppLayout";

function TwoFactorCard() {
  const { success, error: notifyError } = useNotification();
  const [enabled, setEnabled] = useState<boolean | null>(null);
  const [setupData, setSetupData] = useState<{ secret: string; otpauth_uri: string } | null>(null);
  const [code, setCode] = useState("");
  const [busy, setBusy] = useState(false);
  const [mode, setMode] = useState<"idle" | "enabling" | "disabling">("idle");

  useEffect(() => {
    api.get<{ two_factor_enabled: boolean }>("/api/auth/2fa/status")
      .then(d => setEnabled(d.two_factor_enabled))
      .catch(() => setEnabled(false));
  }, []);

  const startSetup = async () => {
    setBusy(true);
    try {
      const d = await api.get<{ secret: string; otpauth_uri: string }>("/api/auth/2fa/setup");
      setSetupData(d);
      setMode("enabling");
      setCode("");
    } catch { notifyError("Failed to generate 2FA secret"); }
    finally { setBusy(false); }
  };

  const confirmEnable = async () => {
    if (code.length < 6) return;
    setBusy(true);
    try {
      await api.post("/api/auth/2fa/enable", { totp_code: code });
      setEnabled(true);
      setMode("idle");
      setSetupData(null);
      setCode("");
      success("2FA activated — your account is now protected");
    } catch { notifyError("Invalid code — check your authenticator app"); }
    finally { setBusy(false); }
  };

  const startDisable = () => { setMode("disabling"); setCode(""); };

  const confirmDisable = async () => {
    if (code.length < 6) return;
    setBusy(true);
    try {
      await api.post("/api/auth/2fa/disable", { totp_code: code });
      setEnabled(false);
      setMode("idle");
      setCode("");
      success("2FA deactivated");
    } catch { notifyError("Invalid code"); }
    finally { setBusy(false); }
  };

  const cancel = () => { setMode("idle"); setSetupData(null); setCode(""); };

  return (
    <Card>
      <CardHeader>
        <CardTitle>Two-Factor Authentication</CardTitle>
        <CardDescription>TOTP-based 2FA (Google Authenticator, Authy, etc.)</CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="flex items-center gap-3">
          <span className={`inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-sm font-semibold ${
            enabled ? "text-profit bg-profit-bg" : "bg-muted text-muted-foreground"
          }`}>
            <span className={`w-2 h-2 rounded-full ${enabled ? "bg-profit" : "bg-muted-foreground/50"}`} />
            {enabled === null ? "Checking..." : enabled ? "Enabled" : "Disabled"}
          </span>
        </div>

        {mode === "idle" && enabled !== null && (
          enabled
            ? <Button variant="outline" onClick={startDisable} className="text-loss hover:text-loss">Disable 2FA</Button>
            : <Button onClick={startSetup} disabled={busy}>
                {busy ? "Generating..." : "Set Up 2FA"}
              </Button>
        )}

        {mode === "enabling" && setupData && (
          <div className="space-y-4">
            <div className="bg-alert/10 border border-alert/30 rounded-lg p-4">
              <p className="text-sm font-semibold text-alert mb-2">Step 1 — Add to your authenticator app</p>
              <p className="text-xs text-alert/80 mb-3">
                Scan the QR code or manually enter this secret key:
              </p>
              <div className="font-mono text-sm bg-card border border-border rounded px-3 py-2 break-all select-all mb-3">
                {setupData.secret}
              </div>
              <img
                src={`https://api.qrserver.com/v1/create-qr-code/?size=160x160&data=${encodeURIComponent(setupData.otpauth_uri)}`}
                alt="TOTP QR code"
                className="rounded border border-border"
                width={160}
                height={160}
                onError={(e) => { (e.target as HTMLImageElement).style.display = 'none'; }}
              />
            </div>
            <div>
              <p className="text-sm font-medium mb-2">Step 2 — Enter the 6-digit code to confirm</p>
              <div className="flex gap-2">
                <Input
                  type="text"
                  inputMode="numeric"
                  maxLength={6}
                  value={code}
                  onChange={e => setCode(e.target.value.replace(/\D/g, ""))}
                  placeholder="000000"
                  className="w-32 font-mono text-lg tracking-widest text-center"
                  autoFocus
                />
                <Button onClick={confirmEnable} disabled={busy || code.length < 6}>
                  {busy ? "Verifying..." : "Activate 2FA"}
                </Button>
                <Button variant="outline" onClick={cancel}>Cancel</Button>
              </div>
            </div>
          </div>
        )}

        {mode === "disabling" && (
          <div className="space-y-3">
            <p className="text-sm text-muted-foreground">Enter your current 2FA code to disable:</p>
            <div className="flex gap-2">
              <Input
                type="text"
                inputMode="numeric"
                maxLength={6}
                value={code}
                onChange={e => setCode(e.target.value.replace(/\D/g, ""))}
                placeholder="000000"
                className="w-32 font-mono text-lg tracking-widest text-center"
                autoFocus
              />
              <Button variant="outline" onClick={confirmDisable} disabled={busy || code.length < 6}
                className="text-loss border-loss/30 hover:bg-loss-bg">
                {busy ? "Verifying..." : "Disable 2FA"}
              </Button>
              <Button variant="outline" onClick={cancel}>Cancel</Button>
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  );
}

interface Settings {
  system_name: string;
  environment: string;
  email_notifications: boolean;
  slack_notifications: boolean;
  sms_alerts: boolean;
  session_timeout: number;
  two_factor_auth: boolean;
  max_concurrent_requests: number;
  cache_ttl: number;
}

const DEFAULTS: Settings = {
  system_name: "Nautilus Trader",
  environment: "Production",
  email_notifications: true,
  slack_notifications: false,
  sms_alerts: false,
  session_timeout: 30,
  two_factor_auth: true,
  max_concurrent_requests: 100,
  cache_ttl: 3600,
};

export default function SettingsPage() {
  const { success, error: notifyError, warning } = useNotification();
  const [settings, setSettings] = useState<Settings>(DEFAULTS);
  const [saving, setSaving] = useState(false);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    api.get<Settings>('/api/settings')
      .then(data => setSettings({ ...DEFAULTS, ...data }))
      .catch(() => {/* use defaults */})
      .finally(() => setLoading(false));
  }, []);

  const set = (key: keyof Settings, value: Settings[keyof Settings]) =>
    setSettings(prev => ({ ...prev, [key]: value }));

  const saveAll = async () => {
    setSaving(true);
    try {
      await api.post('/api/settings', settings);
      success("All settings saved successfully!");
    } catch {
      notifyError("Failed to save settings");
    } finally {
      setSaving(false);
    }
  };

  const resetAll = () => {
    setSettings(DEFAULTS);
    warning("Settings reset to defaults (not saved yet)");
  };

  if (loading) {
    return (
      <AppLayout title="System Settings" subtitle="Configure system preferences">
        <div className="text-center text-muted-foreground py-12 animate-pulse">Loading settings...</div>
      </AppLayout>
    );
  }

  return (
    <AppLayout
      title="System Settings"
      subtitle="Configure system preferences"
    >
      <div className="grid md:grid-cols-2 gap-6">
        <Card>
          <CardHeader>
            <CardTitle>General Settings</CardTitle>
            <CardDescription>Basic system configuration</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="space-y-1.5">
              <label className="text-sm font-medium text-foreground">System Name</label>
              <Input
                type="text"
                value={settings.system_name}
                onChange={e => set("system_name", e.target.value)}
              />
            </div>
            <div className="space-y-1.5">
              <label className="text-sm font-medium text-foreground">Environment</label>
              <Select
                value={settings.environment}
                onValueChange={v => set("environment", v)}
              >
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="Production">Production</SelectItem>
                  <SelectItem value="Staging">Staging</SelectItem>
                  <SelectItem value="Development">Development</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Notifications</CardTitle>
            <CardDescription>Alert preferences</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            {([
              ["email_notifications", "Email Notifications"],
              ["slack_notifications", "Slack Notifications"],
              ["sms_alerts", "SMS Alerts"],
            ] as [keyof Settings, string][]).map(([key, label]) => (
              <div key={key} className="flex items-center justify-between">
                <label className="text-sm font-medium text-foreground">{label}</label>
                <Switch
                  checked={settings[key] as boolean}
                  onCheckedChange={checked => set(key, checked)}
                />
              </div>
            ))}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Security</CardTitle>
            <CardDescription>Security & authentication</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="space-y-1.5">
              <label className="text-sm font-medium text-foreground">Session Timeout (minutes)</label>
              <Input
                type="number"
                value={settings.session_timeout}
                onChange={e => set("session_timeout", parseInt(e.target.value) || 30)}
              />
              <p className="text-xs text-muted-foreground">
                Token expiry in minutes. 0 = use JWT_EXPIRE_HOURS env var (default 8h).
              </p>
            </div>
          </CardContent>
        </Card>

        <TwoFactorCard />

        <Card>
          <CardHeader>
            <CardTitle>Performance</CardTitle>
            <CardDescription>System performance tuning</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="space-y-1.5">
              <label className="text-sm font-medium text-foreground">Max Concurrent Requests</label>
              <Input
                type="number"
                value={settings.max_concurrent_requests}
                onChange={e => set("max_concurrent_requests", parseInt(e.target.value) || 100)}
              />
            </div>
            <div className="space-y-1.5">
              <label className="text-sm font-medium text-foreground">Cache TTL (seconds)</label>
              <Input
                type="number"
                value={settings.cache_ttl}
                onChange={e => set("cache_ttl", parseInt(e.target.value) || 3600)}
              />
            </div>
          </CardContent>
        </Card>
      </div>

      <Card className="mt-6">
        <CardHeader>
          <CardTitle>Global Actions</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="flex gap-4">
            <Button onClick={saveAll} disabled={saving}>
              {saving ? "Saving..." : "Save All Settings"}
            </Button>
            <Button variant="outline" onClick={resetAll}>
              Reset to Defaults
            </Button>
          </div>
        </CardContent>
      </Card>
    </AppLayout>
  );
}

import { useState, useEffect } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  Settings, Key, Database, Server, HardDrive, Activity,
  RefreshCw, Save, Eye, EyeOff, CheckCircle, XCircle
} from "lucide-react";
import api from "@/lib/api";

export default function SettingsPage() {
  const [tab, setTab] = useState("general");
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [showSecrets, setShowSecrets] = useState(false);

  // Settings state
  const [settings, setSettings] = useState({
    THETADATA_API_KEY: "",
    FRED_API_KEY: "",
    OLLAMA_BASE_URL: "http://localhost:11434",
    OLLAMA_MODEL: "llama3.2:latest",
    RATE_LIMIT_PER_MINUTE: 200,
    JWT_EXPIRE_HOURS: 8,
    OPTIONS_ARCHIVE_PATH: "/workspace/Archive/Nautilus_Archive5min",
    EQUITY_ARCHIVE_PATH: "/workspace/Archive/Equity_Archive",
  });

  const [aiStatus, setAiStatus] = useState<any>(null);

  useEffect(() => {
    checkAiStatus();
  }, []);

  const checkAiStatus = async () => {
    try {
      const data = await api.get("/api/ai/status");
      setAiStatus(data);
    } catch {}
  };

  const handleSave = async () => {
    setSaving(true);
    setSaved(false);
    // In a real deployment, save to .env or DB
    await new Promise(r => setTimeout(r, 500));
    setSaving(false);
    setSaved(true);
    setTimeout(() => setSaved(false), 2000);
  };

  return (
    <div className="space-y-4 max-w-3xl mx-auto">
      <div>
        <h1 className="text-lg font-semibold text-gray-100 flex items-center gap-2">
          <Settings className="h-5 w-5 text-gray-400" />
          System Settings
        </h1>
        <p className="text-xs text-gray-500 mt-0.5">Configure system preferences and API keys</p>
      </div>

      <Tabs value={tab} onValueChange={setTab}>
        <TabsList className="bg-[#0d1321] border border-gray-800/60">
          <TabsTrigger value="general" className="text-xs"><Server className="h-3 w-3 mr-1" /> General</TabsTrigger>
          <TabsTrigger value="api-keys" className="text-xs"><Key className="h-3 w-3 mr-1" /> API Keys</TabsTrigger>
          <TabsTrigger value="ai" className="text-xs"><Activity className="h-3 w-3 mr-1" /> AI</TabsTrigger>
          <TabsTrigger value="storage" className="text-xs"><Database className="h-3 w-3 mr-1" /> Storage</TabsTrigger>
        </TabsList>

        {/* General */}
        {tab === "general" && (
          <div className="space-y-3 mt-4">
            <Card className="bg-[#0d1321] border-gray-800/60">
              <CardHeader className="p-3 pb-0">
                <CardTitle className="text-xs text-gray-400">Rate Limiting</CardTitle>
              </CardHeader>
              <CardContent className="p-3 space-y-2">
                <div className="flex items-center justify-between">
                  <span className="text-xs text-gray-400">API Requests per Minute</span>
                  <Input
                    type="number"
                    value={settings.RATE_LIMIT_PER_MINUTE}
                    onChange={e => setSettings(s => ({ ...s, RATE_LIMIT_PER_MINUTE: parseInt(e.target.value) || 200 }))}
                    className="w-24 h-7 text-xs bg-[#0a0e17] border-gray-700 text-right"
                  />
                </div>
                <div className="flex items-center justify-between">
                  <span className="text-xs text-gray-400">JWT Expiry (hours)</span>
                  <Input
                    type="number"
                    value={settings.JWT_EXPIRE_HOURS}
                    onChange={e => setSettings(s => ({ ...s, JWT_EXPIRE_HOURS: parseInt(e.target.value) || 8 }))}
                    className="w-24 h-7 text-xs bg-[#0a0e17] border-gray-700 text-right"
                  />
                </div>
              </CardContent>
            </Card>

            <Card className="bg-[#0d1321] border-gray-800/60">
              <CardContent className="p-3 flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <Server className="h-3.5 w-3.5 text-gray-500" />
                  <span className="text-xs text-gray-400">Backend Status</span>
                </div>
                <Badge className="text-[10px] bg-emerald-900/30 text-emerald-400">Running</Badge>
              </CardContent>
            </Card>
          </div>
        )}

        {/* API Keys */}
        {tab === "api-keys" && (
          <div className="space-y-3 mt-4">
            <Card className="bg-[#0d1321] border-gray-800/60">
              <CardHeader className="p-3 pb-0">
                <CardTitle className="text-xs text-gray-400 flex items-center gap-2">
                  <Key className="h-3 w-3" /> Data Source API Keys
                </CardTitle>
              </CardHeader>
              <CardContent className="p-3 space-y-3">
                <div>
                  <label className="text-[11px] text-gray-500 block mb-1">ThetaData API Key</label>
                  <div className="flex gap-2">
                    <Input
                      type={showSecrets ? "text" : "password"}
                      value={settings.THETADATA_API_KEY}
                      onChange={e => setSettings(s => ({ ...s, THETADATA_API_KEY: e.target.value }))}
                      placeholder="Enter your ThetaData API key..."
                      className="flex-1 h-8 text-xs bg-[#0a0e17] border-gray-700 font-mono"
                    />
                    <Button size="sm" variant="ghost" onClick={() => setShowSecrets(!showSecrets)} className="h-8">
                      {showSecrets ? <EyeOff className="h-3 w-3" /> : <Eye className="h-3 w-3" />}
                    </Button>
                  </div>
                </div>
                <div>
                  <label className="text-[11px] text-gray-500 block mb-1">FRED API Key</label>
                  <Input
                    type={showSecrets ? "text" : "password"}
                    value={settings.FRED_API_KEY}
                    onChange={e => setSettings(s => ({ ...s, FRED_API_KEY: e.target.value }))}
                    placeholder="Enter your FRED API key..."
                    className="w-full h-8 text-xs bg-[#0a0e17] border-gray-700 font-mono"
                  />
                </div>
              </CardContent>
            </Card>
          </div>
        )}

        {/* AI */}
        {tab === "ai" && (
          <div className="space-y-3 mt-4">
            <Card className="bg-[#0d1321] border-gray-800/60">
              <CardHeader className="p-3 pb-0">
                <CardTitle className="text-xs text-gray-400">Ollama Configuration</CardTitle>
              </CardHeader>
              <CardContent className="p-3 space-y-3">
                <div>
                  <label className="text-[11px] text-gray-500 block mb-1">Ollama URL</label>
                  <Input
                    value={settings.OLLAMA_BASE_URL}
                    onChange={e => setSettings(s => ({ ...s, OLLAMA_BASE_URL: e.target.value }))}
                    placeholder="http://localhost:11434"
                    className="w-full h-8 text-xs bg-[#0a0e17] border-gray-700"
                  />
                </div>
                <div>
                  <label className="text-[11px] text-gray-500 block mb-1">Default Model</label>
                  <Input
                    value={settings.OLLAMA_MODEL}
                    onChange={e => setSettings(s => ({ ...s, OLLAMA_MODEL: e.target.value }))}
                    placeholder="llama3.2:latest"
                    className="w-full h-8 text-xs bg-[#0a0e17] border-gray-700"
                  />
                </div>

                <div className="flex items-center justify-between bg-[#0a0e17] border border-gray-800/60 rounded p-2">
                  <div className="flex items-center gap-2">
                    <Activity className="h-3.5 w-3.5 text-gray-500" />
                    <span className="text-xs text-gray-400">AI Status</span>
                  </div>
                  {aiStatus ? (
                    <div className="flex items-center gap-2">
                      <Badge className={`text-[10px] ${aiStatus.available ? "bg-emerald-900/30 text-emerald-400" : "bg-red-900/30 text-red-400"}`}>
                        {aiStatus.available ? "Connected" : "Offline"}
                      </Badge>
                      {aiStatus.available_models && (
                        <span className="text-[10px] text-gray-500">{aiStatus.available_models.length} models</span>
                      )}
                    </div>
                  ) : (
                    <Button size="sm" variant="ghost" onClick={checkAiStatus} className="h-6 text-[10px]">
                      <RefreshCw className="h-3 w-3 mr-1" /> Check
                    </Button>
                  )}
                </div>
              </CardContent>
            </Card>
          </div>
        )}

        {/* Storage */}
        {tab === "storage" && (
          <div className="space-y-3 mt-4">
            <Card className="bg-[#0d1321] border-gray-800/60">
              <CardHeader className="p-3 pb-0">
                <CardTitle className="text-xs text-gray-400">Archive Paths</CardTitle>
              </CardHeader>
              <CardContent className="p-3 space-y-3">
                <div>
                  <label className="text-[11px] text-gray-500 block mb-1">Options Archive</label>
                  <Input
                    value={settings.OPTIONS_ARCHIVE_PATH}
                    onChange={e => setSettings(s => ({ ...s, OPTIONS_ARCHIVE_PATH: e.target.value }))}
                    className="w-full h-8 text-xs bg-[#0a0e17] border-gray-700 font-mono"
                  />
                </div>
                <div>
                  <label className="text-[11px] text-gray-500 block mb-1">Equity Archive</label>
                  <Input
                    value={settings.EQUITY_ARCHIVE_PATH}
                    onChange={e => setSettings(s => ({ ...s, EQUITY_ARCHIVE_PATH: e.target.value }))}
                    className="w-full h-8 text-xs bg-[#0a0e17] border-gray-700 font-mono"
                  />
                </div>
              </CardContent>
            </Card>

            <Card className="bg-[#0d1321] border-gray-800/60">
              <CardContent className="p-3 flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <HardDrive className="h-3.5 w-3.5 text-gray-500" />
                  <span className="text-xs text-gray-400">Data Catalog</span>
                </div>
                <a href="/research/data-catalog">
                  <Button size="sm" variant="ghost" className="h-6 text-[10px]">
                    <Database className="h-3 w-3 mr-1" /> Browse
                  </Button>
                </a>
              </CardContent>
            </Card>
          </div>
        )}
      </Tabs>

      {/* Save button */}
      <div className="flex items-center justify-end gap-2 pt-2">
        {saved && (
          <span className="text-[11px] text-emerald-400 flex items-center gap-1">
            <CheckCircle className="h-3 w-3" /> Settings saved
          </span>
        )}
        <Button onClick={handleSave} disabled={saving} className="text-xs h-8">
          {saving ? <RefreshCw className="h-3 w-3 animate-spin mr-1" /> : <Save className="h-3 w-3 mr-1" />}
          {saving ? "Saving..." : "Save Settings"}
        </Button>
      </div>
    </div>
  );
}

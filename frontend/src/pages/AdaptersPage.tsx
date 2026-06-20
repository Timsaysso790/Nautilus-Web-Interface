import { useEffect, useState } from 'react';
import { useNotification } from '@/contexts/NotificationContext';
import api from '@/lib/api';

interface Adapter {
  id: string;
  name: string;
  type: string;
  category: string;
  status: string;
  description: string;
  docs_url: string;
  supports_live: boolean;
  supports_backtest: boolean;
  credential_fields: string[];
}

interface AdapterState {
  connected: boolean;
  apiKey: string;
  apiSecret: string;
  username: string;
  password: string;
  totpSeed: string;
  endpoint: string;
  testnet: boolean;
}

const CATEGORY_COLORS: Record<string, string> = {
  Crypto: 'bg-yellow-100 text-yellow-700',
  'Stocks & Futures': 'bg-blue-100 text-blue-700',
  'Stocks & Options': 'bg-teal-100 text-teal-700',
  Data: 'bg-purple-100 text-purple-700',
  DeFi: 'bg-indigo-100 text-indigo-700',
  Betting: 'bg-pink-100 text-pink-700',
};

const CATEGORY_ICONS: Record<string, string> = {
  Crypto: '₿',
  'Stocks & Futures': '📈',
  'Stocks & Options': '🏦',
  Data: '🗄️',
  DeFi: '🔗',
  Betting: '🎰',
};

const BROKER_IDS = ['tastytrade', 'robinhood'];

export default function AdaptersPage() {
  const { success, info, error: notifyError } = useNotification();
  const [adapters, setAdapters] = useState<Adapter[]>([]);
  const [states, setStates] = useState<Record<string, AdapterState>>({});
  const [loading, setLoading] = useState(true);
  const [configOpen, setConfigOpen] = useState<string | null>(null);
  const [testing, setTesting] = useState<string | null>(null);
  const [filterCategory, setFilterCategory] = useState<string>('All');

  useEffect(() => {
    api.get<{ adapters: (Adapter & { status: string; has_credentials: boolean })[] }>('/api/adapters')
      .then(data => {
        const list = data.adapters ?? [];
        setAdapters(list);
        const initial: Record<string, AdapterState> = {};
        list.forEach(a => {
          const isBroker = BROKER_IDS.includes(a.id);
          initial[a.id] = {
            connected: a.status === 'connected',
            apiKey: !isBroker && (a as any).has_credentials ? '••••••••' : '',
            apiSecret: '',
            username: isBroker && (a as any).username_masked ? (a as any).username_masked : '',
            password: '',
            totpSeed: isBroker && (a as any).totp_seed_configured ? '••••••••' : '',
            endpoint: '',
            testnet: false,
          };
        });
        setStates(initial);
      })
      .catch(() => {
        notifyError('Could not load adapters from backend');
      })
      .finally(() => setLoading(false));
  }, []);

  const toggleConnect = async (adapter: Adapter) => {
    const current = states[adapter.id]?.connected ?? false;
    if (current) {
      // Disconnect
      info(`Disconnecting ${adapter.name}…`);
      try {
        await api.post(`/api/adapters/${adapter.id}/disconnect`, {});
        setStates(prev => ({ ...prev, [adapter.id]: { ...prev[adapter.id], connected: false } }));
        success(`${adapter.name} disconnected`);
      } catch {
        notifyError(`Failed to disconnect ${adapter.name}`);
      }
    } else {
      // If no credentials saved yet, open config panel instead
      const state = states[adapter.id];
      const hasSavedCreds = BROKER_IDS.includes(adapter.id)
        ? (state?.username && state.username !== '••••••••')
        : (state?.apiKey && state.apiKey !== '••••••••');
      if (!hasSavedCreds) {
        setConfigOpen(adapter.id);
        info(`Enter credentials for ${adapter.name} first`);
      } else {
        // Credentials already in form — connect directly
        await saveConfig(adapter.id);
      }
    }
  };

  const testConnection = async (adapter: Adapter) => {
    setTesting(adapter.id);
    info(`Testing ${adapter.name} connection…`);
    try {
      const res = await api.get<{ status: string }>(`/api/adapters/${adapter.id}`);
      if (res.status === 'connected') {
        success(`${adapter.name}: connection test passed`);
      } else {
        notifyError(`${adapter.name}: not connected – configure API keys first`);
      }
    } catch {
      notifyError(`${adapter.name}: test failed`);
    } finally {
      setTesting(null);
    }
  };

  const saveConfig = async (adapterId: string) => {
    const state = states[adapterId];
    const isBroker = BROKER_IDS.includes(adapterId);

    if (isBroker) {
      const username = state?.username || undefined;
      const password = state?.password || undefined;
      const totpSeed = state?.totpSeed || undefined;

      if (!username || !password) {
        notifyError('Enter username and password before connecting');
        return;
      }

      info('Connecting…');
      try {
        await api.post(`/api/adapters/${adapterId}/connect`, {
          username,
          password,
          totp_seed: totpSeed || null,
        });
        setStates(prev => ({
          ...prev,
          [adapterId]: { ...prev[adapterId], connected: true, username: '••••••••', password: '', totpSeed: state.totpSeed ? '••••••••' : '' },
        }));
        setConfigOpen(null);
        success('Adapter connected and credentials saved');
      } catch (err: unknown) {
        const msg = err instanceof Error ? err.message : 'Connection failed';
        notifyError(msg);
      }
      return;
    }

    const apiKey = state?.apiKey && state.apiKey !== '••••••••' ? state.apiKey : undefined;
    const apiSecret = state?.apiSecret || undefined;

    if (!apiKey && !apiSecret) {
      notifyError('Enter at least an API key before connecting');
      return;
    }

    info('Connecting…');
    try {
      await api.post(`/api/adapters/${adapterId}/connect`, {
        api_key: apiKey,
        api_secret: apiSecret || null,
      });
      setStates(prev => ({
        ...prev,
        [adapterId]: { ...prev[adapterId], connected: true, apiKey: '••••••••', apiSecret: '' },
      }));
      setConfigOpen(null);
      success('Adapter connected and credentials saved');
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Connection failed';
      notifyError(msg);
    }
  };

  const categories = ['All', ...Array.from(new Set(adapters.map(a => a.category)))];
  const filtered = filterCategory === 'All' ? adapters : adapters.filter(a => a.category === filterCategory);
  const connectedCount = Object.values(states).filter(s => s.connected).length;

  return (
    <div className="min-h-screen bg-background">

      {/* Header */}
      <header className="bg-card border-b border-border sticky top-0 z-10">
        <div className="max-w-7xl mx-auto px-6 py-4 flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-bold text-foreground">Adapters & Connections</h1>
            <p className="text-sm text-muted-foreground mt-0.5">
              {loading ? 'Loading…' : `${adapters.length} adapters available · ${connectedCount} connected`}
            </p>
          </div>
          <button
            onClick={() => window.location.href = '/admin'}
            className="px-4 py-2 border border-input rounded-lg text-sm text-muted-foreground hover:bg-accent"
          >
            ← Dashboard
          </button>
        </div>
      </header>

      <main className="max-w-7xl mx-auto px-6 py-8">

        {/* Stats row */}
        <div className="grid grid-cols-3 sm:grid-cols-5 gap-3 mb-6">
          {[
            { label: 'Total', value: adapters.length, color: 'text-foreground' },
            { label: 'Connected', value: connectedCount, color: 'text-green-600 dark:text-green-400' },
            { label: 'Live Trading', value: adapters.filter(a => a.supports_live).length, color: 'text-primary' },
            { label: 'Backtest', value: adapters.filter(a => a.supports_backtest).length, color: 'text-purple-600' },
            { label: 'Categories', value: categories.length - 1, color: 'text-muted-foreground' },
          ].map(s => (
            <div key={s.label} className="bg-card rounded-xl border border-border p-4 shadow-sm text-center">
              <div className={`text-2xl font-bold ${s.color}`}>{s.value}</div>
              <div className="text-xs text-muted-foreground mt-0.5">{s.label}</div>
            </div>
          ))}
        </div>

        {/* Category filter */}
        <div className="flex flex-wrap gap-2 mb-6">
          {categories.map(cat => (
            <button
              key={cat}
              onClick={() => setFilterCategory(cat)}
              className={`px-4 py-1.5 rounded-full text-sm font-medium transition-colors ${
                filterCategory === cat
                  ? 'bg-foreground text-background'
                  : 'bg-card border border-border text-muted-foreground hover:border-foreground/30'
              }`}
            >
              {cat !== 'All' && CATEGORY_ICONS[cat] ? `${CATEGORY_ICONS[cat]} ` : ''}{cat}
            </button>
          ))}
        </div>

        {loading && (
          <div className="text-center py-20 text-muted-foreground">Loading adapters…</div>
        )}

        {/* Adapter cards */}
        {!loading && (
          <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-5">
            {filtered.map(adapter => {
              const state = states[adapter.id] ?? { connected: false };
              const isConnected = state.connected;
              const isTesting = testing === adapter.id;
              return (
                <div key={adapter.id} className="bg-card rounded-2xl border border-border shadow-sm hover:shadow-md transition-shadow p-5 flex flex-col">

                  {/* Card header */}
                  <div className="flex items-start justify-between mb-3">
                    <div>
                      <h3 className="font-bold text-foreground text-base">{adapter.name}</h3>
                      <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${CATEGORY_COLORS[adapter.category] ?? 'bg-muted text-muted-foreground'}`}>
                        {adapter.category}
                      </span>
                    </div>
                    <div className="flex flex-col items-end gap-1">
                      <span className={`text-xs px-2.5 py-1 rounded-full font-semibold flex items-center gap-1 ${
                        isConnected ? 'bg-green-100 text-green-700' : 'bg-muted text-muted-foreground'
                      }`}>
                        <span className={`w-1.5 h-1.5 rounded-full ${isConnected ? 'bg-green-500' : 'bg-muted-foreground/50'}`} />
                        {isConnected ? 'Connected' : 'Offline'}
                      </span>
                    </div>
                  </div>

                  <p className="text-xs text-muted-foreground mb-3 flex-1">{adapter.description}</p>

                  {/* Capabilities */}
                  <div className="flex gap-2 mb-4">
                    <span className={`text-xs px-2 py-0.5 rounded font-medium ${adapter.supports_live ? 'bg-primary/10 text-primary' : 'bg-muted/50 text-muted-foreground line-through'}`}>
                      Live
                    </span>
                    <span className={`text-xs px-2 py-0.5 rounded font-medium ${adapter.supports_backtest ? 'bg-purple-50 text-purple-600 dark:bg-purple-900/30 dark:text-purple-400' : 'bg-muted/50 text-muted-foreground line-through'}`}>
                      Backtest
                    </span>
                    <a
                      href={adapter.docs_url}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="ml-auto text-xs text-cyan-600 hover:underline"
                    >
                      Docs ↗
                    </a>
                  </div>

                  {/* Actions */}
                  <div className="flex gap-2">
                    <button
                      onClick={() => void toggleConnect(adapter)}
                      className={`flex-1 py-1.5 rounded-lg text-xs font-semibold transition-colors ${
                        isConnected
                          ? 'bg-destructive/10 text-destructive hover:bg-destructive/20 border border-destructive/30'
                          : 'bg-green-50 text-green-700 hover:bg-green-100 border border-green-200'
                      }`}
                    >
                      {isConnected ? 'Disconnect' : 'Connect'}
                    </button>
                    <button
                      onClick={() => void testConnection(adapter)}
                      disabled={isTesting}
                      className="flex-1 py-1.5 rounded-lg text-xs font-semibold bg-card border border-border text-muted-foreground hover:bg-muted/50 disabled:opacity-50"
                    >
                      {isTesting ? 'Testing…' : 'Test'}
                    </button>
                    <button
                      onClick={() => setConfigOpen(configOpen === adapter.id ? null : adapter.id)}
                      className="px-3 py-1.5 rounded-lg text-xs font-semibold bg-card border border-border text-muted-foreground hover:bg-muted/50"
                    >
                      ⚙
                    </button>
                  </div>

                  {/* Inline config panel */}
                  {configOpen === adapter.id && (
                    <div className="mt-4 pt-4 border-t border-border/50 space-y-2">
                      {BROKER_IDS.includes(adapter.id) ? (
                        <>
                          <div>
                            <label className="block text-xs font-semibold text-muted-foreground mb-1">Username</label>
                            <input
                              type="text"
                              placeholder="your@email.com"
                              value={states[adapter.id]?.username ?? ''}
                              onChange={e => setStates(prev => ({ ...prev, [adapter.id]: { ...prev[adapter.id], username: e.target.value } }))}
                              className="w-full px-3 py-1.5 border border-input rounded-lg text-xs focus:outline-none focus:border-cyan-400"
                            />
                          </div>
                          <div>
                            <label className="block text-xs font-semibold text-muted-foreground mb-1">Password</label>
                            <input
                              type="password"
                              placeholder="••••••••"
                              value={states[adapter.id]?.password ?? ''}
                              onChange={e => setStates(prev => ({ ...prev, [adapter.id]: { ...prev[adapter.id], password: e.target.value } }))}
                              className="w-full px-3 py-1.5 border border-input rounded-lg text-xs focus:outline-none focus:border-cyan-400"
                            />
                          </div>
                          {adapter.id === 'robinhood' && (
                            <div>
                              <label className="block text-xs font-semibold text-muted-foreground mb-1">TOTP MFA Seed</label>
                              <input
                                type="password"
                                placeholder="Base32 secret from Robinhood 2FA setup"
                                value={states[adapter.id]?.totpSeed ?? ''}
                                onChange={e => setStates(prev => ({ ...prev, [adapter.id]: { ...prev[adapter.id], totpSeed: e.target.value } }))}
                                className="w-full px-3 py-1.5 border border-input rounded-lg text-xs focus:outline-none focus:border-cyan-400"
                              />
                              <p className="text-xs text-muted-foreground mt-1">Required for Robinhood login. Generate in Robinhood Security → 2FA → Set up Authenticator App.</p>
                            </div>
                          )}
                          <button
                            onClick={() => void saveConfig(adapter.id)}
                            className="w-full py-1.5 bg-cyan-600 text-white rounded-lg text-xs font-semibold hover:bg-cyan-700"
                          >
                            Connect &amp; Save
                          </button>
                        </>
                      ) : (
                        <>
                          <div>
                            <label className="block text-xs font-semibold text-muted-foreground mb-1">API Key</label>
                            <input
                              type="password"
                              placeholder="••••••••••••••••"
                              value={states[adapter.id]?.apiKey ?? ''}
                              onChange={e => setStates(prev => ({ ...prev, [adapter.id]: { ...prev[adapter.id], apiKey: e.target.value } }))}
                              className="w-full px-3 py-1.5 border border-input rounded-lg text-xs focus:outline-none focus:border-cyan-400"
                            />
                          </div>
                          <div>
                            <label className="block text-xs font-semibold text-muted-foreground mb-1">API Secret</label>
                            <input
                              type="password"
                              placeholder="••••••••••••••••"
                              value={states[adapter.id]?.apiSecret ?? ''}
                              onChange={e => setStates(prev => ({ ...prev, [adapter.id]: { ...prev[adapter.id], apiSecret: e.target.value } }))}
                              className="w-full px-3 py-1.5 border border-input rounded-lg text-xs focus:outline-none focus:border-cyan-400"
                            />
                          </div>
                          <div className="flex items-center gap-2">
                            <input
                              type="checkbox"
                              id={`testnet-${adapter.id}`}
                              checked={states[adapter.id]?.testnet ?? false}
                              onChange={e => setStates(prev => ({ ...prev, [adapter.id]: { ...prev[adapter.id], testnet: e.target.checked } }))}
                              className="rounded"
                            />
                            <label htmlFor={`testnet-${adapter.id}`} className="text-xs text-muted-foreground">Use testnet/paper trading</label>
                          </div>
                          <button
                            onClick={() => void saveConfig(adapter.id)}
                            className="w-full py-1.5 bg-cyan-600 text-white rounded-lg text-xs font-semibold hover:bg-cyan-700"
                          >
                            Connect &amp; Save
                          </button>
                        </>
                      )}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </main>
    </div>
  );
}

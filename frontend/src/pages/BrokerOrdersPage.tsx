import { useEffect, useState } from 'react';
import { useNotification } from '@/contexts/NotificationContext';
import { brokerService, type BrokerOrder, type BrokerOrderSubmitRequest } from '@/services/brokerService';
import api from '@/lib/api';

interface AdapterBrief {
  id: string;
  name: string;
  status: string;
}

export default function BrokerOrdersPage() {
  const { success, info, error: notifyError } = useNotification();
  const [adapters, setAdapters] = useState<AdapterBrief[]>([]);
  const [orders, setOrders] = useState<BrokerOrder[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedAdapter, setSelectedAdapter] = useState<string>('all');
  const [showSubmit, setShowSubmit] = useState(false);

  const [form, setForm] = useState<BrokerOrderSubmitRequest>({
    adapter_id: '',
    instrument: '',
    side: 'BUY',
    quantity: 1,
    order_type: 'MARKET',
    price: null,
  });

  const fetchAdapters = async () => {
    try {
      const res = await api.get<{ adapters: any[] }>('/api/adapters');
      const connected = res.adapters
        .filter(a => a.status === 'connected' && (a.id === 'tastytrade' || a.id === 'robinhood'))
        .map(a => ({ id: a.id, name: a.name, status: a.status }));
      setAdapters(connected);
    } catch { /* ignore */ }
  };

  const fetchOrders = async (adapterId?: string) => {
    setLoading(true);
    try {
      const res = await brokerService.listOrders(adapterId === 'all' ? undefined : adapterId);
      setOrders(res.orders);
    } catch {
      notifyError('Failed to fetch orders');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void fetchAdapters();
  }, []);

  useEffect(() => {
    void fetchOrders(selectedAdapter);
  }, [selectedAdapter]);

  const handleSubmit = async () => {
    if (!form.adapter_id || !form.instrument || form.quantity < 1) {
      notifyError('Fill in adapter, instrument, and quantity');
      return;
    }
    if (form.order_type === 'LIMIT' && (!form.price || form.price <= 0)) {
      notifyError('Limit orders require a valid price');
      return;
    }
    info('Submitting order…');
    try {
      const res = await brokerService.submitOrder(form);
      if (res.success) {
        success(`Order submitted: ${res.order_id}`);
        setShowSubmit(false);
        setForm({ adapter_id: selectedAdapter === 'all' ? '' : selectedAdapter, instrument: '', side: 'BUY', quantity: 1, order_type: 'MARKET', price: null });
        void fetchOrders(selectedAdapter);
      }
    } catch (err: unknown) {
      notifyError(err instanceof Error ? err.message : 'Order submission failed');
    }
  };

  const adapterNames = adapters.reduce<Record<string, string>>((acc, a) => {
    acc[a.id] = a.name;
    return acc;
  }, {});

  return (
    <div className="min-h-screen bg-background">
      <header className="bg-card border-b border-border sticky top-0 z-10">
        <div className="max-w-7xl mx-auto px-6 py-4 flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-bold text-foreground">Broker Orders</h1>
            <p className="text-sm text-muted-foreground mt-0.5">
              {loading ? 'Loading…' : `${orders.length} orders`}
            </p>
          </div>
          <div className="flex gap-3">
            <button
              onClick={() => setShowSubmit(!showSubmit)}
              className="px-4 py-2 bg-primary text-primary-foreground rounded-lg text-sm font-semibold hover:opacity-90"
            >
              + New Order
            </button>
            <button
              onClick={() => window.location.href = '/trader'}
              className="px-4 py-2 border border-input rounded-lg text-sm text-muted-foreground hover:bg-accent"
            >
              ← Dashboard
            </button>
          </div>
        </div>
      </header>

      <main className="max-w-7xl mx-auto px-6 py-8 space-y-6">

        {/* Adapter filter */}
        <div className="flex flex-wrap gap-2">
          <button
            onClick={() => setSelectedAdapter('all')}
            className={`px-4 py-1.5 rounded-full text-sm font-medium transition-colors ${
              selectedAdapter === 'all'
                ? 'bg-foreground text-background'
                : 'bg-card border border-border text-muted-foreground hover:border-foreground/30'
            }`}
          >
            All Brokers
          </button>
          {adapters.map(a => (
            <button
              key={a.id}
              onClick={() => setSelectedAdapter(a.id)}
              className={`px-4 py-1.5 rounded-full text-sm font-medium transition-colors ${
                selectedAdapter === a.id
                  ? 'bg-foreground text-background'
                  : 'bg-card border border-border text-muted-foreground hover:border-foreground/30'
              }`}
            >
              {a.name}
            </button>
          ))}
        </div>

        {/* Submit order panel */}
        {showSubmit && (
          <div className="bg-card rounded-2xl border border-border p-6 space-y-4">
            <h2 className="font-bold text-foreground">New Order</h2>
            <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-4">
              <div>
                <label className="block text-xs font-semibold text-muted-foreground mb-1">Broker</label>
                <select
                  value={form.adapter_id}
                  onChange={e => setForm(f => ({ ...f, adapter_id: e.target.value }))}
                  className="w-full px-3 py-1.5 border border-input rounded-lg text-sm bg-background"
                >
                  <option value="">Select broker…</option>
                  {adapters.map(a => (
                    <option key={a.id} value={a.id}>{a.name}</option>
                  ))}
                </select>
              </div>
              <div>
                <label className="block text-xs font-semibold text-muted-foreground mb-1">Instrument</label>
                <input
                  type="text"
                  placeholder="e.g. AAPL"
                  value={form.instrument}
                  onChange={e => setForm(f => ({ ...f, instrument: e.target.value.toUpperCase() }))}
                  className="w-full px-3 py-1.5 border border-input rounded-lg text-sm bg-background"
                />
              </div>
              <div>
                <label className="block text-xs font-semibold text-muted-foreground mb-1">Side</label>
                <select
                  value={form.side}
                  onChange={e => setForm(f => ({ ...f, side: e.target.value }))}
                  className="w-full px-3 py-1.5 border border-input rounded-lg text-sm bg-background"
                >
                  <option value="BUY">BUY</option>
                  <option value="SELL">SELL</option>
                </select>
              </div>
              <div>
                <label className="block text-xs font-semibold text-muted-foreground mb-1">Quantity</label>
                <input
                  type="number"
                  min={1}
                  value={form.quantity}
                  onChange={e => setForm(f => ({ ...f, quantity: parseInt(e.target.value) || 1 }))}
                  className="w-full px-3 py-1.5 border border-input rounded-lg text-sm bg-background"
                />
              </div>
              <div>
                <label className="block text-xs font-semibold text-muted-foreground mb-1">Order Type</label>
                <select
                  value={form.order_type}
                  onChange={e => setForm(f => ({ ...f, order_type: e.target.value }))}
                  className="w-full px-3 py-1.5 border border-input rounded-lg text-sm bg-background"
                >
                  <option value="MARKET">Market</option>
                  <option value="LIMIT">Limit</option>
                </select>
              </div>
              {form.order_type === 'LIMIT' && (
                <div>
                  <label className="block text-xs font-semibold text-muted-foreground mb-1">Limit Price</label>
                  <input
                    type="number"
                    step="0.01"
                    min={0.01}
                    value={form.price ?? ''}
                    onChange={e => setForm(f => ({ ...f, price: parseFloat(e.target.value) || null }))}
                    className="w-full px-3 py-1.5 border border-input rounded-lg text-sm bg-background"
                  />
                </div>
              )}
            </div>
            <div className="flex justify-end gap-3">
              <button
                onClick={() => setShowSubmit(false)}
                className="px-4 py-2 border border-input rounded-lg text-sm text-muted-foreground"
              >
                Cancel
              </button>
              <button
                onClick={() => void handleSubmit()}
                className="px-4 py-2 bg-primary text-primary-foreground rounded-lg text-sm font-semibold hover:opacity-90"
              >
                Submit Order
              </button>
            </div>
          </div>
        )}

        {/* Orders table */}
        {loading ? (
          <div className="text-center py-20 text-muted-foreground">Loading orders…</div>
        ) : orders.length === 0 ? (
          <div className="text-center py-20 text-muted-foreground">
            {adapters.length === 0
              ? 'No broker adapters connected. Go to Adapters to connect Tastytrade or Robinhood.'
              : 'No orders found. Submit a new order to get started.'}
          </div>
        ) : (
          <div className="bg-card rounded-2xl border border-border overflow-hidden">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-border bg-muted/30">
                  <th className="text-left px-4 py-3 font-semibold text-muted-foreground">ID</th>
                  <th className="text-left px-4 py-3 font-semibold text-muted-foreground">Broker</th>
                  <th className="text-left px-4 py-3 font-semibold text-muted-foreground">Instrument</th>
                  <th className="text-left px-4 py-3 font-semibold text-muted-foreground">Side</th>
                  <th className="text-right px-4 py-3 font-semibold text-muted-foreground">Qty</th>
                  <th className="text-right px-4 py-3 font-semibold text-muted-foreground">Price</th>
                  <th className="text-left px-4 py-3 font-semibold text-muted-foreground">Type</th>
                  <th className="text-left px-4 py-3 font-semibold text-muted-foreground">Status</th>
                </tr>
              </thead>
              <tbody>
                {orders.map((o, i) => (
                  <tr key={o.id || i} className="border-b border-border/50 hover:bg-muted/20">
                    <td className="px-4 py-3 font-mono text-xs text-muted-foreground">{o.id.slice(0, 12)}…</td>
                    <td className="px-4 py-3 text-foreground">{adapterNames[o.adapter_id] || o.adapter_id}</td>
                    <td className="px-4 py-3 font-semibold text-foreground">{o.instrument}</td>
                    <td className="px-4 py-3">
                      <span className={`text-xs font-semibold ${o.side === 'BUY' ? 'text-green-600' : 'text-red-600'}`}>
                        {o.side}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-right text-foreground">{o.quantity}</td>
                    <td className="px-4 py-3 text-right text-muted-foreground">{o.price ? `$${o.price.toFixed(2)}` : '—'}</td>
                    <td className="px-4 py-3 text-muted-foreground">{o.type}</td>
                    <td className="px-4 py-3">
                      <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${
                        o.status === 'filled' || o.status === 'confirmed'
                          ? 'bg-green-100 text-green-700'
                          : o.status === 'cancelled' || o.status === 'rejected'
                          ? 'bg-red-100 text-red-700'
                          : 'bg-yellow-100 text-yellow-700'
                      }`}>
                        {o.status}
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </main>
    </div>
  );
}

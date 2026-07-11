import { useEffect, useState } from 'react';
import { useNotification } from '@/contexts/NotificationContext';
import { brokerService, type BrokerOrder, type BrokerOrderSubmitRequest } from '@/services/brokerService';
import api from '@/lib/api';
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
  Table,
  TableHeader,
  TableBody,
  TableRow,
  TableHead,
  TableCell,
} from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Plus } from "lucide-react";

interface AdapterBrief {
  id: string;
  name: string;
  status: string;
}

function statusVariant(status: string) {
  if (status === 'filled' || status === 'confirmed') return 'default' as const;
  if (status === 'cancelled' || status === 'rejected') return 'destructive' as const;
  return 'secondary' as const;
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
    <AppLayout
      title="Broker Orders"
      subtitle={loading ? 'Loading...' : `${orders.length} orders`}
      actions={
        <Button onClick={() => setShowSubmit(!showSubmit)} size="sm">
          <Plus className="h-4 w-4 mr-1" />
          New Order
        </Button>
      }
    >
      <div className="flex flex-wrap gap-2 mb-6">
        <button
          onClick={() => setSelectedAdapter('all')}
          className={`px-3 py-1.5 rounded-full text-sm font-medium transition-colors ${
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
            className={`px-3 py-1.5 rounded-full text-sm font-medium transition-colors ${
              selectedAdapter === a.id
                ? 'bg-foreground text-background'
                : 'bg-card border border-border text-muted-foreground hover:border-foreground/30'
            }`}
          >
            {a.name}
          </button>
        ))}
      </div>

      {showSubmit && (
        <div className="border border-border rounded-lg p-5 mb-6 space-y-4">
          <h2 className="text-sm font-semibold text-foreground">New Order</h2>
          <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-4">
            <div>
              <label className="block text-xs font-medium text-muted-foreground mb-1">Broker</label>
              <Select
                value={form.adapter_id}
                onValueChange={v => setForm(f => ({ ...f, adapter_id: v }))}
              >
                <SelectTrigger><SelectValue placeholder="Select broker..." /></SelectTrigger>
                <SelectContent>
                  {adapters.map(a => (
                    <SelectItem key={a.id} value={a.id}>{a.name}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div>
              <label className="block text-xs font-medium text-muted-foreground mb-1">Instrument</label>
              <Input
                placeholder="e.g. AAPL"
                value={form.instrument}
                onChange={e => setForm(f => ({ ...f, instrument: e.target.value.toUpperCase() }))}
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-muted-foreground mb-1">Side</label>
              <Select
                value={form.side}
                onValueChange={v => setForm(f => ({ ...f, side: v }))}
              >
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="BUY">BUY</SelectItem>
                  <SelectItem value="SELL">SELL</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div>
              <label className="block text-xs font-medium text-muted-foreground mb-1">Quantity</label>
              <Input
                type="number"
                min={1}
                value={form.quantity}
                onChange={e => setForm(f => ({ ...f, quantity: parseInt(e.target.value) || 1 }))}
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-muted-foreground mb-1">Order Type</label>
              <Select
                value={form.order_type}
                onValueChange={v => setForm(f => ({ ...f, order_type: v }))}
              >
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="MARKET">Market</SelectItem>
                  <SelectItem value="LIMIT">Limit</SelectItem>
                </SelectContent>
              </Select>
            </div>
            {form.order_type === 'LIMIT' && (
              <div>
                <label className="block text-xs font-medium text-muted-foreground mb-1">Limit Price</label>
                <Input
                  type="number"
                  step="0.01"
                  min={0.01}
                  value={form.price ?? ''}
                  onChange={e => setForm(f => ({ ...f, price: parseFloat(e.target.value) || null }))}
                />
              </div>
            )}
          </div>
          <div className="flex justify-end gap-3">
            <Button variant="outline" onClick={() => setShowSubmit(false)}>Cancel</Button>
            <Button onClick={() => void handleSubmit()}>Submit Order</Button>
          </div>
        </div>
      )}

      {loading ? (
        <div className="text-center py-20 text-muted-foreground">Loading orders...</div>
      ) : orders.length === 0 ? (
        <div className="text-center py-20 text-muted-foreground">
          {adapters.length === 0
            ? 'No broker adapters connected. Go to Adapters to connect Tastytrade or Robinhood.'
            : 'No orders found. Submit a new order to get started.'}
        </div>
      ) : (
        <div className="border border-border rounded-lg overflow-hidden">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>ID</TableHead>
                <TableHead>Broker</TableHead>
                <TableHead>Instrument</TableHead>
                <TableHead>Side</TableHead>
                <TableHead className="text-right">Qty</TableHead>
                <TableHead className="text-right">Price</TableHead>
                <TableHead>Type</TableHead>
                <TableHead>Status</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {orders.map((o, i) => (
                <TableRow key={o.id || i}>
                  <TableCell className="tabular-mono text-xs text-muted-foreground">{o.id.slice(0, 12)}…</TableCell>
                  <TableCell>{adapterNames[o.adapter_id] || o.adapter_id}</TableCell>
                  <TableCell className="font-medium">{o.instrument}</TableCell>
                  <TableCell>
                    <span className={`tabular-mono text-xs font-semibold ${o.side === 'BUY' ? 'text-profit' : 'text-loss'}`}>
                      {o.side}
                    </span>
                  </TableCell>
                  <TableCell className="tabular-mono text-right">{o.quantity}</TableCell>
                  <TableCell className="tabular-mono text-right text-muted-foreground">
                    {o.price ? `$${o.price.toFixed(2)}` : '—'}
                  </TableCell>
                  <TableCell className="text-muted-foreground">{o.type}</TableCell>
                  <TableCell>
                    <Badge variant={statusVariant(o.status)} className="tabular-mono">
                      {o.status}
                    </Badge>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      )}
    </AppLayout>
  );
}

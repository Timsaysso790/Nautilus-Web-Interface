import React, { useState, useEffect, useRef } from 'react';
import api from '../lib/api';
import { useWebSocket } from '../hooks/useWebSocket';
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
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import { Badge } from "@/components/ui/badge";
import { Plus, ClipboardList } from "lucide-react";

interface Order {
  id: string;
  instrument: string;
  side: 'BUY' | 'SELL';
  type: 'MARKET' | 'LIMIT' | 'STOP';
  quantity: number;
  price?: number;
  status: 'PENDING' | 'FILLED' | 'CANCELLED' | 'REJECTED';
  filled_qty: number;
  timestamp: string;
}

export default function OrdersPage() {
  const [orders, setOrders] = useState<Order[]>([]);
  const [loading, setLoading] = useState(true);
  const [fetchError, setFetchError] = useState<string | null>(null);
  const [orderError, setOrderError] = useState<string | null>(null);
  const [showNewOrderModal, setShowNewOrderModal] = useState(false);
  const [newOrder, setNewOrder] = useState({
    instrument: 'BTCUSDT',
    side: 'BUY' as 'BUY' | 'SELL',
    type: 'LIMIT' as 'MARKET' | 'LIMIT' | 'STOP',
    quantity: 0.001,
    price: 0
  });
  const { lastMessage } = useWebSocket();
  const prevMessageRef = useRef(lastMessage);

  useEffect(() => {
    fetchOrders();
  }, []);

  useEffect(() => {
    if (lastMessage && lastMessage !== prevMessageRef.current) {
      prevMessageRef.current = lastMessage;
      if (lastMessage.type === 'live_data') {
        fetchOrders();
      }
    }
  }, [lastMessage]);

  const fetchOrders = async () => {
    try {
      const data = await api.get<{ orders: Order[] }>('/api/orders');
      setOrders(data.orders || []);
      setFetchError(null);
    } catch (error) {
      setFetchError(error instanceof Error ? error.message : 'Failed to load orders');
    } finally {
      setLoading(false);
    }
  };

  const handleCreateOrder = async () => {
    if (newOrder.quantity <= 0) {
      setOrderError('Quantity must be greater than 0');
      return;
    }
    setOrderError(null);
    try {
      await api.post('/api/orders', newOrder);
      setShowNewOrderModal(false);
      setNewOrder({ instrument: 'BTCUSDT', side: 'BUY', type: 'LIMIT', quantity: 0.001, price: 0 });
      fetchOrders();
    } catch (error) {
      setOrderError(error instanceof Error ? error.message : 'Failed to create order');
    }
  };

  const handleCancelOrder = async (orderId: string) => {
    if (!confirm('Cancel this order?')) return;
    try {
      await api.delete(`/api/orders/${orderId}`);
      fetchOrders();
    } catch (error) {
      setFetchError(error instanceof Error ? error.message : 'Failed to cancel order');
    }
  };

  const statusVariant = (status: string) => {
    switch (status) {
      case 'FILLED': return 'default' as const;
      case 'PENDING': return 'secondary' as const;
      case 'CANCELLED': return 'outline' as const;
      case 'REJECTED': return 'destructive' as const;
      default: return 'secondary' as const;
    }
  };

  if (loading) {
    return (
      <AppLayout title="Orders" subtitle="Monitor and manage your trading orders">
        <div className="text-center text-muted-foreground py-12">Loading orders...</div>
      </AppLayout>
    );
  }

  return (
    <AppLayout
      title="Orders"
      subtitle="Monitor and manage your trading orders"
      actions={
        <Button onClick={() => setShowNewOrderModal(true)} size="sm">
          <Plus className="h-4 w-4 mr-1" />
          New Order
        </Button>
      }
    >
      {fetchError && (
        <div className="mb-4 bg-loss-bg border border-loss/30 text-loss rounded-lg px-4 py-3 text-sm">
          {fetchError}
        </div>
      )}

      {orders.length === 0 ? (
        <div className="max-w-md mx-auto mt-12 text-center">
          <ClipboardList className="h-12 w-12 text-muted-foreground mx-auto mb-4" />
          <h3 className="text-lg font-semibold text-foreground mb-2">No Orders Yet</h3>
          <p className="text-sm text-muted-foreground mb-6">Create your first order to start trading</p>
          <Button onClick={() => setShowNewOrderModal(true)}>
            <Plus className="h-4 w-4 mr-1" />
            New Order
          </Button>
        </div>
      ) : (
        <div className="border border-border rounded-lg overflow-hidden">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Order ID</TableHead>
                <TableHead>Instrument</TableHead>
                <TableHead>Side</TableHead>
                <TableHead>Type</TableHead>
                <TableHead className="text-right">Quantity</TableHead>
                <TableHead className="text-right">Price</TableHead>
                <TableHead className="text-right">Filled</TableHead>
                <TableHead className="text-center">Status</TableHead>
                <TableHead className="text-center">Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {orders.map((order) => (
                <TableRow key={order.id}>
                  <TableCell className="tabular-mono text-xs">{order.id}</TableCell>
                  <TableCell className="font-medium">{order.instrument}</TableCell>
                  <TableCell>
                    <span className={`tabular-mono text-sm font-semibold ${
                      order.side === 'BUY' ? 'text-profit' : 'text-loss'
                    }`}>
                      {order.side}
                    </span>
                  </TableCell>
                  <TableCell className="text-muted-foreground">{order.type}</TableCell>
                  <TableCell className="tabular-mono text-right">{order.quantity}</TableCell>
                  <TableCell className="tabular-mono text-right">
                    {order.price ? `$${order.price.toFixed(2)}` : '-'}
                  </TableCell>
                  <TableCell className="tabular-mono text-right text-muted-foreground">
                    {order.filled_qty} / {order.quantity}
                  </TableCell>
                  <TableCell className="text-center">
                    <Badge variant={statusVariant(order.status)} className="tabular-mono">
                      {order.status}
                    </Badge>
                  </TableCell>
                  <TableCell className="text-center">
                    {order.status === 'PENDING' && (
                      <Button
                        onClick={() => handleCancelOrder(order.id)}
                        variant="destructive"
                        size="sm"
                      >
                        Cancel
                      </Button>
                    )}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      )}

      <Dialog open={showNewOrderModal} onOpenChange={setShowNewOrderModal}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Create New Order</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 py-2">
            <div>
              <label className="block text-sm font-medium text-foreground mb-1.5">Instrument</label>
              <Input
                value={newOrder.instrument}
                onChange={(e) => setNewOrder({ ...newOrder, instrument: e.target.value })}
                placeholder="BTCUSDT"
              />
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="block text-sm font-medium text-foreground mb-1.5">Side</label>
                <Select
                  value={newOrder.side}
                  onValueChange={(value: 'BUY' | 'SELL') => setNewOrder({ ...newOrder, side: value })}
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="BUY">BUY</SelectItem>
                    <SelectItem value="SELL">SELL</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div>
                <label className="block text-sm font-medium text-foreground mb-1.5">Type</label>
                <Select
                  value={newOrder.type}
                  onValueChange={(value: 'MARKET' | 'LIMIT' | 'STOP') => setNewOrder({ ...newOrder, type: value })}
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="MARKET">MARKET</SelectItem>
                    <SelectItem value="LIMIT">LIMIT</SelectItem>
                    <SelectItem value="STOP">STOP</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>
            <div>
              <label className="block text-sm font-medium text-foreground mb-1.5">Quantity</label>
              <Input
                type="number"
                step="0.001"
                value={newOrder.quantity}
                onChange={(e) => setNewOrder({ ...newOrder, quantity: parseFloat(e.target.value) })}
              />
            </div>
            {newOrder.type !== 'MARKET' && (
              <div>
                <label className="block text-sm font-medium text-foreground mb-1.5">Price</label>
                <Input
                  type="number"
                  step="0.01"
                  value={newOrder.price}
                  onChange={(e) => setNewOrder({ ...newOrder, price: parseFloat(e.target.value) })}
                />
              </div>
            )}
          </div>
          {orderError && (
            <div className="bg-loss-bg border border-loss/30 text-loss rounded-lg px-3 py-2 text-sm">
              {orderError}
            </div>
          )}
          <DialogFooter>
            <Button variant="outline" onClick={() => { setShowNewOrderModal(false); setOrderError(null); }}>
              Cancel
            </Button>
            <Button onClick={handleCreateOrder}>
              Create Order
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </AppLayout>
  );
}

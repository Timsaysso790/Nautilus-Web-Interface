import React, { useState, useEffect, useRef } from 'react';
import api from '../lib/api';
import { useWebSocket } from '../hooks/useWebSocket';

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

  // Refresh on live_data WebSocket push instead of polling
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

  const getStatusColor = (status: string) => {
    switch (status) {
      case 'FILLED': return 'bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-400';
      case 'PENDING': return 'bg-yellow-100 text-yellow-800 dark:bg-yellow-900/30 dark:text-yellow-400';
      case 'CANCELLED': return 'bg-muted text-foreground';
      case 'REJECTED': return 'bg-red-100 text-red-800 dark:bg-red-900/30 dark:text-red-400';
      default: return 'bg-primary/10 text-primary';
    }
  };

  const getSideColor = (side: string) => {
    return side === 'BUY' ? 'text-green-600 dark:text-green-400' : 'text-red-600 dark:text-red-400';
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-background p-8">
        <div className="text-center">Loading orders...</div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background p-8">
      <div className="max-w-7xl mx-auto">
        {fetchError && (
          <div className="mb-4 bg-destructive/10 border border-destructive/30 text-destructive rounded-lg px-4 py-3 text-sm">
            {fetchError}
          </div>
        )}
        {/* Header */}
        <div className="flex justify-between items-center mb-8">
          <div>
            <h1 className="text-4xl font-bold text-foreground mb-2">📋 Order Management</h1>
            <p className="text-muted-foreground">Monitor and manage your trading orders</p>
          </div>
          <div className="flex gap-4">
            <button
              onClick={() => window.location.href = '/trader'}
              className="px-6 py-3 bg-card border-2 border-input text-foreground rounded-lg hover:bg-muted/50 transition-all font-semibold"
            >
              ← Back to Dashboard
            </button>
            <button
              onClick={() => setShowNewOrderModal(true)}
              className="px-6 py-3 bg-primary text-primary-foreground rounded-lg hover:bg-primary/90 transition-all font-semibold"
            >
              + New Order
            </button>
          </div>
        </div>

        {/* Orders Table */}
        {orders.length === 0 ? (
          <div className="bg-card rounded-xl shadow-sm border p-12 text-center">
            <div className="text-6xl mb-4">📋</div>
            <h3 className="text-2xl font-bold text-foreground mb-2">No Orders Yet</h3>
            <p className="text-muted-foreground mb-6">Create your first order to start trading</p>
            <button
              onClick={() => setShowNewOrderModal(true)}
              className="px-6 py-3 bg-primary text-primary-foreground rounded-lg hover:bg-primary/90 transition-all font-semibold"
            >
              + New Order
            </button>
          </div>
        ) : (
          <div className="bg-card rounded-xl border overflow-hidden">
            <div className="overflow-x-auto">
              <table className="w-full">
                <thead className="bg-muted/50 border-b border-border">
                  <tr>
                    <th className="px-6 py-4 text-left text-xs font-semibold text-muted-foreground uppercase">Order ID</th>
                    <th className="px-6 py-4 text-left text-xs font-semibold text-muted-foreground uppercase">Instrument</th>
                    <th className="px-6 py-4 text-left text-xs font-semibold text-muted-foreground uppercase">Side</th>
                    <th className="px-6 py-4 text-left text-xs font-semibold text-muted-foreground uppercase">Type</th>
                    <th className="px-6 py-4 text-right text-xs font-semibold text-muted-foreground uppercase">Quantity</th>
                    <th className="px-6 py-4 text-right text-xs font-semibold text-muted-foreground uppercase">Price</th>
                    <th className="px-6 py-4 text-right text-xs font-semibold text-muted-foreground uppercase">Filled</th>
                    <th className="px-6 py-4 text-center text-xs font-semibold text-muted-foreground uppercase">Status</th>
                    <th className="px-6 py-4 text-center text-xs font-semibold text-muted-foreground uppercase">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-border">
                  {orders.map((order) => (
                    <tr key={order.id} className="hover:bg-muted/50 transition-colors">
                      <td className="px-6 py-4 text-sm font-mono text-foreground">{order.id}</td>
                      <td className="px-6 py-4 text-sm font-semibold text-foreground">{order.instrument}</td>
                      <td className="px-6 py-4 text-sm">
                        <span className={`font-bold ${getSideColor(order.side)}`}>{order.side}</span>
                      </td>
                      <td className="px-6 py-4 text-sm text-muted-foreground">{order.type}</td>
                      <td className="px-6 py-4 text-sm text-right text-foreground">{order.quantity}</td>
                      <td className="px-6 py-4 text-sm text-right text-foreground">
                        {order.price ? `$${order.price.toFixed(2)}` : '-'}
                      </td>
                      <td className="px-6 py-4 text-sm text-right text-muted-foreground">
                        {order.filled_qty} / {order.quantity}
                      </td>
                      <td className="px-6 py-4 text-center">
                        <span className={`px-3 py-1 rounded-full text-xs font-semibold ${getStatusColor(order.status)}`}>
                          {order.status}
                        </span>
                      </td>
                      <td className="px-6 py-4 text-center">
                        {order.status === 'PENDING' && (
                          <button
                            onClick={() => handleCancelOrder(order.id)}
                            className="px-3 py-1 bg-destructive text-destructive-foreground rounded hover:bg-destructive/90 transition-all text-xs font-semibold"
                          >
                            Cancel
                          </button>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}

        {/* New Order Modal */}
        {showNewOrderModal && (
          <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
            <div className="bg-card rounded-xl shadow-2xl p-8 max-w-md w-full">
              <h2 className="text-2xl font-bold text-foreground mb-6">Create New Order</h2>
              
              <div className="space-y-4">
                <div>
                  <label className="block text-sm font-semibold text-foreground mb-2">Instrument</label>
                  <input
                    type="text"
                    value={newOrder.instrument}
                    onChange={(e) => setNewOrder({ ...newOrder, instrument: e.target.value })}
                    className="w-full px-4 py-2 border-2 border-input rounded-lg focus:border-primary focus:outline-none focus:ring-1 focus:ring-ring"
                    placeholder="BTCUSDT"
                  />
                </div>

                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label className="block text-sm font-semibold text-foreground mb-2">Side</label>
                    <select
                      value={newOrder.side}
                      onChange={(e) => setNewOrder({ ...newOrder, side: e.target.value as 'BUY' | 'SELL' })}
className="w-full px-4 py-2 border-2 border-input rounded-lg focus:border-primary focus:outline-none focus:ring-1 focus:ring-ring"
                  >
                    <option value="BUY">BUY</option>
                    <option value="SELL">SELL</option>
                  </select>
                </div>

                <div>
                  <label className="block text-sm font-semibold text-foreground mb-2">Type</label>
                    <select
                      value={newOrder.type}
                      onChange={(e) => setNewOrder({ ...newOrder, type: e.target.value as 'MARKET' | 'LIMIT' | 'STOP' })}
className="w-full px-4 py-2 border-2 border-input rounded-lg focus:border-primary focus:outline-none focus:ring-1 focus:ring-ring"
                  >
                    <option value="MARKET">MARKET</option>
                    <option value="LIMIT">LIMIT</option>
                    <option value="STOP">STOP</option>
                    </select>
                  </div>
                </div>

                <div>
                  <label className="block text-sm font-semibold text-foreground mb-2">Quantity</label>
                  <input
                    type="number"
                    step="0.001"
                    value={newOrder.quantity}
                    onChange={(e) => setNewOrder({ ...newOrder, quantity: parseFloat(e.target.value) })}
                    className="w-full px-4 py-2 border-2 border-input rounded-lg focus:border-primary focus:outline-none focus:ring-1 focus:ring-ring"
                  />
                </div>

                {newOrder.type !== 'MARKET' && (
                  <div>
                    <label className="block text-sm font-semibold text-foreground mb-2">Price</label>
                    <input
                      type="number"
                      step="0.01"
                      value={newOrder.price}
                      onChange={(e) => setNewOrder({ ...newOrder, price: parseFloat(e.target.value) })}
                      className="w-full px-4 py-2 border-2 border-input rounded-lg focus:border-primary focus:outline-none focus:ring-1 focus:ring-ring"
                    />
                  </div>
                )}
              </div>

              {orderError && (
                <div className="mt-4 bg-destructive/10 border border-destructive/30 text-destructive rounded-lg px-3 py-2 text-sm">
                  {orderError}
                </div>
              )}
              <div className="flex gap-4 mt-6">
                <button
                  onClick={() => { setShowNewOrderModal(false); setOrderError(null); }}
className="flex-1 px-6 py-3 bg-secondary text-secondary-foreground rounded-lg hover:bg-secondary/80 transition-all font-semibold"
                  >
                    Cancel
                  </button>
                  <button
                    onClick={handleCreateOrder}
                    className="flex-1 px-6 py-3 bg-primary text-primary-foreground rounded-lg hover:bg-primary/90 transition-all font-semibold"
                >
                  Create Order
                </button>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}


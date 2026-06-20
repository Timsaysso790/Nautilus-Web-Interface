import React, { useState, useEffect, useRef } from 'react';
import api from '../lib/api';
import { useWebSocket } from '../hooks/useWebSocket';

interface Position {
  id: string;
  instrument: string;
  side: 'LONG' | 'SHORT';
  quantity: number;
  entry_price: number;
  current_price?: number;
  pnl?: number;
  unrealized_pnl?: number;
  realized_pnl?: number;
  timestamp: string;
}

export default function PositionsPage() {
  const [positions, setPositions] = useState<Position[]>([]);
  const [loading, setLoading] = useState(true);
  const [fetchError, setFetchError] = useState<string | null>(null);
  const [totalPnL, setTotalPnL] = useState(0);
  const { lastMessage } = useWebSocket();
  const prevMessageRef = useRef(lastMessage);

  useEffect(() => {
    fetchPositions();
  }, []);

  // Refresh on live_data WebSocket push instead of polling
  useEffect(() => {
    if (lastMessage && lastMessage !== prevMessageRef.current) {
      prevMessageRef.current = lastMessage;
      if (lastMessage.type === 'live_data') {
        fetchPositions();
      }
    }
  }, [lastMessage]);

  const getPositionPnl = (pos: Position): number => {
    if (pos.pnl != null) return pos.pnl;
    return (pos.unrealized_pnl ?? 0) + (pos.realized_pnl ?? 0);
  };

  const fetchPositions = async () => {
    try {
      const data = await api.get<{ positions: Position[] }>('/api/positions');
      const rows = data.positions || [];
      setPositions(rows);
      const total = rows.reduce((sum: number, pos: Position) => sum + getPositionPnl(pos), 0);
      setTotalPnL(total);
      setFetchError(null);
    } catch (error) {
      setFetchError(error instanceof Error ? error.message : 'Failed to load positions');
    } finally {
      setLoading(false);
    }
  };

  const handleClosePosition = async (positionId: string) => {
    if (!confirm('Close this position?')) return;
    try {
      await api.post(`/api/positions/${positionId}/close`);
      fetchPositions();
    } catch (error) {
      setFetchError(error instanceof Error ? error.message : 'Failed to close position');
    }
  };

  const getSideColor = (side: string) => {
    return side === 'LONG' ? 'bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-400' : 'bg-red-100 text-red-800 dark:bg-red-900/30 dark:text-red-400';
  };

  const getPnLColor = (pnl: number) => {
    return pnl >= 0 ? 'text-green-600 dark:text-green-400' : 'text-red-600 dark:text-red-400';
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-background p-8">
        <div className="text-center">Loading positions...</div>
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
            <h1 className="text-4xl font-bold text-foreground mb-2">💼 Position Management</h1>
            <p className="text-muted-foreground">Monitor your open positions and P&L</p>
          </div>
          <button
            onClick={() => window.location.href = '/trader'}
            className="px-6 py-3 bg-card border-2 border-input text-foreground rounded-lg hover:bg-muted/50 transition-all font-semibold"
          >
            ← Back to Dashboard
          </button>
        </div>

        {/* Summary Cards */}
        <div className="grid grid-cols-1 md:grid-cols-4 gap-6 mb-8">
          <div className="bg-card rounded-xl border p-6 shadow-sm">
            <div className="text-sm text-muted-foreground mb-2">Open Positions</div>
            <div className="text-3xl font-bold text-foreground">{positions.length}</div>
          </div>
          
          <div className="bg-card rounded-xl border p-6 shadow-sm">
            <div className="text-sm text-muted-foreground mb-2">Total P&L</div>
            <div className={`text-3xl font-bold ${getPnLColor(totalPnL)}`}>
              ${totalPnL.toFixed(2)}
            </div>
          </div>
          
          <div className="bg-card rounded-xl border p-6 shadow-sm">
            <div className="text-sm text-muted-foreground mb-2">Long Positions</div>
            <div className="text-3xl font-bold text-green-600 dark:text-green-400">
              {positions.filter(p => p.side === 'LONG').length}
            </div>
          </div>
          
          <div className="bg-card rounded-xl border p-6 shadow-sm">
            <div className="text-sm text-muted-foreground mb-2">Short Positions</div>
            <div className="text-3xl font-bold text-red-600 dark:text-red-400">
              {positions.filter(p => p.side === 'SHORT').length}
            </div>
          </div>
        </div>

        {/* Positions Table */}
        {positions.length === 0 ? (
          <div className="bg-card rounded-xl shadow-sm border p-12 text-center">
            <div className="text-6xl mb-4">💼</div>
            <h3 className="text-2xl font-bold text-foreground mb-2">No Open Positions</h3>
            <p className="text-muted-foreground mb-6">You don't have any open positions at the moment</p>
            <button
              onClick={() => window.location.href = '/trader/orders'}
              className="px-6 py-3 bg-primary text-primary-foreground rounded-lg hover:bg-primary/90 transition-all font-semibold"
            >
              Create Order
            </button>
          </div>
        ) : (
          <div className="bg-card rounded-xl border overflow-hidden">
            <div className="overflow-x-auto">
              <table className="w-full">
                <thead className="bg-muted/50 border-b border-border">
                  <tr>
                    <th className="px-6 py-4 text-left text-xs font-semibold text-muted-foreground uppercase">Position ID</th>
                    <th className="px-6 py-4 text-left text-xs font-semibold text-muted-foreground uppercase">Instrument</th>
                    <th className="px-6 py-4 text-center text-xs font-semibold text-muted-foreground uppercase">Side</th>
                    <th className="px-6 py-4 text-right text-xs font-semibold text-muted-foreground uppercase">Quantity</th>
                    <th className="px-6 py-4 text-right text-xs font-semibold text-muted-foreground uppercase">Entry Price</th>
                    <th className="px-6 py-4 text-right text-xs font-semibold text-muted-foreground uppercase">Current Price</th>
                    <th className="px-6 py-4 text-right text-xs font-semibold text-muted-foreground uppercase">P&L</th>
                    <th className="px-6 py-4 text-center text-xs font-semibold text-muted-foreground uppercase">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-border">
                  {positions.map((position) => (
                    <tr key={position.id} className="hover:bg-muted/50 transition-colors">
                      <td className="px-6 py-4 text-sm font-mono text-foreground">{position.id}</td>
                      <td className="px-6 py-4 text-sm font-semibold text-foreground">{position.instrument}</td>
                      <td className="px-6 py-4 text-center">
                        <span className={`px-3 py-1 rounded-full text-xs font-semibold ${getSideColor(position.side)}`}>
                          {position.side}
                        </span>
                      </td>
                      <td className="px-6 py-4 text-sm text-right text-foreground">{position.quantity}</td>
                      <td className="px-6 py-4 text-sm text-right text-foreground">${position.entry_price.toFixed(2)}</td>
                      <td className="px-6 py-4 text-sm text-right text-foreground">
                        {position.current_price != null ? `$${position.current_price.toFixed(2)}` : '-'}
                      </td>
                      <td className="px-6 py-4 text-sm text-right">
                        <span className={`font-bold ${getPnLColor(getPositionPnl(position))}`}>
                          ${getPositionPnl(position).toFixed(2)}
                        </span>
                      </td>
                      <td className="px-6 py-4 text-center">
                        <button
                          onClick={() => handleClosePosition(position.id)}
                          className="px-3 py-1 bg-destructive text-destructive-foreground rounded hover:bg-destructive/90 transition-all text-xs font-semibold"
                        >
                          Close
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}


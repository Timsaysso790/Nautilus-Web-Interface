import React, { useState, useEffect } from 'react';
import api from '../lib/api';

interface Strategy {
  id: string;
  name: string;
  type: string;
  status: string;
  description: string;
  config: Record<string, any>;
  performance: {
    total_pnl: number;
    total_trades: number;
    win_rate: number;
  };
}

export default function StrategiesPage() {
  const [strategies, setStrategies] = useState<Strategy[]>([]);
  const [loading, setLoading] = useState(true);
  const [fetchError, setFetchError] = useState<string | null>(null);
  const [modalError, setModalError] = useState<string | null>(null);
  const [showAddModal, setShowAddModal] = useState(false);
  const [newStrategy, setNewStrategy] = useState({
    name: '',
    type: 'sma_crossover',
    description: '',
    config: {}
  });

  useEffect(() => {
    fetchStrategies();
  }, []);

  const fetchStrategies = async () => {
    try {
      const data = await api.get<{ strategies: Strategy[] }>('/api/strategies');
      setStrategies(data.strategies || []);
      setFetchError(null);
    } catch (error) {
      setFetchError(error instanceof Error ? error.message : 'Failed to load strategies');
    } finally {
      setLoading(false);
    }
  };

  const handleAddStrategy = async () => {
    setModalError(null);
    try {
      await api.post('/api/strategies', newStrategy);
      setShowAddModal(false);
      setNewStrategy({ name: '', type: 'sma_crossover', description: '', config: {} });
      fetchStrategies();
    } catch (error) {
      setModalError(error instanceof Error ? error.message : 'Failed to add strategy');
    }
  };

  const handleStartStrategy = async (strategyId: string) => {
    try {
      await api.post(`/api/strategies/${strategyId}/start`);
      fetchStrategies();
    } catch (error) {
      setFetchError(error instanceof Error ? error.message : 'Failed to start strategy');
    }
  };

  const handleStopStrategy = async (strategyId: string) => {
    try {
      await api.post(`/api/strategies/${strategyId}/stop`);
      fetchStrategies();
    } catch (error) {
      setFetchError(error instanceof Error ? error.message : 'Failed to stop strategy');
    }
  };

  const handleDeleteStrategy = async (strategyId: string) => {
    if (!confirm('Are you sure you want to delete this strategy?')) return;
    try {
      await api.delete(`/api/strategies/${strategyId}`);
      fetchStrategies();
    } catch (error) {
      setFetchError(error instanceof Error ? error.message : 'Failed to delete strategy');
    }
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-background p-8">
        <div className="text-center">Loading strategies...</div>
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
            <h1 className="text-4xl font-bold text-foreground mb-2">📈 Strategy Management</h1>
            <p className="text-muted-foreground">Manage and monitor your trading strategies</p>
          </div>
          <div className="flex gap-4">
            <button
              onClick={() => window.location.href = '/trader'}
              className="px-6 py-3 bg-card border-2 border-input text-foreground rounded-lg hover:bg-muted/50 transition-all font-semibold"
            >
              ← Back to Dashboard
            </button>
            <button
              onClick={() => setShowAddModal(true)}
              className="px-6 py-3 bg-primary text-primary-foreground rounded-lg hover:bg-primary/90 transition-all font-semibold"
            >
              + Add Strategy
            </button>
          </div>
        </div>

        {/* Strategies Grid */}
        {strategies.length === 0 ? (
          <div className="bg-card rounded-xl shadow-sm border p-12 text-center">
            <div className="text-6xl mb-4">📊</div>
            <h3 className="text-2xl font-bold text-foreground mb-2">No Strategies Yet</h3>
            <p className="text-muted-foreground mb-6">Add your first trading strategy to get started</p>
            <button
              onClick={() => setShowAddModal(true)}
              className="px-6 py-3 bg-primary text-primary-foreground rounded-lg hover:bg-primary/90 transition-all font-semibold"
            >
              + Add Strategy
            </button>
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
            {strategies.map((strategy) => (
              <div key={strategy.id} className="bg-card rounded-xl border p-6 hover:shadow-lg transition-shadow">
                <div className="flex justify-between items-start mb-4">
                  <div>
                    <h3 className="text-xl font-bold text-foreground">{strategy.name}</h3>
                    <p className="text-sm text-muted-foreground">{strategy.type}</p>
                  </div>
                  <span className={`px-3 py-1 rounded-full text-sm font-semibold ${
                    strategy.status === 'running' 
                      ? 'bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-400' 
                      : 'bg-muted text-foreground'
                  }`}>
                    {strategy.status}
                  </span>
                </div>

                <p className="text-muted-foreground text-sm mb-4">{strategy.description || 'No description'}</p>

                {/* Performance Metrics */}
                <div className="bg-muted/50 rounded-lg p-4 mb-4">
                  <div className="grid grid-cols-3 gap-2 text-center">
                    <div>
                      <div className="text-xs text-muted-foreground">P&L</div>
                      <div className={`font-bold ${(strategy.performance?.total_pnl ?? 0) >= 0 ? 'text-green-600 dark:text-green-400' : 'text-red-600 dark:text-red-400'}`}>
                        ${(strategy.performance?.total_pnl ?? 0).toFixed(2)}
                      </div>
                    </div>
                    <div>
                      <div className="text-xs text-muted-foreground">Trades</div>
                      <div className="font-bold text-foreground">{strategy.performance?.total_trades ?? 0}</div>
                    </div>
                    <div>
                      <div className="text-xs text-muted-foreground">Win Rate</div>
                      <div className="font-bold text-primary">{((strategy.performance?.win_rate ?? 0) * 100).toFixed(1)}%</div>
                    </div>
                  </div>
                </div>

                {/* Actions */}
                <div className="flex gap-2">
                  {strategy.status === 'stopped' ? (
                    <button
                      onClick={() => handleStartStrategy(strategy.id)}
                      className="flex-1 px-4 py-2 bg-green-600 text-white rounded-lg hover:bg-green-700 transition-all font-semibold text-sm"
                    >
                      ▶ Start
                    </button>
                  ) : (
                    <button
                      onClick={() => handleStopStrategy(strategy.id)}
                      className="flex-1 px-4 py-2 bg-yellow-600 text-white rounded-lg hover:bg-yellow-700 transition-all font-semibold text-sm"
                    >
                      ⏸ Stop
                    </button>
                  )}
                  <button
                    onClick={() => handleDeleteStrategy(strategy.id)}
                    className="px-4 py-2 bg-destructive text-destructive-foreground rounded-lg hover:bg-destructive/90 transition-all font-semibold text-sm"
                  >
                    🗑️
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}

        {/* Add Strategy Modal */}
        {showAddModal && (
          <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
            <div className="bg-card rounded-xl shadow-2xl p-8 max-w-md w-full">
              <h2 className="text-2xl font-bold text-foreground mb-6">Add New Strategy</h2>
              
              <div className="space-y-4">
                <div>
                  <label className="block text-sm font-semibold text-foreground mb-2">Strategy Name</label>
                  <input
                    type="text"
                    value={newStrategy.name}
                    onChange={(e) => setNewStrategy({ ...newStrategy, name: e.target.value })}
                    className="w-full px-4 py-2 border-2 border-input rounded-lg focus:border-primary focus:outline-none focus:ring-1 focus:ring-ring"
                    placeholder="My Trading Strategy"
                  />
                </div>

                <div>
                  <label className="block text-sm font-semibold text-foreground mb-2">Strategy Type</label>
                  <select
                    value={newStrategy.type}
                    onChange={(e) => setNewStrategy({ ...newStrategy, type: e.target.value })}
                    className="w-full px-4 py-2 border-2 border-input rounded-lg focus:border-primary focus:outline-none focus:ring-1 focus:ring-ring"
                  >
                    <option value="sma_crossover">SMA Crossover</option>
                    <option value="rsi">RSI</option>
                  </select>
                </div>

                <div>
                  <label className="block text-sm font-semibold text-foreground mb-2">Description</label>
                  <textarea
                    value={newStrategy.description}
                    onChange={(e) => setNewStrategy({ ...newStrategy, description: e.target.value })}
                    className="w-full px-4 py-2 border-2 border-input rounded-lg focus:border-primary focus:outline-none focus:ring-1 focus:ring-ring"
                    rows={3}
                    placeholder="Describe your strategy..."
                  />
                </div>
              </div>

              {modalError && (
                <div className="mt-4 bg-destructive/10 border border-destructive/30 text-destructive rounded-lg px-3 py-2 text-sm">
                  {modalError}
                </div>
              )}
              <div className="flex gap-4 mt-6">
                <button
                  onClick={() => { setShowAddModal(false); setModalError(null); }}
className="flex-1 px-6 py-3 bg-secondary text-secondary-foreground rounded-lg hover:bg-secondary/80 transition-all font-semibold"
                  >
                    Cancel
                  </button>
                  <button
                    onClick={handleAddStrategy}
                    className="flex-1 px-6 py-3 bg-primary text-primary-foreground rounded-lg hover:bg-primary/90 transition-all font-semibold"
                  disabled={!newStrategy.name}
                >
                  Add Strategy
                </button>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}


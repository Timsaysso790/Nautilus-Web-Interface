import React, { useState, useEffect } from 'react';
import api from '../lib/api';

interface RiskMetrics {
  total_exposure: number;
  margin_used: number;
  margin_available: number;
  max_drawdown: number;
  var_1d: number;
  position_count: number;
}

interface RiskLimits {
  max_order_size: number;
  max_position_size: number;
  max_daily_loss: number;
  max_positions: number;
}

export default function RiskPage() {
  const [metrics, setMetrics] = useState<RiskMetrics | null>(null);
  const [limits, setLimits] = useState<RiskLimits | null>(null);
  const [loading, setLoading] = useState(true);
  const [fetchError, setFetchError] = useState<string | null>(null);
  const [editingLimits, setEditingLimits] = useState(false);
  const [newLimits, setNewLimits] = useState<RiskLimits>({
    max_order_size: 10000,
    max_position_size: 50000,
    max_daily_loss: 5000,
    max_positions: 10
  });

  useEffect(() => {
    fetchData();
    const interval = setInterval(fetchData, 5000);
    return () => clearInterval(interval);
  }, []);

  const fetchData = async () => {
    try {
      const [metricsData, limitsData] = await Promise.all([
        api.get<RiskMetrics>('/api/risk/metrics'),
        api.get<RiskLimits>('/api/risk/limits'),
      ]);
      setMetrics(metricsData);
      setLimits(limitsData);
      setNewLimits(limitsData);
    } catch (error) {
      setFetchError(error instanceof Error ? error.message : 'Failed to load risk data');
    } finally {
      setLoading(false);
    }
  };

  const handleUpdateLimits = async () => {
    try {
      await api.post('/api/risk/limits', newLimits);
      setEditingLimits(false);
      fetchData();
    } catch (error) {
      setFetchError(error instanceof Error ? error.message : 'Failed to update limits');
    }
  };

  const getExposurePercentage = () => {
    if (!metrics || !limits) return 0;
    return (metrics.total_exposure / limits.max_position_size) * 100;
  };

  const getMarginPercentage = () => {
    if (!metrics) return 0;
    const total = metrics.margin_used + metrics.margin_available;
    return total > 0 ? (metrics.margin_used / total) * 100 : 0;
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-background p-8">
        <div className="text-center">Loading risk data...</div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background p-8">
      <div className="max-w-7xl mx-auto">
        {/* Header */}
        <div className="flex justify-between items-center mb-8">
          <div>
            <h1 className="text-4xl font-bold text-foreground mb-2">🛡️ Risk Management</h1>
            <p className="text-muted-foreground">Monitor and control trading risk</p>
          </div>
          <button
            onClick={() => window.location.href = '/trader'}
            className="px-6 py-3 bg-card border-2 border-input text-foreground rounded-lg hover:bg-muted/50 transition-all font-semibold"
          >
            ← Back to Dashboard
          </button>
        </div>

        {/* Risk Metrics */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6 mb-8">
          <div className="bg-card rounded-xl border p-6 shadow-sm">
            <div className="flex items-center justify-between mb-4">
              <div className="text-sm text-muted-foreground">Total Exposure</div>
              <div className="text-2xl">💰</div>
            </div>
            <div className="text-3xl font-bold text-foreground mb-2">
              ${metrics?.total_exposure.toFixed(2)}
            </div>
            <div className="w-full bg-muted rounded-full h-2">
              <div 
                className="bg-primary h-2 rounded-full transition-all"
                style={{ width: `${Math.min(getExposurePercentage(), 100)}%` }}
              />
            </div>
            <div className="text-xs text-muted-foreground mt-1">
              {getExposurePercentage().toFixed(1)}% of max position size
            </div>
          </div>

          <div className="bg-card rounded-xl border p-6 shadow-sm">
            <div className="flex items-center justify-between mb-4">
              <div className="text-sm text-muted-foreground">Margin Usage</div>
              <div className="text-2xl">📊</div>
            </div>
            <div className="text-3xl font-bold text-foreground mb-2">
              ${metrics?.margin_used.toFixed(2)}
            </div>
            <div className="w-full bg-muted rounded-full h-2">
              <div 
                className={`h-2 rounded-full transition-all ${
                  getMarginPercentage() > 80 ? 'bg-red-600' : 
                  getMarginPercentage() > 60 ? 'bg-yellow-600' : 'bg-green-600'
                }`}
                style={{ width: `${Math.min(getMarginPercentage(), 100)}%` }}
              />
            </div>
            <div className="text-xs text-muted-foreground mt-1">
              ${metrics?.margin_available.toFixed(2)} available
            </div>
          </div>

          <div className="bg-card rounded-xl border p-6 shadow-sm">
            <div className="flex items-center justify-between mb-4">
              <div className="text-sm text-muted-foreground">Max Drawdown</div>
              <div className="text-2xl">📉</div>
            </div>
            <div className="text-3xl font-bold text-red-600 dark:text-red-400 mb-2">
              {metrics?.max_drawdown.toFixed(2)}%
            </div>
            <div className="text-xs text-muted-foreground mt-1">
              VaR (1D): ${metrics?.var_1d.toFixed(2)}
            </div>
          </div>
        </div>

        {/* Risk Limits */}
        <div className="bg-card rounded-xl border p-8 mb-8 shadow-sm">
          <div className="flex justify-between items-center mb-6">
            <h2 className="text-2xl font-bold text-foreground">Risk Limits</h2>
            {!editingLimits ? (
              <button
                onClick={() => setEditingLimits(true)}
                className="px-4 py-2 bg-primary text-primary-foreground rounded-lg hover:bg-primary/90 transition-all font-semibold"
              >
                ✏️ Edit Limits
              </button>
            ) : (
              <div className="flex gap-2">
                <button
                  onClick={() => {
                    setEditingLimits(false);
                    setNewLimits(limits!);
                  }}
                  className="px-4 py-2 bg-secondary text-secondary-foreground rounded-lg hover:bg-secondary/80 transition-all font-semibold"
                >
                  Cancel
                </button>
                <button
                  onClick={handleUpdateLimits}
                  className="px-4 py-2 bg-green-600 text-white rounded-lg hover:bg-green-700 transition-all font-semibold"
                >
                  💾 Save
                </button>
              </div>
            )}
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            <div>
              <label className="block text-sm font-semibold text-foreground mb-2">
                Max Order Size ($)
              </label>
              {editingLimits ? (
                <input
                  type="number"
                  value={newLimits.max_order_size}
                  onChange={(e) => setNewLimits({ ...newLimits, max_order_size: parseFloat(e.target.value) })}
                  className="w-full px-4 py-2 border-2 border-input rounded-lg focus:border-primary focus:outline-none focus:ring-1 focus:ring-ring"
                />
              ) : (
                <div className="text-2xl font-bold text-foreground">
                  ${limits?.max_order_size.toFixed(2)}
                </div>
              )}
            </div>

            <div>
              <label className="block text-sm font-semibold text-foreground mb-2">
                Max Position Size ($)
              </label>
              {editingLimits ? (
                <input
                  type="number"
                  value={newLimits.max_position_size}
                  onChange={(e) => setNewLimits({ ...newLimits, max_position_size: parseFloat(e.target.value) })}
                  className="w-full px-4 py-2 border-2 border-input rounded-lg focus:border-primary focus:outline-none focus:ring-1 focus:ring-ring"
                />
              ) : (
                <div className="text-2xl font-bold text-foreground">
                  ${limits?.max_position_size.toFixed(2)}
                </div>
              )}
            </div>

            <div>
              <label className="block text-sm font-semibold text-foreground mb-2">
                Max Daily Loss ($)
              </label>
              {editingLimits ? (
                <input
                  type="number"
                  value={newLimits.max_daily_loss}
                  onChange={(e) => setNewLimits({ ...newLimits, max_daily_loss: parseFloat(e.target.value) })}
                  className="w-full px-4 py-2 border-2 border-input rounded-lg focus:border-primary focus:outline-none focus:ring-1 focus:ring-ring"
                />
              ) : (
                <div className="text-2xl font-bold text-foreground">
                  ${limits?.max_daily_loss.toFixed(2)}
                </div>
              )}
            </div>

            <div>
              <label className="block text-sm font-semibold text-foreground mb-2">
                Max Open Positions
              </label>
              {editingLimits ? (
                <input
                  type="number"
                  value={newLimits.max_positions}
                  onChange={(e) => setNewLimits({ ...newLimits, max_positions: parseInt(e.target.value) })}
                  className="w-full px-4 py-2 border-2 border-input rounded-lg focus:border-primary focus:outline-none focus:ring-1 focus:ring-ring"
                />
              ) : (
                <div className="text-2xl font-bold text-foreground">
                  {limits?.max_positions}
                </div>
              )}
            </div>
          </div>
        </div>

        {/* Risk Alerts */}
        <div className="bg-card rounded-xl border p-8 shadow-sm">
          <h2 className="text-2xl font-bold text-foreground mb-6">Risk Alerts</h2>
          
          <div className="space-y-4">
            {getMarginPercentage() > 80 && (
              <div className="bg-destructive/10 border-l-4 border-destructive p-4 rounded">
                <div className="flex items-center">
                  <div className="text-2xl mr-3">⚠️</div>
                  <div>
                    <div className="font-bold text-destructive-foreground">High Margin Usage</div>
                    <div className="text-sm text-destructive">
                      Margin usage is above 80%. Consider reducing exposure.
                    </div>
                  </div>
                </div>
              </div>
            )}

            {metrics && metrics.position_count >= (limits?.max_positions || 10) && (
              <div className="bg-yellow-50 dark:bg-yellow-900/20 border-l-4 border-yellow-600 dark:border-yellow-500 p-4 rounded">
                <div className="flex items-center">
                  <div className="text-2xl mr-3">⚠️</div>
                  <div>
                    <div className="font-bold text-yellow-900 dark:text-yellow-100">Max Positions Reached</div>
                    <div className="text-sm text-yellow-700">
                      You have reached the maximum number of open positions.
                    </div>
                  </div>
                </div>
              </div>
            )}

            {getExposurePercentage() > 90 && (
              <div className="bg-destructive/10 border-l-4 border-destructive p-4 rounded">
                <div className="flex items-center">
                  <div className="text-2xl mr-3">🚨</div>
                  <div>
                    <div className="font-bold text-destructive-foreground">Critical Exposure Level</div>
                    <div className="text-sm text-destructive">
                      Total exposure is above 90% of maximum. Immediate action required.
                    </div>
                  </div>
                </div>
              </div>
            )}

            {getMarginPercentage() < 50 && getExposurePercentage() < 50 && (
              <div className="bg-green-50 dark:bg-green-900/20 border-l-4 border-green-600 dark:border-green-500 p-4 rounded">
                <div className="flex items-center">
                  <div className="text-2xl mr-3">✅</div>
                  <div>
                    <div className="font-bold text-green-900 dark:text-green-100">All Systems Normal</div>
                    <div className="text-sm text-green-700">
                      Risk metrics are within acceptable ranges.
                    </div>
                  </div>
                </div>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}


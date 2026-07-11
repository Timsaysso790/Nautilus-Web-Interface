import React, { useState, useEffect } from 'react';
import api from '../lib/api';
import AppLayout from "@/components/AppLayout";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Plus, Play, Square, Trash2, FlaskConical, BarChart3 } from "lucide-react";

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
      <AppLayout title="Strategy Management" subtitle="Manage and monitor your trading strategies">
        <div className="text-center text-muted-foreground py-12">Loading strategies...</div>
      </AppLayout>
    );
  }

  return (
    <AppLayout
      title="Strategies"
      subtitle="Manage and monitor your trading strategies"
      actions={
        <Button onClick={() => setShowAddModal(true)} size="sm">
          <Plus className="h-4 w-4 mr-1" />
          Add Strategy
        </Button>
      }
    >
      {fetchError && (
        <div className="mb-4 bg-loss-bg border border-loss/30 text-loss rounded-lg px-4 py-3 text-sm">
          {fetchError}
        </div>
      )}

      {strategies.length === 0 ? (
        <div className="max-w-md mx-auto mt-12 text-center">
          <BarChart3 className="h-12 w-12 text-muted-foreground mx-auto mb-4" />
          <h3 className="text-lg font-semibold text-foreground mb-2">No Strategies Yet</h3>
          <p className="text-sm text-muted-foreground mb-6">Add your first trading strategy to get started</p>
          <Button onClick={() => setShowAddModal(true)}>
            <Plus className="h-4 w-4 mr-1" />
            Add Strategy
          </Button>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {strategies.map((strategy) => (
            <Card key={strategy.id} className="hover:border-primary/30 transition-all">
              <CardHeader className="pb-3">
                <div className="flex items-start justify-between">
                  <div>
                    <CardTitle className="text-base">{strategy.name}</CardTitle>
                    <p className="text-xs text-muted-foreground mt-0.5">{strategy.type}</p>
                  </div>
                  <Badge variant={strategy.status === 'running' ? 'default' : 'secondary'}>
                    {strategy.status}
                  </Badge>
                </div>
              </CardHeader>
              <CardContent>
                <p className="text-sm text-muted-foreground mb-4">
                  {strategy.description || 'No description'}
                </p>

                <div className="bg-muted/50 rounded-lg p-3 mb-4">
                  <div className="grid grid-cols-3 gap-2 text-center">
                    <div>
                      <div className="text-xs text-muted-foreground">P&L</div>
                      <div className={`tabular-mono text-sm font-semibold ${
                        (strategy.performance?.total_pnl ?? 0) >= 0 ? 'text-profit' : 'text-loss'
                      }`}>
                        ${(strategy.performance?.total_pnl ?? 0).toFixed(2)}
                      </div>
                    </div>
                    <div>
                      <div className="text-xs text-muted-foreground">Trades</div>
                      <div className="tabular-mono text-sm font-semibold text-foreground">
                        {strategy.performance?.total_trades ?? 0}
                      </div>
                    </div>
                    <div>
                      <div className="text-xs text-muted-foreground">Win Rate</div>
                      <div className="tabular-mono text-sm font-semibold text-primary">
                        {((strategy.performance?.win_rate ?? 0) * 100).toFixed(1)}%
                      </div>
                    </div>
                  </div>
                </div>

                <div className="flex gap-2">
                  {strategy.status === 'stopped' ? (
                    <Button
                      onClick={() => handleStartStrategy(strategy.id)}
                      size="sm"
                      className="flex-1"
                    >
                      <Play className="h-3 w-3 mr-1" />
                      Start
                    </Button>
                  ) : (
                    <Button
                      onClick={() => handleStopStrategy(strategy.id)}
                      size="sm"
                      variant="secondary"
                      className="flex-1"
                    >
                      <Square className="h-3 w-3 mr-1" />
                      Stop
                    </Button>
                  )}
                  <Button
                    onClick={() => handleDeleteStrategy(strategy.id)}
                    size="sm"
                    variant="outline"
                    className="text-loss hover:text-loss"
                  >
                    <Trash2 className="h-3 w-3" />
                  </Button>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      <Dialog open={showAddModal} onOpenChange={setShowAddModal}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Add New Strategy</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 py-2">
            <div>
              <label className="block text-sm font-medium text-foreground mb-1.5">Strategy Name</label>
              <Input
                value={newStrategy.name}
                onChange={(e) => setNewStrategy({ ...newStrategy, name: e.target.value })}
                placeholder="My Trading Strategy"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-foreground mb-1.5">Strategy Type</label>
              <Select
                value={newStrategy.type}
                onValueChange={(value) => setNewStrategy({ ...newStrategy, type: value })}
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="sma_crossover">SMA Crossover</SelectItem>
                  <SelectItem value="rsi">RSI</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div>
              <label className="block text-sm font-medium text-foreground mb-1.5">Description</label>
              <Textarea
                value={newStrategy.description}
                onChange={(e) => setNewStrategy({ ...newStrategy, description: e.target.value })}
                rows={3}
                placeholder="Describe your strategy..."
              />
            </div>
          </div>
          {modalError && (
            <div className="bg-loss-bg border border-loss/30 text-loss rounded-lg px-3 py-2 text-sm">
              {modalError}
            </div>
          )}
          <DialogFooter>
            <Button variant="outline" onClick={() => { setShowAddModal(false); setModalError(null); }}>
              Cancel
            </Button>
            <Button onClick={handleAddStrategy} disabled={!newStrategy.name}>
              Add Strategy
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </AppLayout>
  );
}

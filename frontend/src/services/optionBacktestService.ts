import api from '@/lib/api';

export const optionBacktestService = {
  // ── Projects ──────────────────────────────────────────────────────────────

  async listProjects() {
    return api.get<{ projects: any[] }>('/api/backtest/projects');
  },

  async createProject(name: string, type = "options") {
    return api.post<{ project: any }>('/api/backtest/projects', { name, type });
  },

  async deleteProject(projectId: string) {
    return api.delete(`/api/backtest/projects/${projectId}`);
  },

  // ── Templates ─────────────────────────────────────────────────────────────

  async listTemplates() {
    return api.get<{ templates: any[] }>('/api/backtest/templates');
  },

  async saveTemplate(name: string, config: any) {
    return api.post<{ template: any }>('/api/backtest/templates', { name, config });
  },

  async deleteTemplate(templateId: string) {
    return api.delete(`/api/backtest/templates/${templateId}`);
  },

  // ── Options Station Backtest ──────────────────────────────────────────────

  async runOptionsStation(config: any) {
    return api.post<any>('/api/backtest/options-station/run', config);
  },

  // ── Project Config ───────────────────────────────────────────────────────

  async saveProjectConfig(projectId: string, configId: string, config: any) {
    return api.post<{ success: boolean; config_id: string }>(
      `/api/backtest/projects/${projectId}/config`, { config_id: configId, config }
    );
  },

  async loadProjectConfig(projectId: string, configId: string) {
    return api.get<{ config: any; config_id: string }>(
      `/api/backtest/projects/${projectId}/config/${configId}`
    );
  },

  // ── Portfolio Engine Backtest ────────────────────────────────────────────

  async runPortfolioBacktest(config: any) {
    return api.post<any>('/api/backtest/portfolio/run', config);
  },

  async fetchDividends(ticker: string) {
    return api.get<{ ticker: string; dividends: { date: string; amount: number }[]; cached: boolean }>(
      `/api/backtest/portfolio/dividends?ticker=${ticker}`
    );
  },

  async fetchMacroPrices(symbols = "QQQ,IWM") {
    return api.get<{ symbols: Record<string, { close: number | null; date: string | null }> }>(
      `/api/backtest/portfolio/macro-prices?symbols=${symbols}`
    );
  },
};

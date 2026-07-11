import api from '@/lib/api';

export interface DataSource {
  id: string;
  source_type: string;
  label: string;
  has_api_key: boolean;
  created_at: string;
}

export interface DataSourceDetail {
  id: string;
  source_type: string;
  label: string;
  config: Record<string, any>;
  api_key_masked: string;
  created_at: string;
}

export interface DownloadJob {
  id: string;
  source_id: string | null;
  source_type: string;
  status: string;
  progress: number;
  error: string | null;
  created_at: string;
  completed_at: string | null;
}

export interface CatalogEntry {
  type: string;
  id: string;
  files: { name: string; size_bytes: number }[];
  total_files: number;
  total_size_bytes: number;
}

export interface CatalogSummary {
  instruments: CatalogEntry[];
  total_size_bytes: number;
  total_instruments: number;
}

export interface ConvertStats {
  converted: number;
  skipped: number;
  errors: number;
}

export interface ConvertTaskStatus {
  status: "pending" | "running" | "completed" | "error";
  total_files: number;
  processed: number;
  current_file: string;
  converted: number;
  skipped: number;
  errors: number;
  error_detail?: string;
}

export interface BrowseEntry {
  name: string;
  path: string;
}

export interface ParquetFileEntry {
  name: string;
  size_bytes: number;
}

export interface BrowseResult {
  current_path: string;
  subdirectories: BrowseEntry[];
  parquet_files: ParquetFileEntry[];
  parquet_count: number;
  total_parquet_recursive: number;
  parent_path: string;
}

export interface TickerCoverage {
  ticker: string;
  bars_date_range: string | null;
  greeks_date_range: string | null;
  total_files: number;
  total_size_bytes: number;
}

export interface ThetaDataSymbols {
  symbols: string[];
}

export interface BatchDownloadRequest {
  symbols: string[];
  start_date: string;
  end_date: string;
  tier: string;
  bars: boolean;
  greeks: boolean;
}

export interface NvmeCacheEntry {
  ticker: string;
  size_bytes: number;
}

export const dataLakeService = {
  // Sources
  async listSources() {
    return api.get<{ sources: DataSource[]; count: number }>('/api/data-lake/sources');
  },
  async getSource(id: string) {
    return api.get<DataSourceDetail>(`/api/data-lake/sources/${id}`);
  },
  async createSource(data: { source_type: string; api_key: string; label?: string; config?: any }) {
    return api.post<{ success: boolean; source: DataSource }>('/api/data-lake/sources', data);
  },
  async updateSource(id: string, data: { api_key?: string; label?: string; config?: any }) {
    return api.put<{ success: boolean }>(`/api/data-lake/sources/${id}`, data);
  },
  async deleteSource(id: string) {
    return api.delete<{ success: boolean }>(`/api/data-lake/sources/${id}`);
  },
  async testSource(id: string) {
    return api.post<{ success: boolean; connected: boolean; error?: string }>(`/api/data-lake/sources/${id}/test`);
  },

  // Jobs
  async listJobs() {
    return api.get<{ jobs: DownloadJob[]; count: number }>('/api/data-lake/jobs');
  },
  async createJob(data: { source_id?: string; source_type: string; config: any }) {
    return api.post<{ success: boolean; job: DownloadJob }>('/api/data-lake/jobs', data);
  },
  async getJob(id: string) {
    return api.get<{ job: DownloadJob }>(`/api/data-lake/jobs/${id}`);
  },
  async deleteJob(id: string) {
    return api.delete<{ success: boolean }>(`/api/data-lake/jobs/${id}`);
  },
  async convertJob(id: string) {
    return api.post<{ success: boolean; stats: ConvertStats }>(`/api/data-lake/jobs/${id}/convert`);
  },

  // Catalog
  async getCatalog() {
    return api.get<CatalogSummary>('/api/data-lake/catalog');
  },
  async deleteCatalogEntry(dataType: string, instrumentId: string) {
    return api.delete<{ success: boolean }>(`/api/data-lake/catalog/${dataType}/${instrumentId}`);
  },

  // Import / Convert
  async browseFolder(path?: string) {
    const params = path ? `?path=${encodeURIComponent(path)}` : '';
    return api.get<BrowseResult>(`/api/data-lake/browse${params}`);
  },
  async convertData(sourcePath: string, instrumentFilter?: string) {
    return api.post<{ task_id: string }>('/api/data-lake/convert', {
      source_path: sourcePath,
      instrument_filter: instrumentFilter || null,
    });
  },
  async getConvertStatus(taskId: string) {
    return api.get<ConvertTaskStatus>(`/api/data-lake/convert/status/${taskId}`);
  },
  async importData(sourcePath: string, instrumentFilter?: string) {
    return api.post<{ success: boolean; stats: ConvertStats }>('/api/data-lake/import', {
      source_path: sourcePath,
      instrument_filter: instrumentFilter || null,
    });
  },

  // ThetaData download
  async thetaDownload(data: { symbol: string; start_date: string; end_date: string }) {
    return api.post<{ task_id: string }>('/api/data-lake/thetadata/download', data);
  },
  async thetaSymbols() {
    return api.get<ThetaDataSymbols>('/api/data-lake/thetadata/symbols');
  },

  // Batch ThetaData download
  async batchDownload(data: BatchDownloadRequest) {
    return api.post<{ task_id: string }>('/api/data-lake/thetadata/batch-download', data);
  },

  // Tickers
  async listTickers() {
    return api.get<{ tickers: TickerCoverage[] }>('/api/data-lake/tickers');
  },
  async deleteTicker(ticker: string) {
    return api.delete<{ success: boolean; removed: number }>(`/api/data-lake/tickers/${ticker}`);
  },

  // NVMe Cache
  async convertToCache(ticker: string) {
    return api.post<{ task_id: string }>(`/api/data-lake/cache/convert/${ticker}`);
  },
  async listCache() {
    return api.get<{ cache: NvmeCacheEntry[]; total_size_bytes: number }>('/api/data-lake/cache');
  },
  async clearCache(ticker?: string) {
    if (ticker) {
      return api.delete<{ success: boolean }>(`/api/data-lake/cache/${ticker}`);
    }
    return api.delete<{ success: boolean }>('/api/data-lake/cache');
  },
};

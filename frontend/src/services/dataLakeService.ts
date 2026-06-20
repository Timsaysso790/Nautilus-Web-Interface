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
    return api.post<{ success: boolean; stats: ConvertStats }>('/api/data-lake/convert', {
      source_path: sourcePath,
      instrument_filter: instrumentFilter || null,
    });
  },
  async importData(sourcePath: string, instrumentFilter?: string) {
    return api.post<{ success: boolean; stats: ConvertStats }>('/api/data-lake/import', {
      source_path: sourcePath,
      instrument_filter: instrumentFilter || null,
    });
  },
};

import api from '@/lib/api';

export interface BrokerOrder {
  id: string;
  adapter_id: string;
  instrument: string;
  side: string;
  quantity: number;
  price: number | null;
  status: string;
  type: string;
  created_at: string;
}

export interface BrokerOrderSubmitRequest {
  adapter_id: string;
  instrument: string;
  side: string;
  quantity: number;
  order_type: string;
  price?: number | null;
}

export interface BrokerOrderSubmitResult {
  success: boolean;
  order_id: string;
  exchange_order_id: string;
  status: string;
  adapter_id: string;
}

export interface BrokerSyncResult {
  success: boolean;
  synced_count: number;
  positions: any[];
}

export const brokerService = {
  async listOrders(adapterId?: string) {
    const params = adapterId ? `?adapter_id=${encodeURIComponent(adapterId)}` : '';
    return api.get<{ orders: BrokerOrder[]; count: number }>(`/api/broker-orders${params}`);
  },

  async submitOrder(req: BrokerOrderSubmitRequest) {
    return api.post<BrokerOrderSubmitResult>('/api/broker-orders/submit', req);
  },

  async syncOrders(adapterId: string) {
    return api.post<BrokerSyncResult>(`/api/broker-orders/${encodeURIComponent(adapterId)}/sync`);
  },
};

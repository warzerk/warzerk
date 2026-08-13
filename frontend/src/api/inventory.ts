import { apiClient } from './client';
import type { Paged } from './orders';

export interface LedgerEntry {
  id: string;
  materialCode: string;
  materialName?: string | null;
  warehouseCode?: string | null;
  warehouseName?: string | null;
  direction: string;
  qty?: string | number | null;
  balanceQty?: string | number | null;
  transactionDate?: string | null;
}

export async function getCurrentStock(materialCode: string, orgId?: string) {
  const { data } = await apiClient.get<Record<string, unknown>[]>(
    '/inventory/current-stock',
    { params: { materialCode, orgId } },
  );
  return data;
}

export async function getLedger(params: {
  materialCode: string;
  warehouseCode?: string;
  orgId?: string;
  page: number;
  pageSize: number;
}) {
  const { data } = await apiClient.get<Paged<LedgerEntry>>('/inventory/ledger', {
    params,
  });
  return data;
}

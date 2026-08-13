import { apiClient } from './client';

export interface Paged<T> {
  items: T[];
  total: number;
  page: number;
  pageSize: number;
}

export interface OrgRef {
  id: string;
  orgCode?: string | null;
  orgName?: string | null;
}

export interface SalesOrderLineRow {
  id: string;
  materialCode: string;
  materialName?: string | null;
  qty?: string | number | null;
  unit?: string | null;
  deliveryDate?: string | null;
  salesOrder: {
    id: string;
    orderNo: string;
    customerCode?: string | null;
    customerName?: string | null;
    orderDate?: string | null;
    status?: string | null;
    organization?: OrgRef | null;
  };
}

export interface PurchaseOrderLineRow {
  id: string;
  materialCode: string;
  materialName?: string | null;
  qty?: string | number | null;
  unit?: string | null;
  deliveryDate?: string | null;
  purchaseOrder: {
    id: string;
    orderNo: string;
    supplierCode?: string | null;
    supplierName?: string | null;
    orderDate?: string | null;
    status?: string | null;
    organization?: OrgRef | null;
  };
}

export interface ProductionOrderRow {
  id: string;
  orderNo: string;
  materialCode?: string | null;
  materialName?: string | null;
  planQty?: string | number | null;
  unit?: string | null;
  planStartDate?: string | null;
  planEndDate?: string | null;
  status?: string | null;
  organization?: OrgRef | null;
}

export interface ProductionOrderLineRow {
  id: string;
  materialCode: string;
  materialName?: string | null;
  qty?: string | number | null;
  unit?: string | null;
  productionOrder: {
    id: string;
    orderNo: string;
    materialCode?: string | null;
    materialName?: string | null;
    status?: string | null;
    organization?: OrgRef | null;
  };
}

export interface MaterialOrdersResponse {
  salesOrders: Paged<SalesOrderLineRow>;
  purchaseOrders: Paged<PurchaseOrderLineRow>;
  productionOrders: {
    asProduct: Paged<ProductionOrderRow>;
    asComponent: Paged<ProductionOrderLineRow>;
  };
}

export async function getOrdersByMaterial(params: {
  materialCode: string;
  orgId?: string;
  page: number;
  pageSize: number;
}) {
  const { data } = await apiClient.get<MaterialOrdersResponse>('/orders/by-material', {
    params,
  });
  return data;
}

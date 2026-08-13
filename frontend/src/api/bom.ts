import { apiClient } from './client';
import type { OrgRef } from './orders';

export interface BomLine {
  id: string;
  childCode: string;
  childName?: string | null;
  qty?: string | number | null;
  unit?: string | null;
}

export interface BomSku {
  id: string;
  skuCode: string;
}

export interface BomHeader {
  id: string;
  materialCode: string;
  materialName?: string | null;
  version?: string | null;
  isActive: boolean;
  organization?: OrgRef | null;
  lines: BomLine[];
  skus: BomSku[];
}

export async function getFirstLevelBom(materialCode: string, orgId?: string) {
  const { data } = await apiClient.get<BomHeader | null>('/bom/first-level', {
    params: { materialCode, orgId },
  });
  return data;
}

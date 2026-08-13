import { apiClient } from './client';

export interface Material {
  id: string;
  materialCode: string;
  materialName?: string | null;
  organizationId?: string | null;
}

export interface Organization {
  id: string;
  yonOrgId: string;
  orgCode?: string | null;
  orgName?: string | null;
}

export async function searchMaterials(keyword: string) {
  const { data } = await apiClient.get<Material[]>('/materials/search', {
    params: { keyword },
  });
  return data;
}

export async function listOrganizations() {
  const { data } = await apiClient.get<Organization[]>('/materials/organizations');
  return data;
}

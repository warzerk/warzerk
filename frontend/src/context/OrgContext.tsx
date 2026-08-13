import { createContext, useContext, useEffect, useState, type ReactNode } from 'react';
import { listOrganizations, type Organization } from '../api/materials';

interface OrgContextValue {
  organizations: Organization[];
  orgId: string | undefined;
  setOrgId: (orgId: string | undefined) => void;
}

const OrgContext = createContext<OrgContextValue | undefined>(undefined);

export function OrgProvider({ children }: { children: ReactNode }) {
  const [organizations, setOrganizations] = useState<Organization[]>([]);
  const [orgId, setOrgId] = useState<string | undefined>(undefined);

  useEffect(() => {
    listOrganizations()
      .then(setOrganizations)
      .catch(() => setOrganizations([]));
  }, []);

  return (
    <OrgContext.Provider value={{ organizations, orgId, setOrgId }}>
      {children}
    </OrgContext.Provider>
  );
}

export function useOrg() {
  const ctx = useContext(OrgContext);
  if (!ctx) throw new Error('useOrg must be used within OrgProvider');
  return ctx;
}

'use client';

import { createContext, useContext, ReactNode } from 'react';
import { useQuery } from '@apollo/client';
import { GET_MY_ORGANIZATION } from 'graphql/organization';
import { useAuth } from 'contexts/AuthContext';

interface Organization {
  id: string;
  name: string;
  slug: string;
  tier: string;
  settings: Record<string, unknown>;
}

interface OrganizationContextType {
  organization: Organization | null;
  organizationId: string | null;
  loading: boolean;
  error: Error | null;
}

const OrganizationContext = createContext<OrganizationContextType>({
  organization: null,
  organizationId: null,
  loading: true,
  error: null,
});

export function OrganizationProvider({ children }: { children: ReactNode }) {
  const { isAuthenticated } = useAuth();
  const { data, loading, error } = useQuery(GET_MY_ORGANIZATION, {
    skip: !isAuthenticated,
  });

  const organization = data?.myOrganization || null;
  const organizationId = organization?.id || null;

  return (
    <OrganizationContext.Provider
      value={{
        organization,
        organizationId,
        loading,
        error: error || null,
      }}
    >
      {children}
    </OrganizationContext.Provider>
  );
}

export function useOrganization() {
  const context = useContext(OrganizationContext);
  if (context === undefined) {
    throw new Error('useOrganization must be used within an OrganizationProvider');
  }
  return context;
}

'use client';

import { createContext, useContext, ReactNode } from 'react';
import { useUser } from '@auth0/nextjs-auth0/client';

interface AuthContextType {
  user: any | null;
  isLoading: boolean;
  isAuthenticated: boolean;
}

const AuthContext = createContext<AuthContextType>({
  user: null,
  isLoading: true,
  isAuthenticated: false,
});

const isStandalone = process.env.NEXT_PUBLIC_AUTH_MODE === 'standalone';
const devUser = { name: 'Admin', email: 'dev@localhost', sub: 'dev' };

export function AuthProvider({ children }: { children: ReactNode }) {
  // Standalone mode: no Auth0, always authenticated
  if (isStandalone) {
    return (
      <AuthContext.Provider value={{ user: devUser, isLoading: false, isAuthenticated: true }}>
        {children}
      </AuthContext.Provider>
    );
  }

  // Client-cove mode: use Auth0
  // eslint-disable-next-line react-hooks/rules-of-hooks
  const { user, isLoading } = useUser();

  return (
    <AuthContext.Provider value={{ user: user || null, isLoading, isAuthenticated: !!user }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const context = useContext(AuthContext);
  if (context === undefined) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return context;
}

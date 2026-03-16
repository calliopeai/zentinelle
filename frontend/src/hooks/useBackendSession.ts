'use client';

import { useUser } from '@auth0/nextjs-auth0/client';
import { useEffect, useState, useCallback } from 'react';
import { exchangeTokenForSession, getSessionKey, clearSessionKey } from '../utils/session';

const isStandalone = process.env.NEXT_PUBLIC_AUTH_MODE === 'standalone';

// In standalone mode the backend (DEBUG=true) accepts any non-empty token.
const STANDALONE_TOKEN = 'standalone-dev';

/**
 * Manages the backend Django session.
 *
 * Standalone mode (NEXT_PUBLIC_AUTH_MODE=standalone): skips Auth0 entirely,
 * uses a fixed dev token that the backend accepts in DEBUG mode.
 *
 * Client-cove mode: exchanges an Auth0 access token for a Django session key.
 */
export function useBackendSession() {
  // Standalone: skip Auth0 entirely
  if (isStandalone) {
    return {
      user: { name: 'Admin', email: 'dev@localhost' },
      sessionKey: STANDALONE_TOKEN,
      isLoading: false,
      isAuthenticated: true,
      error: null,
      refreshSession: async () => {},
      clearSession: () => {},
    };
  }

  // Client-cove mode: Auth0 → Django session exchange
  // eslint-disable-next-line react-hooks/rules-of-hooks
  const { user, isLoading: isAuth0Loading, error: auth0Error } = useUser();
  // eslint-disable-next-line react-hooks/rules-of-hooks
  const [sessionKey, setSessionKey] = useState<string | null>(null);
  // eslint-disable-next-line react-hooks/rules-of-hooks
  const [isLoading, setIsLoading] = useState(true);
  // eslint-disable-next-line react-hooks/rules-of-hooks
  const [error, setError] = useState<Error | null>(null);

  // eslint-disable-next-line react-hooks/rules-of-hooks
  const refreshSession = useCallback(async () => {
    if (!user) {
      clearSessionKey();
      setSessionKey(null);
      setIsLoading(false);
      return;
    }

    const existingSession = getSessionKey();
    if (existingSession) {
      setSessionKey(existingSession);
      setIsLoading(false);
      return;
    }

    try {
      setIsLoading(true);
      setError(null);

      const tokenResponse = await fetch('/zentinelle/api/auth/token');
      if (!tokenResponse.ok) throw new Error('Failed to get access token');

      const tokenData = await tokenResponse.json();
      const newSessionKey = await exchangeTokenForSession({
        access_token: tokenData.accessToken,
        id_token: tokenData.idToken,
        token_type: 'Bearer',
      });

      if (newSessionKey) {
        setSessionKey(newSessionKey);
      } else {
        throw new Error('Failed to exchange token for session');
      }
    } catch (err) {
      console.error('Session exchange error:', err);
      setError(err instanceof Error ? err : new Error('Unknown error'));
    } finally {
      setIsLoading(false);
    }
  }, [user]);

  // eslint-disable-next-line react-hooks/rules-of-hooks
  useEffect(() => {
    if (!isAuth0Loading) refreshSession();
  }, [user, isAuth0Loading, refreshSession]);

  return {
    user,
    sessionKey,
    isLoading: isAuth0Loading || isLoading,
    isAuthenticated: !!user && !!sessionKey,
    error: auth0Error || error,
    refreshSession,
    clearSession: () => {
      clearSessionKey();
      setSessionKey(null);
    },
  };
}

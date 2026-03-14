'use client';

import { useUser } from '@auth0/nextjs-auth0/client';
import { useEffect, useState, useCallback } from 'react';
import { exchangeTokenForSession, getSessionKey, clearSessionKey, hasSession } from '../utils/session';

/**
 * Hook to manage backend Django session from Auth0 authentication.
 *
 * When the user is authenticated with Auth0, this hook will automatically
 * exchange the Auth0 token for a Django session key.
 */
export function useBackendSession() {
  const { user, isLoading: isAuth0Loading, error: auth0Error } = useUser();
  const [sessionKey, setSessionKey] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<Error | null>(null);

  const refreshSession = useCallback(async () => {
    if (!user) {
      clearSessionKey();
      setSessionKey(null);
      setIsLoading(false);
      return;
    }

    // Check if we already have a valid session
    const existingSession = getSessionKey();
    if (existingSession) {
      setSessionKey(existingSession);
      setIsLoading(false);
      return;
    }

    // Fetch access token from our API route and exchange for session
    try {
      setIsLoading(true);
      setError(null);

      // Fetch the access token from our Next.js API route
      const tokenResponse = await fetch('/zentinelle/api/auth/token');
      if (!tokenResponse.ok) {
        throw new Error('Failed to get access token');
      }

      const tokenData = await tokenResponse.json();

      // Exchange for Django session
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

  useEffect(() => {
    if (!isAuth0Loading) {
      refreshSession();
    }
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

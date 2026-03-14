/**
 * Session management utilities for exchanging Auth0 tokens with backend Django sessions.
 */

const SESSION_STORAGE_KEY = 'django_session_key';

// API base URL for the Zentinelle backend service
const BACKEND_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost/api/zentinelle';

/**
 * Exchange an Auth0 access token for a Django session key.
 */
export async function exchangeTokenForSession(auth0Token: {
  access_token: string;
  id_token?: string;
  token_type?: string;
  expires_in?: number;
}): Promise<string | null> {
  try {
    const response = await fetch(`${BACKEND_URL}/auth1/session`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(auth0Token),
      credentials: 'include',
    });

    if (!response.ok) {
      console.error('Failed to exchange token for session:', response.status);
      return null;
    }

    const data = await response.json();
    // Response format: { "Authorization": "Session <session_key>" }
    const authHeader = data.Authorization;
    if (authHeader && authHeader.startsWith('Session ')) {
      const sessionKey = authHeader.substring(8);
      // Store session key
      if (typeof window !== 'undefined') {
        sessionStorage.setItem(SESSION_STORAGE_KEY, sessionKey);
      }
      return sessionKey;
    }

    return null;
  } catch (error) {
    console.error('Error exchanging token for session:', error);
    return null;
  }
}

/**
 * Get the current Django session key from storage.
 */
export function getSessionKey(): string | null {
  if (typeof window === 'undefined') {
    return null;
  }
  return sessionStorage.getItem(SESSION_STORAGE_KEY);
}

/**
 * Clear the stored session key and invalidate the backend session.
 */
export async function clearSessionKey(): Promise<void> {
  if (typeof window === 'undefined') {
    return;
  }

  const sessionKey = sessionStorage.getItem(SESSION_STORAGE_KEY);

  // Clear local storage first
  sessionStorage.removeItem(SESSION_STORAGE_KEY);

  // Invalidate the backend session if we had one
  if (sessionKey) {
    try {
      await fetch(`${BACKEND_URL}/auth1/invalidate`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Session ${sessionKey}`,
        },
        credentials: 'include',
      });
      console.log('[Session] Backend session invalidated');
    } catch (error) {
      // Don't block logout if invalidation fails
      console.warn('[Session] Failed to invalidate backend session:', error);
    }
  }
}

/**
 * Check if we have a valid session.
 */
export function hasSession(): boolean {
  return !!getSessionKey();
}

import { getSession } from '@auth0/nextjs-auth0';
import { NextResponse } from 'next/server';
import { cookies } from 'next/headers';

/**
 * Debug endpoint to get session info for any authenticated user.
 * Returns session details and cookie info for testing/debugging.
 */
export async function GET() {
  try {
    const session = await getSession();

    if (!session?.user) {
      return NextResponse.json(
        { error: 'Not authenticated' },
        { status: 401 }
      );
    }

    // Get cookies for debugging
    const cookieStore = await cookies();
    const allCookies = cookieStore.getAll();

    // Find the appSession cookie (Auth0 session)
    // Auth0 chunks large cookies into appSession.0, appSession.1, etc.
    const appSessionCookie = allCookies.find(c => c.name === 'appSession');

    // Handle chunked cookies
    let appSessionValue = appSessionCookie?.value || null;
    if (!appSessionValue) {
      // Look for chunked cookies and combine them
      const chunkedCookies = allCookies
        .filter(c => c.name.startsWith('appSession.'))
        .sort((a, b) => a.name.localeCompare(b.name));

      if (chunkedCookies.length > 0) {
        appSessionValue = chunkedCookies.map(c => c.value).join('');
      }
    }

    const email = session.user.email || '';
    const domain = email.split('@')[1]?.toLowerCase() || '';

    return NextResponse.json({
      user: {
        email: session.user.email,
        name: session.user.name,
        sub: session.user.sub,
      },
      session: {
        accessTokenExpiresAt: session.accessTokenExpiresAt,
      },
      cookies: {
        appSession: appSessionValue,
        allCookieNames: allCookies.map(c => c.name),
      },
      debug: {
        timestamp: new Date().toISOString(),
        domain,
      },
    });
  } catch (error) {
    console.error('Error in auth debug:', error);
    return NextResponse.json(
      { error: 'Failed to get session info' },
      { status: 500 }
    );
  }
}

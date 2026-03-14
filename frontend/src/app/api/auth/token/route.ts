import { getAccessToken, withApiAuthRequired } from '@auth0/nextjs-auth0';
import { NextResponse } from 'next/server';

/**
 * API route to get the Auth0 access token for the current user.
 * This is used to exchange for a Django backend session.
 */
export const GET = withApiAuthRequired(async function handler() {
  try {
    const { accessToken } = await getAccessToken();

    if (!accessToken) {
      return NextResponse.json(
        { error: 'No access token available' },
        { status: 401 }
      );
    }

    return NextResponse.json({
      accessToken,
    });
  } catch (error) {
    console.error('Error getting access token:', error);
    return NextResponse.json(
      { error: 'Failed to get access token' },
      { status: 500 }
    );
  }
});

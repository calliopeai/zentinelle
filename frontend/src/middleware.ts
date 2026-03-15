import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';

// Dev mode: bypass auth so the UI can be tested locally without Auth0 credentials
export function middleware(_request: NextRequest) {
  return NextResponse.next();
}

export const config = {
  matcher: [
    '/((?!api/auth|api/health|_next/static|_next/image|favicon.ico|img/).*)',
  ],
};

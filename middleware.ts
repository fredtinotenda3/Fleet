// middleware.ts
// Updated with API versioning support + custom access-token auth (Option A)

import { NextRequest, NextResponse } from 'next/server';
import { getToken } from 'next-auth/jwt';
import { Role } from '@/server/permissions/roles';
import { applySecurityHeaders } from '@/infrastructure/security/security-headers';
import {
  verifyAccessTokenEdge,
  ACCESS_TOKEN_COOKIE_NAME,
} from '@/infrastructure/security/edge-token-verify';
import {
  isVersionedApiPath,
  rewriteVersionedPath,
  getVersionFromPath,
  buildVersionHeaders,
} from '@/server/api-versioning/version-headers';
import { isVersionActive } from '@/server/api-versioning/version-registry';

/**
 * Edge middleware handles:
 * 1. Authentication/authorization for page routes
 * 2. Security headers for all responses
 * 3. API version URL rewriting (v1/v2 -> /api)
 * 4. API version rejection for retired versions
 *
 * FIX (auth-model mismatch -- login loop): this app's real login flow
 * (frontend/modules/auth/hooks/useAuth.ts -> POST /api/auth/token) never
 * calls NextAuth's signIn(), so it never creates the NextAuth session
 * cookie. This middleware used to be wrapped in next-auth/middleware's
 * withAuth() and gated purely on `!!token` from getToken() -- which is
 * ONLY ever populated by a NextAuth cookie session. Every login through
 * the custom token system therefore looked "unauthenticated" to
 * middleware even though /api/auth/token had returned a valid access/
 * refresh token pair, causing an immediate bounce back to
 * /auth/login?callbackUrl=... on every attempt to reach a protected
 * page.
 *
 * Fix: middleware now verifies the custom access token directly (set
 * as an httpOnly cookie by token.controller.ts on login/refresh -- see
 * ACCESS_TOKEN_COOKIE_NAME), which is the credential this app's login
 * flow actually issues. The NextAuth session check is kept as a
 * secondary fallback so any code path that *does* still go through
 * NextAuth's signIn() (e.g. an SSO provider) keeps working unchanged.
 */
async function resolveAuth(req: NextRequest): Promise<{
  authenticated: boolean;
  roles: string[];
  tenantId?: string;
}> {
  const accessTokenCookie = req.cookies.get(ACCESS_TOKEN_COOKIE_NAME)?.value;

  if (accessTokenCookie) {
    const verified = await verifyAccessTokenEdge(accessTokenCookie);
    if (verified) {
      return { authenticated: true, roles: verified.roles, tenantId: verified.tenantId };
    }
    // Fall through to NextAuth check below -- an expired/invalid
    // custom cookie shouldn't block a still-valid NextAuth session.
  }

  const nextAuthToken = await getToken({ req, secret: process.env.NEXTAUTH_SECRET });
  if (nextAuthToken) {
    return {
      authenticated: true,
      roles: (nextAuthToken as any)?.roles || [],
      tenantId: (nextAuthToken as any)?.tenantId,
    };
  }

  return { authenticated: false, roles: [] };
}

function isPublicPath(path: string): boolean {
  return path.startsWith('/auth/') || path === '/';
}

export default async function middleware(req: NextRequest) {
  const path = req.nextUrl.pathname;

  // --- API Versioning (unchanged, runs before auth) -----------------

  if (isVersionedApiPath(path)) {
    const version = getVersionFromPath(path);

    if (version) {
      if (!isVersionActive(version)) {
        const response = NextResponse.json(
          {
            success: false,
            error: {
              code: 'VERSION_RETIRED',
              message: `API version "${version}" has been retired`,
            },
            meta: { timestamp: new Date().toISOString() },
          },
          { status: 410 }
        );
        return applySecurityHeaders(response);
      }

      const rewrittenPath = rewriteVersionedPath(path);
      const url = req.nextUrl.clone();
      url.pathname = rewrittenPath;

      const response = NextResponse.rewrite(url);

      const versionHeaders = buildVersionHeaders(version);
      for (const [key, value] of Object.entries(versionHeaders)) {
        if (value == null) continue;
        response.headers.set(key, String(value));
      }

      return applySecurityHeaders(response);
    }
  }

  // --- Auth / Authorization ------------------------------------------

  if (isPublicPath(path)) {
    return applySecurityHeaders(NextResponse.next());
  }

  const { authenticated, roles } = await resolveAuth(req);

  if (!authenticated) {
    if (path.startsWith('/api/')) {
      const response = NextResponse.json(
        {
          success: false,
          error: { code: 'UNAUTHORIZED', message: 'Authentication required' },
          meta: { timestamp: new Date().toISOString() },
        },
        { status: 401 }
      );
      return applySecurityHeaders(response);
    }

    const signInUrl = new URL('/auth/login', req.url);
    signInUrl.searchParams.set('callbackUrl', path);
    return applySecurityHeaders(NextResponse.redirect(signInUrl));
  }

  const isSuperAdmin =
    roles.includes(Role.SUPER_ADMIN) || roles.includes(Role.ORGANIZATION_OWNER);

  const isAdminPath = path.startsWith('/admin');
  if (isAdminPath && !roles.includes(Role.FLEET_MANAGER) && !isSuperAdmin) {
    return applySecurityHeaders(NextResponse.redirect(new URL('/dashboard', req.url)));
  }

  return applySecurityHeaders(NextResponse.next());
}

export const config = {
  matcher: [
    '/((?!_next/static|_next/image|favicon\\.ico|.*\\.(?:png|jpg|jpeg|svg|webp|ico)$|auth/|api/(?!v\\d+/).*).*)',
    '/api/v1/:path*',
    '/api/v2/:path*',
  ],
};
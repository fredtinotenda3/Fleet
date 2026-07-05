// middleware.ts
// Updated with API versioning support

import { withAuth } from 'next-auth/middleware';
import { NextResponse } from 'next/server';
import { Role } from '@/server/permissions/roles';
import { applySecurityHeaders } from '@/infrastructure/security/security-headers';
import {
  isVersionedApiPath,
  rewriteVersionedPath,
  getVersionFromPath,
} from '@/server/api-versioning/version-headers';
import { isVersionActive } from '@/server/api-versioning/version-registry';

/**
 * Edge middleware handles:
 * 1. Authentication/authorization for page routes
 * 2. Security headers for all responses
 * 3. API version URL rewriting (v1/v2 → /api)
 * 4. API version rejection for retired versions
 */
export default withAuth(
  function middleware(req) {
    const token = req.nextauth.token;
    const path = req.nextUrl.pathname;

    const roles: string[] = (token as any)?.roles || [];
    const isSuperAdmin =
      roles.includes(Role.SUPER_ADMIN) ||
      roles.includes(Role.ORGANIZATION_OWNER);

    // ─── API Versioning ─────────────────────────────────────────────────────

    if (isVersionedApiPath(path)) {
      const version = getVersionFromPath(path);

      if (version) {
        // Reject retired versions
        if (!isVersionActive(version)) {
          const response = NextResponse.json(
            {
              success: false,
              error: {
                code: 'VERSION_RETIRED',
                message: `API version "${version}" has been retired`,
              },
              meta: {
                timestamp: new Date().toISOString(),
              },
            },
            { status: 410 }
          );

          return applySecurityHeaders(response);
        }

        // Rewrite versioned path
        const rewrittenPath = rewriteVersionedPath(path);
        const url = req.nextUrl.clone();
        url.pathname = rewrittenPath;

        const response = NextResponse.rewrite(url);

        // Core header
        response.headers.set('X-API-Version', version);

        // Safe dynamic import (Edge-compatible alternative to require)
        import('@/server/api-versioning/version-headers').then(
          ({ buildVersionHeaders }) => {
            const headers = buildVersionHeaders(version);

            for (const [key, value] of Object.entries(headers)) {
              if (value == null) continue;

              response.headers.set(
                key,
                String(value) // ✅ FIX: ensure string type
              );
            }
          }
        );

        return applySecurityHeaders(response);
      }
    }

    // ─── Auth / Authorization ───────────────────────────────────────────────

    const isAdminPath = path.startsWith('/admin');

    if (
      isAdminPath &&
      !roles.includes(Role.FLEET_MANAGER) &&
      !isSuperAdmin
    ) {
      return applySecurityHeaders(
        NextResponse.redirect(new URL('/dashboard', req.url))
      );
    }

    return applySecurityHeaders(NextResponse.next());
  },
  {
    callbacks: {
      authorized: ({ token }) => !!token,
    },
    pages: {
      signIn: '/auth/login',
    },
  }
);

export const config = {
  matcher: [
    '/((?!_next/static|_next/image|favicon\\.ico|.*\\.(?:png|jpg|jpeg|svg|webp|ico)$|auth/|api/(?!v\\d+/).*).*)',
    '/api/v1/:path*',
    '/api/v2/:path*',
  ],
};
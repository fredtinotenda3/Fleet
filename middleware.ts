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
 * FIX (critical -- middleware consistency): version headers used to be
 * applied via a fire-and-forget `import('...').then(...)` that mutated
 * `response.headers` AFTER `applySecurityHeaders(response)` had already
 * returned the response object. In Edge middleware, headers set once a
 * response has been handed back are not reliably attached -- only the
 * synchronously-set `X-API-Version` actually reached clients, while every
 * Sunset/Deprecation-related header from buildVersionHeaders() silently
 * never made it out. buildVersionHeaders is now imported statically (it
 * has no Node-only dependencies -- it's pure string/date formatting) and
 * applied synchronously, same as every other header in this function.
 */
export default withAuth(
  function middleware(req) {
    const token = req.nextauth.token;
    const path = req.nextUrl.pathname;

    const roles: string[] = (token as any)?.roles || [];
    const isSuperAdmin =
      roles.includes(Role.SUPER_ADMIN) ||
      roles.includes(Role.ORGANIZATION_OWNER);

    // --- API Versioning ---------------------------------------------

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

        // Stamp every version header synchronously, before the response
        // is returned -- this is the fix. No async import, no .then().
        const versionHeaders = buildVersionHeaders(version);
        for (const [key, value] of Object.entries(versionHeaders)) {
          if (value == null) continue;
          response.headers.set(key, String(value));
        }

        return applySecurityHeaders(response);
      }
    }

    // --- Auth / Authorization ----------------------------------------

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
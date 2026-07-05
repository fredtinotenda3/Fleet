
// server/api-versioning/version-middleware.ts
// Node-runtime middleware for version handling

import { NextRequest, NextResponse } from 'next/server';
import { resolveVersion, VersionResolutionError } from './version-resolver';
import { buildVersionHeaders } from './version-headers';
import { VERSION_HEADER } from './version-headers';
import { errorResponse } from '@/server/utils/response.utils';

/**
 * Middleware that resolves the API version and stamps response headers.
 * This runs in Node runtime (not Edge) and should be used inside withAuth()
 * or as a standalone wrapper for routes that don't use withAuth().
 */
export async function withVersioning<T = unknown>(
  req: NextRequest,
  handler: (req: NextRequest, version: string) => Promise<NextResponse<T>>
): Promise<NextResponse<T>> {
  try {
    const result = resolveVersion(req);
    const response = await handler(req, result.versionString);

    const headers = buildVersionHeaders(result.versionString);
    for (const [key, value] of Object.entries(headers)) {
      response.headers.set(key, value);
    }

    if (result.isSunset && result.sunsetDate) {
      response.headers.set(
        'Warning',
        `299 - "This API version will be sunset on ${result.sunsetDate.toISOString()}"`
      );
    }

    if (result.isDeprecated) {
      response.headers.set('Warning', '299 - "This API version is deprecated"');
    }

    return response;
  } catch (error) {
    if (error instanceof VersionResolutionError) {
      return errorResponse(error.message, error.code, error.statusCode) as NextResponse<T>;
    }
    throw error;
  }
}

/**
 * Convenience wrapper for routes that need versioning but not auth.
 *
 * Accepts handlers with any number of additional trailing arguments (e.g.
 * the `{ params }` context object Next.js passes to dynamic route
 * handlers) and forwards them through untouched, after `req` and the
 * resolved `version` string. This lets dynamic routes like
 * `app/api/version/[version]/route.ts` keep their `{ params }` argument
 * while still going through version resolution.
 */
export function withApiVersion<T = unknown, A extends unknown[] = []>(
  handler: (req: NextRequest, version: string, ...args: A) => Promise<NextResponse<T>>
) {
  return async (req: NextRequest, ...args: A): Promise<NextResponse<T>> => {
    return withVersioning(req, (innerReq, version) => handler(innerReq, version, ...args));
  };
}

/**
 * Middleware that resolves version from the request and stores it in
 * the request context for downstream use (e.g., version-specific logic).
 */
export async function resolveVersionForRequest(req: NextRequest): Promise<string> {
  try {
    const result = resolveVersion(req);
    return result.versionString;
  } catch {
    const { DEFAULT_VERSION } = await import('./version-registry');
    return DEFAULT_VERSION.version;
  }
}

/**
 * Get the version from a request's headers (stamped by middleware).
 */
export function getRequestVersion(req: NextRequest): string | null {
  return req.headers.get(VERSION_HEADER) || null;
}
// server/api-versioning/version-headers.ts
// Edge-safe header utilities (no external dependencies)

import { API_VERSIONS, LATEST_VERSION, getSunsetDate, isVersionDeprecated, isVersionSunset } from './version-registry';

export const VERSION_HEADER = 'X-API-Version';
export const DEPRECATION_HEADER = 'Deprecation';
export const SUNSET_HEADER = 'Sunset';
export const LINK_HEADER = 'Link';

/**
 * Build version-specific response headers for a given version.
 * This is Edge-safe (no Node.js dependencies).
 */
export function buildVersionHeaders(version: string): Record<string, string> {
  const headers: Record<string, string> = {};

  // Always include the version header
  headers[VERSION_HEADER] = version;

  // Include deprecation warning if applicable
  if (isVersionDeprecated(version)) {
    headers[DEPRECATION_HEADER] = 'true';
  }

  // Include sunset header with date if applicable
  if (isVersionSunset(version)) {
    const sunsetDate = getSunsetDate(version);
    if (sunsetDate) {
      headers[SUNSET_HEADER] = sunsetDate.toUTCString();
    }
  }

  // Include link to latest version (RFC 8288)
  headers[LINK_HEADER] = `<${LATEST_VERSION.version}>; rel="latest-version"`;

  return headers;
}

/**
 * Parse version from request headers (Accept or X-API-Version).
 * Edge-safe (no Node.js dependencies).
 */
export function parseVersionFromHeaders(
  headers: Headers
): string | null {
  // Prefer X-API-Version header
  const apiVersion = headers.get(VERSION_HEADER);
  if (apiVersion) {
    return apiVersion;
  }

  // Fall back to Accept header with version media type
  const accept = headers.get('accept');
  if (accept) {
    const match = accept.match(/application\/vnd\.fleet\.v(\d+)\+json/);
    if (match) {
      return `v${match[1]}`;
    }
  }

  return null;
}

/**
 * Parse version from URL path prefix.
 * Edge-safe (no Node.js dependencies).
 */
export function parseVersionFromPath(pathname: string): string | null {
  const match = pathname.match(/^\/api\/(v\d+)\//);
  if (match) {
    return match[1];
  }
  return null;
}

/**
 * Check if a path has an API version prefix.
 * Edge-safe (no Node.js dependencies).
 */
export function hasVersionPrefix(pathname: string): boolean {
  return /^\/api\/v\d+\//.test(pathname);
}

/**
 * Rewrite a versioned path to its target path.
 * Edge-safe (no Node.js dependencies).
 */
export function rewriteVersionedPath(pathname: string): string {
  const match = pathname.match(/^\/api\/v\d+(.*)$/);
  if (match) {
    return `/api${match[1] || ''}`;
  }
  return pathname;
}

/**
 * Get the version from a versioned path.
 * Edge-safe (no Node.js dependencies).
 */
export function getVersionFromPath(pathname: string): string | null {
  const match = pathname.match(/^\/api\/(v\d+)\//);
  if (match) {
    return match[1];
  }
  return null;
}

/**
 * Check if a path is a versioned API path.
 * Edge-safe (no Node.js dependencies).
 */
export function isVersionedApiPath(pathname: string): boolean {
  return /^\/api\/v\d+/.test(pathname);
}
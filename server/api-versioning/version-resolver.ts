/* eslint-disable @typescript-eslint/no-unused-vars */
// server/api-versioning/version-resolver.ts
// Node-runtime version resolution with metrics and error handling

import { NextRequest } from 'next/server';
import {
  API_VERSIONS,
  VERSION_MAP,
  DEFAULT_VERSION,
  LATEST_VERSION,
  isVersionActive,
  isVersionDeprecated,
  isVersionSunset,
  getSunsetDate,
  ApiVersionDefinition,
} from './version-registry';
import {
  parseVersionFromHeaders,
  parseVersionFromPath,
  VERSION_HEADER,
} from './version-headers';
import { metricsRegistry } from '@/infrastructure/observability/metrics.registry';

export interface VersionResolutionResult {
  version: ApiVersionDefinition;
  isDeprecated: boolean;
  isSunset: boolean;
  sunsetDate?: Date | null;
  versionString: string;
  isDefaultFallback: boolean;
}

export class VersionResolutionError extends Error {
  public readonly statusCode: number;
  public readonly code: string;

  constructor(message: string, code: string, statusCode: number = 404) {
    super(message);
    this.name = 'VersionResolutionError';
    this.code = code;
    this.statusCode = statusCode;
  }
}

/**
 * Resolves the API version from a request, with metrics tracking.
 * This runs in Node runtime (not Edge) because it uses prom-client.
 */
export function resolveVersion(
  req: NextRequest
): VersionResolutionResult {
  const pathname = req.nextUrl.pathname;
  const headers = req.headers;

  let versionStr = parseVersionFromPath(pathname);

  if (!versionStr) {
    versionStr = parseVersionFromHeaders(headers);
  }

  let isDefaultFallback = false;
  if (!versionStr) {
    versionStr = DEFAULT_VERSION.version;
    isDefaultFallback = true;
  }

  const version = VERSION_MAP.get(versionStr);
  if (!version) {
    metricsRegistry.observeGeneric('api_version_unknown', 1, { tag1: versionStr });
    throw new VersionResolutionError(
      `API version "${versionStr}" is not supported`,
      'VERSION_NOT_FOUND',
      404
    );
  }

  if (!isVersionActive(versionStr)) {
    throw new VersionResolutionError(
      `API version "${versionStr}" has been retired`,
      'VERSION_RETIRED',
      410
    );
  }

  metricsRegistry.observeGeneric('api_version_usage', 1, {
    tag1: versionStr,
    tag2: version.status,
  });

  if (isDefaultFallback) {
    metricsRegistry.observeGeneric('api_version_default_fallback', 1, { tag1: versionStr });
  }

  return {
    version,
    isDeprecated: isVersionDeprecated(versionStr),
    isSunset: isVersionSunset(versionStr),
    sunsetDate: getSunsetDate(versionStr),
    versionString: versionStr,
    isDefaultFallback,
  };
}

export function validateVersion(versionStr: string): ApiVersionDefinition {
  const version = VERSION_MAP.get(versionStr);
  if (!version) {
    throw new VersionResolutionError(
      `API version "${versionStr}" is not supported`,
      'VERSION_NOT_FOUND',
      404
    );
  }
  if (!isVersionActive(versionStr)) {
    throw new VersionResolutionError(
      `API version "${versionStr}" has been retired`,
      'VERSION_RETIRED',
      410
    );
  }
  return version;
}

export function getActiveVersions(): ApiVersionDefinition[] {
  return API_VERSIONS.filter((v) => isVersionActive(v.version));
}

export function getVersionInfo(
  versionStr: string
): {
  version: string;
  status: string;
  deprecated: boolean;
  sunset?: string;
  latest: string;
} {
  const def = VERSION_MAP.get(versionStr);
  if (!def) {
    return {
      version: versionStr,
      status: 'unknown',
      deprecated: false,
      latest: LATEST_VERSION.version,
    };
  }
  return {
    version: def.version,
    status: def.status,
    deprecated: isVersionDeprecated(versionStr),
    sunset: isVersionSunset(versionStr) ? getSunsetDate(versionStr)?.toISOString() : undefined,
    latest: LATEST_VERSION.version,
  };
}
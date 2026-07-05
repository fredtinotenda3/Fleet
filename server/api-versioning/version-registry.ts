// server/api-versioning/version-registry.ts
// Single source of truth for all API versions

export interface ApiVersionDefinition {
  /** The version identifier (e.g., 'v1', 'v2') */
  version: string;
  /** Human-readable label */
  label: string;
  /** Current lifecycle status */
  status: 'active' | 'deprecated' | 'sunset' | 'retired';
  /** Optional sunset date (ISO string) - when status becomes 'sunset' */
  sunsetDate?: string;
  /** Optional deprecation date (ISO string) - when status becomes 'deprecated' */
  deprecatedDate?: string;
  /** Optional retirement date (ISO string) - when status becomes 'retired' */
  retiredDate?: string;
  /** The base path for this version (e.g., '/api/v1') */
  path: string;
  /** The target internal path (e.g., '/api') for rewriting */
  targetPath: string;
  /** Whether this version is the default for unprefixed requests */
  isDefault: boolean;
  /** Whether this version is the latest stable version */
  isLatest: boolean;
}

export const API_VERSIONS: ApiVersionDefinition[] = [
  {
    version: 'v1',
    label: 'Version 1',
    status: 'active',
    path: '/api/v1',
    targetPath: '/api',
    isDefault: true,
    isLatest: false,
  },
  {
    version: 'v2',
    label: 'Version 2',
    status: 'active',
    path: '/api/v2',
    targetPath: '/api',
    isDefault: false,
    isLatest: true,
  },
  // Future versions can be added here
  // {
  //   version: 'v3',
  //   label: 'Version 3',
  //   status: 'active',
  //   path: '/api/v3',
  //   targetPath: '/api',
  //   isDefault: false,
  //   isLatest: false,
  // },
];

/** Version string to definition map for O(1) lookup */
export const VERSION_MAP = new Map<string, ApiVersionDefinition>(
  API_VERSIONS.map((def) => [def.version, def])
);

/** Version path to definition map for prefix matching */
export const VERSION_PATH_MAP = new Map<string, ApiVersionDefinition>(
  API_VERSIONS.map((def) => [def.path, def])
);

/** All version paths for middleware matching */
export const VERSION_PATHS = API_VERSIONS.map((def) => def.path);

/** The default version for unprefixed requests */
export const DEFAULT_VERSION = API_VERSIONS.find((v) => v.isDefault)!;

/** The latest version for version headers */
export const LATEST_VERSION = API_VERSIONS.find((v) => v.isLatest)!;

/** Active versions (not sunset/retired) */
export const ACTIVE_VERSIONS = API_VERSIONS.filter(
  (v) => v.status === 'active' || v.status === 'deprecated'
);

/** Check if a version is valid and not retired */
export function isVersionActive(version: string): boolean {
  const def = VERSION_MAP.get(version);
  if (!def) return false;
  return def.status !== 'retired';
}

/** Check if a version is deprecated */
export function isVersionDeprecated(version: string): boolean {
  const def = VERSION_MAP.get(version);
  if (!def) return false;
  return def.status === 'deprecated';
}

/** Check if a version is sunset (will be retired soon) */
export function isVersionSunset(version: string): boolean {
  const def = VERSION_MAP.get(version);
  if (!def) return false;
  return def.status === 'sunset';
}

/** Get the sunset date for a version, if any */
export function getSunsetDate(version: string): Date | null {
  const def = VERSION_MAP.get(version);
  if (!def || !def.sunsetDate) return null;
  return new Date(def.sunsetDate);
}

/** Get the default version */
export function getDefaultVersion(): ApiVersionDefinition {
  return DEFAULT_VERSION;
}

/** Get the latest version */
export function getLatestVersion(): ApiVersionDefinition {
  return LATEST_VERSION;
}
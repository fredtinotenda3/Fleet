// app/api/version/route.ts
// Public endpoint to discover available API versions

import { NextRequest } from 'next/server';
import { API_VERSIONS, ACTIVE_VERSIONS, LATEST_VERSION, DEFAULT_VERSION } from '@/server/api-versioning/version-registry';
import { successResponse } from '@/server/utils/response.utils';
import { withApiVersion } from '@/server/api-versioning/version-middleware';

interface VersionInfo {
  current: string;
  latest: string;
  default: string;
  versions: Array<{
    version: string;
    status: string;
    deprecated: boolean;
    sunset?: string;
    path: string;
  }>;
}

export const GET = withApiVersion(async (req: NextRequest, version: string) => {
  const now = new Date();

  const versions = API_VERSIONS.map((v) => ({
    version: v.version,
    status: v.status,
    deprecated: v.status === 'deprecated',
    sunset: v.sunsetDate || undefined,
    path: v.path,
  }));

  const data: VersionInfo = {
    current: version,
    latest: LATEST_VERSION.version,
    default: DEFAULT_VERSION.version,
    versions,
  };

  return successResponse(data);
});
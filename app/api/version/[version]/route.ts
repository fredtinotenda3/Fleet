// app/api/version/[version]/route.ts
// Endpoint to get details about a specific version

import { NextRequest } from 'next/server';
import { VERSION_MAP, isVersionActive, isVersionDeprecated, isVersionSunset, getSunsetDate } from '@/server/api-versioning/version-registry';
import { successResponse, errorResponse } from '@/server/utils/response.utils';
import { withApiVersion } from '@/server/api-versioning/version-middleware';

interface RouteParams {
  params: Promise<{ version: string }>;
}

export const GET = withApiVersion(
  async (req: NextRequest, currentVersion: string, { params }: RouteParams): Promise<any> => {
    const { version } = await params;
    const def = VERSION_MAP.get(version);

    if (!def) {
      return errorResponse(`Version "${version}" not found`, 'VERSION_NOT_FOUND', 404);
    }

    const data = {
      version: def.version,
      label: def.label,
      status: def.status,
      path: def.path,
      deprecated: isVersionDeprecated(version),
      sunset: isVersionSunset(version) ? getSunsetDate(version)?.toISOString() : null,
      retired: !isVersionActive(version),
      isDefault: def.isDefault,
      isLatest: def.isLatest,
    };

    return successResponse(data);
  }
);
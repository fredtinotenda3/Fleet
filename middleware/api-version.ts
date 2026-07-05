// middleware/api-version.ts

import { NextRequest, NextResponse } from 'next/server';

export const API_VERSIONS = {
  v1: '/api/v1',
  v2: '/api/v2',
  latest: '/api/v2',
} as const;

export function getApiVersion(req: NextRequest): string {
  const path = req.nextUrl.pathname;
  if (path.startsWith('/api/v2')) return 'v2';
  if (path.startsWith('/api/v1')) return 'v1';
  if (path.startsWith('/api')) return 'v1'; // Legacy default
  return 'unknown';
}

export function withApiVersion(
  handler: (
    req: NextRequest,
    version: string
  ) => Promise<NextResponse>
) {
  return async (req: NextRequest): Promise<NextResponse> => {
    const version = getApiVersion(req);
    const response = await handler(req, version);

    response.headers.set('X-API-Version', version);
    response.headers.set(
      'X-API-Version-Latest',
      API_VERSIONS.latest
    );

    return response;
  };
}

async function handleV1(_req: NextRequest): Promise<NextResponse> {
  return NextResponse.json({ version: 'v1', data: {} });
}

async function handleV2(_req: NextRequest): Promise<NextResponse> {
  return NextResponse.json({ version: 'v2', data: {} });
}

export async function versionedApiHandler(
  req: NextRequest
): Promise<NextResponse> {
  const version = getApiVersion(req);

  switch (version) {
    case 'v1':
      return handleV1(req);
    case 'v2':
      return handleV2(req);
    default:
      return NextResponse.json(
        {
          error: {
            code: 'VERSION_NOT_FOUND',
            message: 'API version not found',
          },
        },
        { status: 404 }
      );
  }
}
// middleware/performance.ts

import { NextRequest, NextResponse } from 'next/server';
import { monitoring } from '@/infrastructure/monitoring/logger';

export function addPerformanceHeaders(
  response: NextResponse,
  startTime: number,
  path?: string
): NextResponse {
  const duration = Date.now() - startTime;

  response.headers.set('X-Response-Time', `${duration}ms`);

  monitoring
    .trackMetric('api.response_time', duration, {
      path: path || 'unknown',
      status: response.status.toString(),
    })
    .catch(() => {
      // Non-blocking — metric tracking must never break the request
    });

  return response;
}

export async function withPerformanceTracking(
  req: NextRequest,
  handler: (req: NextRequest) => Promise<NextResponse>
): Promise<NextResponse> {
  const startTime = Date.now();
  const response = await handler(req);
  return addPerformanceHeaders(
    response,
    startTime,
    req.nextUrl.pathname
  );
}
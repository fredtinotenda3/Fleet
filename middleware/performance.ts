// middleware/performance.ts

import { NextRequest, NextResponse } from 'next/server';
import { monitoring } from '@/infrastructure/monitoring/logger';

export async function performanceMiddleware(req: NextRequest): Promise<NextResponse | null> {
  const startTime = Date.now();
  
  // Add request ID header
  const requestId = crypto.randomUUID();
  
  // Store start time in request context
  (req as any).startTime = startTime;
  (req as any).requestId = requestId;
  
  return null;
}

export function addPerformanceHeaders(response: NextResponse, startTime: number): NextResponse {
  const duration = Date.now() - startTime;
  
  response.headers.set('X-Response-Time', `${duration}ms`);
  response.headers.set('X-Request-ID', (response as any).requestId);
  
  // Track performance metric
  monitoring.trackMetric('api.response_time', duration, {
    path: (response as any).path || 'unknown',
    status: response.status.toString(),
  });
  
  return response;
}
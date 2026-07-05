// server/utils/response.utils.ts

import { NextResponse } from 'next/server';
import { ApiResponse, PaginatedResponse as PaginatedResponseType } from '@/shared/types/common.types';
import { applySecurityHeaders } from '@/infrastructure/security/security-headers';

export function successResponse<T>(
  data: T,
  meta?: Record<string, unknown>
): NextResponse<ApiResponse<T>> {
  const response = NextResponse.json({
    success: true,
    data,
    meta: {
      timestamp: new Date().toISOString(),
      ...meta,
    },
  });
  return applySecurityHeaders(response) as NextResponse<ApiResponse<T>>;
}

export function createdResponse<T>(
  data: T,
  meta?: Record<string, unknown>
): NextResponse<ApiResponse<T>> {
  const response = NextResponse.json(
    {
      success: true,
      data,
      meta: {
        timestamp: new Date().toISOString(),
        ...meta,
      },
    },
    { status: 201 }
  );
  return applySecurityHeaders(response) as NextResponse<ApiResponse<T>>;
}

export function paginatedResponse<T>(
  data: T[],
  pagination: PaginatedResponseType<T>['pagination'],
  meta?: Record<string, unknown>
): NextResponse<ApiResponse<T[]>> {
  const response = NextResponse.json({
    success: true,
    data,
    pagination,
    meta: {
      timestamp: new Date().toISOString(),
      ...meta,
    },
  });
  return applySecurityHeaders(response) as NextResponse<ApiResponse<T[]>>;
}

export function errorResponse(
  message: string,
  code: string,
  status: number = 500,
  details?: unknown
): NextResponse<ApiResponse<null>> {
  const response = NextResponse.json(
    {
      success: false,
      error: {
        code,
        message,
        details,
      },
      meta: {
        timestamp: new Date().toISOString(),
      },
    },
    { status }
  );
  return applySecurityHeaders(response) as NextResponse<ApiResponse<null>>;
}

export function noContentResponse(): NextResponse {
  return applySecurityHeaders(new NextResponse(null, { status: 204 }));
}
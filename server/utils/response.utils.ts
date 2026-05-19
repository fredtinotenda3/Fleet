// server/utils/response.utils.ts

import { NextResponse } from 'next/server';
import { ApiResponse, PaginatedResponse as PaginatedResponseType } from '@/shared/types/common.types';

export function successResponse<T>(data: T, meta?: Record<string, unknown>): NextResponse<ApiResponse<T>> {
  return NextResponse.json({
    success: true,
    data,
    meta: {
      timestamp: new Date().toISOString(),
      ...meta,
    },
  });
}

export function createdResponse<T>(data: T, meta?: Record<string, unknown>): NextResponse<ApiResponse<T>> {
  return NextResponse.json(
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
}

export function paginatedResponse<T>(
  data: T[],
  pagination: PaginatedResponseType<T>['pagination'],
  meta?: Record<string, unknown>
): NextResponse<ApiResponse<T[]>> {
  return NextResponse.json({
    success: true,
    data,
    pagination,
    meta: {
      timestamp: new Date().toISOString(),
      ...meta,
    },
  });
}

export function errorResponse(
  message: string,
  code: string,
  status: number = 500,
  details?: unknown
): NextResponse<ApiResponse<null>> {
  return NextResponse.json(
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
}

export function noContentResponse(): NextResponse {
  return new NextResponse(null, { status: 204 });
}
// server/utils/api-response.ts

import { NextResponse } from 'next/server';
import { ApiResponse, PaginatedResponse } from '@/shared/types/common.types';

export class APIResponse {
  static success<T>(data: T, meta?: Record<string, unknown>): NextResponse<ApiResponse<T>> {
    return NextResponse.json({
      success: true,
      data,
      meta: {
        timestamp: new Date().toISOString(),
        ...meta,
      },
    });
  }

  static created<T>(data: T, meta?: Record<string, unknown>): NextResponse<ApiResponse<T>> {
    return NextResponse.json({
      success: true,
      data,
      meta: {
        timestamp: new Date().toISOString(),
        ...meta,
      },
    }, { status: 201 });
  }

  static paginated<T>(
    data: T[],
    pagination: PaginatedResponse<T>['pagination']
  ): NextResponse<ApiResponse<T[]>> {
    return NextResponse.json({
      success: true,
      data,
      pagination,
      meta: {
        timestamp: new Date().toISOString(),
      },
    });
  }

  static error(
    message: string,
    code: string,
    status: number = 500,
    details?: unknown
  ): NextResponse<ApiResponse<null>> {
    return NextResponse.json({
      success: false,
      error: {
        code,
        message,
        details,
      },
      meta: {
        timestamp: new Date().toISOString(),
      },
    }, { status });
  }

  static notFound(message: string = 'Resource not found'): NextResponse<ApiResponse<null>> {
    return this.error(message, 'NOT_FOUND', 404);
  }

  static unauthorized(message: string = 'Unauthorized'): NextResponse<ApiResponse<null>> {
    return this.error(message, 'UNAUTHORIZED', 401);
  }

  static forbidden(message: string = 'Forbidden'): NextResponse<ApiResponse<null>> {
    return this.error(message, 'FORBIDDEN', 403);
  }

  static badRequest(message: string, details?: unknown): NextResponse<ApiResponse<null>> {
    return this.error(message, 'BAD_REQUEST', 400, details);
  }
}
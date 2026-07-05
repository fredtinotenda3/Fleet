// server/utils/error-handler.ts

import { NextResponse } from 'next/server';
import { APIResponse } from './api-response';
import { AppError } from '@/server/errors/app.errors';

export function handleError(
  error: unknown,
  context?: Record<string, unknown>
): NextResponse {
  if (error instanceof AppError) {
    return APIResponse.error(
      error.message,
      error.code,
      error.statusCode,
      error.details
    );
  }

  // Log unhandled errors to console in all environments
  console.error('[Unhandled Error]', error, context);

  return APIResponse.error(
    'Internal server error',
    'INTERNAL_ERROR',
    500,
    process.env.NODE_ENV === 'development'
      ? { error: String(error) }
      : undefined
  );
}
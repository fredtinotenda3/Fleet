// server/utils/error-handler.ts

import { NextResponse } from 'next/server';
import { APIResponse } from './api-response';
import { monitoring } from '@/infrastructure/monitoring/logger';

export class AppError extends Error {
  public readonly code: string;
  public readonly statusCode: number;
  public readonly details?: unknown;

  constructor(message: string, code: string, statusCode: number = 500, details?: unknown) {
    super(message);
    this.name = 'AppError';
    this.code = code;
    this.statusCode = statusCode;
    this.details = details;
  }
}

export class ValidationError extends AppError {
  constructor(message: string, details?: unknown) {
    super(message, 'VALIDATION_ERROR', 400, details);
  }
}

export class NotFoundError extends AppError {
  constructor(message: string) {
    super(message, 'NOT_FOUND', 404);
  }
}

export class UnauthorizedError extends AppError {
  constructor(message: string = 'Unauthorized') {
    super(message, 'UNAUTHORIZED', 401);
  }
}

export class ForbiddenError extends AppError {
  constructor(message: string = 'Forbidden') {
    super(message, 'FORBIDDEN', 403);
  }
}

export class ConflictError extends AppError {
  constructor(message: string) {
    super(message, 'CONFLICT', 409);
  }
}

export function handleError(error: unknown, context?: Record<string, unknown>): NextResponse {
  if (error instanceof AppError) {
    return APIResponse.error(error.message, error.code, error.statusCode, error.details);
  }

  monitoring.logError('Unhandled error', error as Error, context);

  return APIResponse.error(
    'Internal server error',
    'INTERNAL_ERROR',
    500,
    process.env.NODE_ENV === 'development' ? { error: String(error) } : undefined
  );
}
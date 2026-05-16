// shared/types/api.types.ts

import { PaginationParams, ApiResponse } from './common.types';

export interface ApiRequestOptions extends PaginationParams {
  filters?: Record<string, unknown>;
  include?: string[];
  fields?: string[];
}

export interface ApiError {
  code: string;
  message: string;
  status: number;
  details?: Record<string, unknown>;
}

export type ApiHandler<T = unknown> = (
  req: Request,
  params?: Record<string, string>
) => Promise<ApiResponse<T>>;

export interface RateLimitConfig {
  windowMs: number;
  maxRequests: number;
  keyGenerator?: (req: Request) => string;
}

export interface RequestContext {
  tenantId: string;
  userId: string;
  userRoles: string[];
  sessionId: string;
  requestId: string;
}
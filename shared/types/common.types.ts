// shared/types/common.types.ts

export type ID = string;
export type TenantId = string;
export type UserId = string;
export type Timestamp = Date | string;

export interface BaseEntity {
  _id?: ID;
  tenantId: TenantId;
  createdAt?: Timestamp;
  updatedAt?: Timestamp;
  createdBy?: UserId;
  updatedBy?: UserId;
  isDeleted?: boolean;
  deletedAt?: Timestamp | null;
}

export interface PaginationParams {
  page: number;
  limit: number;
  sortBy?: string;
  sortOrder?: 'asc' | 'desc';
}

export interface PaginatedResponse<T> {
  data: T[];
  pagination: {
    page: number;
    limit: number;
    total: number;
    totalPages: number;
    hasNext: boolean;
    hasPrev: boolean;
  };
}

export interface ApiResponse<T = unknown> {
  success: boolean;
  data?: T;
  error?: {
    code: string;
    message: string;
    details?: unknown;
  };
  meta?: {
    timestamp: string;
    requestId?: string;
    version?: string;
  };
  pagination?: PaginatedResponse<never>['pagination'];
}

export type Status = 'active' | 'inactive' | 'maintenance' | 'archived';
export type Priority = 'low' | 'medium' | 'high' | 'critical';
/**
 * Trip entry mode. 'map' added for the map-assisted trip log
 * (Operational-Connectivity upgrade, PART 3): the operator places stops
 * on a map/search box instead of typing a distance or odometer pair, and
 * the server computes a MAP-DERIVED route distance from those stops --
 * see distance-source-resolver.service.ts. `Mode` is Trip-only in this
 * codebase (verified: no other entity's type alias references it), so
 * widening it here is additive and does not affect any other module.
 */
export type Mode = 'distance' | 'odometer' | 'map';

export interface DateRange {
  startDate: Date;
  endDate: Date;
}

export interface FilterParams {
  search?: string;
  status?: string;
  dateRange?: DateRange;
  ids?: ID[];
}
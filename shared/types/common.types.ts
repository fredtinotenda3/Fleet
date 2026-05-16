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
export type Mode = 'distance' | 'odometer';

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
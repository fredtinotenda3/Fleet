// shared/utils/pagination.utils.ts

import { PaginationParams, PaginatedResponse } from '../types/common.types';

export const DEFAULT_PAGINATION = {
  page: 1,
  limit: 10,
  maxLimit: 100,
} as const;

export function validatePaginationParams(
  page: unknown,
  limit: unknown
): PaginationParams {
  let validPage = DEFAULT_PAGINATION.page;
  let validLimit = DEFAULT_PAGINATION.limit;

  if (typeof page === 'string' || typeof page === 'number') {
    const parsed = Number(page);
    if (!isNaN(parsed) && parsed >= 1) validPage = parsed;
  }

  if (typeof limit === 'string' || typeof limit === 'number') {
    const parsed = Number(limit);
    if (!isNaN(parsed) && parsed >= 1 && parsed <= DEFAULT_PAGINATION.maxLimit) {
      validLimit = parsed;
    }
  }

  return { page: validPage, limit: validLimit };
}

export function createPaginatedResponse<T>(
  data: T[],
  total: number,
  params: PaginationParams
): PaginatedResponse<T> {
  const { page, limit } = params;
  const totalPages = Math.ceil(total / limit);

  return {
    data,
    pagination: {
      page,
      limit,
      total,
      totalPages,
      hasNext: page < totalPages,
      hasPrev: page > 1,
    },
  };
}

export function calculateSkip(page: number, limit: number): number {
  return (page - 1) * limit;
}

export function getPaginationRange(currentPage: number, totalPages: number): number[] {
  const delta = 2;
  const range: number[] = [];
  const start = Math.max(1, currentPage - delta);
  const end = Math.min(totalPages, currentPage + delta);

  for (let i = start; i <= end; i++) {
    range.push(i);
  }

  if (start > 2) range.unshift(-1); // ellipsis indicator
  if (start > 1) range.unshift(1);
  if (end < totalPages - 1) range.push(-1);
  if (end < totalPages) range.push(totalPages);

  return range;
}
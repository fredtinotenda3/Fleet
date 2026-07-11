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
  // Explicit `number` annotations: without them, TS keeps the literal
  // types `1` / `10` inferred from the `as const` DEFAULT_PAGINATION
  // object, which then rejects any other number being assigned below.
  let validPage: number = DEFAULT_PAGINATION.page;
  let validLimit: number = DEFAULT_PAGINATION.limit;

  if (typeof page === 'string' || typeof page === 'number') {
    const parsed = Number(page);
    if (!isNaN(parsed) && parsed >= 1) validPage = Math.floor(parsed);
  }

  if (typeof limit === 'string' || typeof limit === 'number') {
    const parsed = Number(limit);
    if (!isNaN(parsed) && parsed >= 1 && parsed <= DEFAULT_PAGINATION.maxLimit) {
      validLimit = Math.floor(parsed);
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
  const totalPages = Math.max(1, Math.ceil(total / limit));

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
  return (Math.max(1, page) - 1) * limit;
}

export function getPaginationRange(currentPage: number, totalPages: number): number[] {
  const delta = 2;
  const range: number[] = [];
  const start = Math.max(1, currentPage - delta);
  const end = Math.min(totalPages, currentPage + delta);

  for (let i = start; i <= end; i++) {
    range.push(i);
  }

  if (start > 2) range.unshift(-1);
  if (start > 1) range.unshift(1);
  if (end < totalPages - 1) range.push(-1);
  if (end < totalPages) range.push(totalPages);

  return range;
}

/**
 * Several controllers (FuelStationController.list, FuelCardController.list,
 * MaintenanceController.getReminders, TripController.getTrips,
 * FuelController.getFuelLogs) return a bare `T[]` -- not `{data, pagination}`
 * -- when the caller omits the `page` query param, as a legacy path kept
 * for dashboard/chart consumers that want the full unpaginated set.
 *
 * Frontend list pages that call these APIs without `page`/`limit` were
 * unconditionally assuming the paginated shape (`result.data`), which on
 * a bare array is `undefined` -- e.g. Fuel Stations and Fuel Cards
 * rendered empty tables despite the API returning real data. Rather than
 * special-casing every call site (or changing the backend's established,
 * intentional unpaginated contract), this normalizes the response once at
 * the API-client boundary so callers can always treat list() results as
 * `PaginatedResponse<T>`.
 */
export function normalizeListResponse<T>(
  response: T[] | PaginatedResponse<T>
): PaginatedResponse<T> {
  if (Array.isArray(response)) {
    return createPaginatedResponse(response, response.length, {
      page: 1,
      limit: Math.max(response.length, 1),
    });
  }
  return response;
}
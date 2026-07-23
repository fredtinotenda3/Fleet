// frontend/modules/maintenance/services/maintenance.api.ts

import { apiClient } from '@/shared/utils/api-client.utils';
import { normalizeListResponse } from '@/shared/utils/pagination.utils';
import type { PaginationParams, PaginatedResponse } from '@/shared/types/common.types';
import type { ExportFormat } from '@/shared/export/export.types';
import type { ExportBlobResponse } from '@/shared/utils/export-download.utils';
import type { Reminder, MaintenanceFilters, MaintenanceStats } from '../types';
import type { MaintenanceFormOutput } from '../schemas';

const BASE = '/api/reminders';

export interface MaintenanceListParams extends MaintenanceFilters, Partial<PaginationParams> {}

function toIso(value: Date | string | undefined): string | undefined {
  if (!value) return undefined;
  return value instanceof Date ? value.toISOString() : value;
}

function buildListQuery(params: Partial<MaintenanceListParams>) {
  return {
    license_plate: params.license_plate,
    status: params.status,
    priority: params.priority,
    category: params.category,
    assigned_to: params.assigned_to,
    start: toIso(params.startDate),
    end: toIso(params.endDate),
    page: params.page,
    limit: params.limit,
  };
}

/**
 * Every method below now targets the ACTUAL route contract exposed by
 * app/api/reminders/route.ts: a single query-param-dispatched endpoint
 * (?id=, ?action=stats|overdue|upcoming|complete), the same convention
 * already used by vehicles.api.ts / trips.api.ts / fuel.api.ts.
 *
 * Previously this file called path-based routes like `${BASE}/stats`,
 * `${BASE}/overdue`, `${BASE}/upcoming`, `${BASE}/${id}`, and
 * `${BASE}/${id}/complete` -- none of which exist as Next.js route files
 * -- which is exactly why the Maintenance page's stats cards, overdue
 * list, and upcoming list all 404'd while the Dashboard (which calls
 * `/api/reminders` directly with no sub-path) worked fine.
 */
export const maintenanceApi = {
  /** Paginated list. Omitting page/limit hits the controller's legacy unpaginated branch (used by dashboards/charts). */
  async list(params: Partial<MaintenanceListParams> = {}): Promise<PaginatedResponse<Reminder>> {
    const response = await apiClient.get<Reminder[] | PaginatedResponse<Reminder>>(BASE, {
      params: buildListQuery(params),
    });
    return normalizeListResponse(response);
  },

  async getById(id: string): Promise<Reminder> {
    return apiClient.get<Reminder>(BASE, { params: { id } });
  },

  async create(payload: MaintenanceFormOutput): Promise<Reminder> {
    return apiClient.post<Reminder>(BASE, payload);
  },

  async update(id: string, payload: Partial<MaintenanceFormOutput>): Promise<Reminder> {
    return apiClient.put<Reminder>(BASE, payload, { params: { id } });
  },

  async remove(id: string): Promise<{ message: string }> {
    return apiClient.delete<{ message: string }>(BASE, { params: { id } });
  },

  /**
   * Enterprise Export Framework (Phase 2). Maintenance/reminder export
   * lives behind ?action=export on the shared /api/reminders route.
   * Sends the same filter fields as list() so the backend re-queries the
   * full authorized, filtered result set (capped at EXPORT_ROW_CAP)
   * instead of exporting only the currently-loaded page.
   */
  async exportFile(filters: Partial<MaintenanceFilters>, format: ExportFormat = 'csv'): Promise<ExportBlobResponse> {
    return apiClient.getBlob(BASE, {
      params: {
        action: 'export',
        license_plate: filters.license_plate,
        status: filters.status,
        priority: filters.priority,
        category: filters.category,
        assigned_to: filters.assigned_to,
        start: toIso(filters.startDate),
        end: toIso(filters.endDate),
        format,
      },
    });
  },

  async complete(id: string, completionDate?: Date): Promise<Reminder> {
    return apiClient.put<Reminder>(
      BASE,
      { completion_date: completionDate ? completionDate.toISOString() : undefined },
      { params: { id, action: 'complete' } }
    );
  },

  async getStats(): Promise<MaintenanceStats> {
    return apiClient.get<MaintenanceStats>(BASE, { params: { action: 'stats' } });
  },

  async getOverdue(): Promise<Reminder[]> {
    return apiClient.get<Reminder[]>(BASE, { params: { action: 'overdue' } });
  },

  async getUpcoming(daysAhead: number = 7): Promise<Reminder[]> {
    return apiClient.get<Reminder[]>(BASE, { params: { action: 'upcoming', daysAhead } });
  },

  async getByVehicle(licensePlate: string, pagination: Partial<PaginationParams> = {}): Promise<PaginatedResponse<Reminder>> {
    return apiClient.get<PaginatedResponse<Reminder>>(BASE, {
      params: { license_plate: licensePlate, page: pagination.page, limit: pagination.limit },
    });
  },

  // ---- Enterprise analytics additions ----

  async getCostTrend(months: number = 12): Promise<import('../types').MaintenanceCostTrendPoint[]> {
    return apiClient.get(BASE, { params: { action: 'cost-trend', months } });
  },

  async getRepairFrequencyByVehicle(limit: number = 20): Promise<import('../types').RepairFrequencyByVehicleRow[]> {
    return apiClient.get(BASE, { params: { action: 'repair-frequency', limit } });
  },

  async getMostExpensiveVehicles(limit: number = 20): Promise<import('../types').MostExpensiveVehicleRow[]> {
    return apiClient.get(BASE, { params: { action: 'most-expensive-vehicles', limit } });
  },

  async getDowntimeEstimate(limit: number = 20): Promise<import('../types').DowntimeEstimatePoint[]> {
    return apiClient.get(BASE, { params: { action: 'downtime-estimate', limit } });
  },

  /**
   * Recalculates pending/overdue status fleet-wide. This hits
   * /api/reminders/update-status, which only exports GET (it's a
   * Vercel-Cron-style scheduled job endpoint) -- the previous `.post()`
   * call would have failed with a 405 the first time anyone clicked
   * "Refresh statuses" on the Overdue Maintenance page.
   */
  async recalculateOverdue(): Promise<{ updatedCount: number }> {
    return apiClient.get<{ updatedCount: number }>(`${BASE}/update-status`);
  },
};
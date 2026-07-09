// frontend/modules/maintenance/services/maintenance.api.ts

import { apiClient } from '@/shared/utils/api-client.utils';
import type { PaginationParams, PaginatedResponse } from '@/shared/types/common.types';
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

export const maintenanceApi = {
  /** Paginated list. Omitting page/limit hits the controller's legacy unpaginated branch (used by dashboards/charts). */
  async list(params: Partial<MaintenanceListParams> = {}): Promise<PaginatedResponse<Reminder>> {
    return apiClient.get<PaginatedResponse<Reminder>>(BASE, { params: buildListQuery(params) });
  },

  async getById(id: string): Promise<Reminder> {
    return apiClient.get<Reminder>(`${BASE}/${id}`);
  },

  async create(payload: MaintenanceFormOutput): Promise<Reminder> {
    return apiClient.post<Reminder>(BASE, payload);
  },

  async update(id: string, payload: Partial<MaintenanceFormOutput>): Promise<Reminder> {
    return apiClient.put<Reminder>(`${BASE}/${id}`, payload);
  },

  async remove(id: string): Promise<{ message: string }> {
    return apiClient.delete<{ message: string }>(`${BASE}/${id}`);
  },

  async complete(id: string, completionDate?: Date): Promise<Reminder> {
    return apiClient.post<Reminder>(`${BASE}/${id}/complete`, {
      completion_date: completionDate ? completionDate.toISOString() : undefined,
    });
  },

  async getStats(): Promise<MaintenanceStats> {
    return apiClient.get<MaintenanceStats>(`${BASE}/stats`);
  },

  async getOverdue(): Promise<Reminder[]> {
    return apiClient.get<Reminder[]>(`${BASE}/overdue`);
  },

  async getUpcoming(daysAhead: number = 7): Promise<Reminder[]> {
    return apiClient.get<Reminder[]>(`${BASE}/upcoming`, { params: { daysAhead } });
  },

  async getByVehicle(licensePlate: string, pagination: Partial<PaginationParams> = {}): Promise<PaginatedResponse<Reminder>> {
    return apiClient.get<PaginatedResponse<Reminder>>(BASE, {
      params: { license_plate: licensePlate, page: pagination.page, limit: pagination.limit },
    });
  },

  /** Recalculates pending/overdue status fleet-wide. Hits the existing scheduled-job route. */
  async recalculateOverdue(): Promise<{ updatedCount: number }> {
    return apiClient.post<{ updatedCount: number }>(`${BASE}/update-status`);
  },
};
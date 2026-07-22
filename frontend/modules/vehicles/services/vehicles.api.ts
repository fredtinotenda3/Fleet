// frontend/modules/vehicles/services/vehicles.api.ts

import { apiClient } from '@/shared/utils/api-client.utils';
import type { PaginationParams, PaginatedResponse } from '@/shared/types/common.types';
import type { ExportFormat } from '@/shared/export/export.types';
import type { ExportBlobResponse } from '@/shared/utils/export-download.utils';
import type {
  Vehicle,
  VehicleStats,
  VehicleTableFilters,
  VehicleAnalyticsRow,
  VehicleActivityEntry,
} from '../types';
import type { VehicleFormValues } from '../schemas';

const BASE = '/api/vehicles';

export interface VehicleListParams extends VehicleTableFilters, PaginationParams {}

interface AuditLogPage {
  data: VehicleActivityEntry[];
  pagination: PaginatedResponse<VehicleActivityEntry>['pagination'];
}

function buildListQuery(params: Partial<VehicleListParams>) {
  return {
    license_plate: params.license_plate,
    make: params.make,
    model: params.model,
    status: params.status,
    year: params.year,
    vehicle_type: params.vehicle_type,
    page: params.page,
    limit: params.limit,
    sortBy: params.sortBy,
    sortOrder: params.sortOrder,
  };
}

export const vehiclesApi = {
  async list(params: Partial<VehicleListParams>): Promise<PaginatedResponse<Vehicle>> {
    if (params.search && params.search.trim().length >= 2) {
      return apiClient.get<PaginatedResponse<Vehicle>>(`${BASE}/search`, {
        params: { q: params.search, page: params.page, limit: params.limit },
      });
    }
    return apiClient.get<PaginatedResponse<Vehicle>>(BASE, { params: buildListQuery(params) });
  },

  async getById(id: string): Promise<Vehicle> {
    return apiClient.get<Vehicle>(`${BASE}/${id}`);
  },

  async create(payload: VehicleFormValues): Promise<Vehicle> {
    return apiClient.post<Vehicle>(BASE, payload);
  },

  async update(id: string, payload: Partial<VehicleFormValues>): Promise<Vehicle> {
    return apiClient.put<Vehicle>(`${BASE}/${id}`, payload);
  },

  async remove(id: string, soft: boolean = true): Promise<{ message: string }> {
    return apiClient.delete<{ message: string }>(`${BASE}/${id}`, { params: { soft } });
  },

  async updateStatus(id: string, status: Vehicle['status']): Promise<Vehicle> {
    return apiClient.patch<Vehicle>(`${BASE}/${id}/status`, { status });
  },

  async getStats(): Promise<VehicleStats> {
    return apiClient.get<VehicleStats>(`${BASE}/stats`);
  },

  async getDueForService(thresholdKm: number = 10000): Promise<Vehicle[]> {
    return apiClient.get<Vehicle[]>(`${BASE}/due-for-service`, {
      params: { threshold: thresholdKm },
    });
  },

  async getAnalytics(startDate: Date, endDate: Date): Promise<VehicleAnalyticsRow[]> {
    return apiClient.get<VehicleAnalyticsRow[]>(`${BASE}/analytics`, {
      params: { startDate: startDate.toISOString(), endDate: endDate.toISOString() },
    });
  },

  async getActivity(vehicleId: string, page = 1, limit = 20): Promise<AuditLogPage> {
    return apiClient.get<AuditLogPage>('/api/security/audit-log', {
      params: { entityType: 'vehicle', entityId: vehicleId, page, limit },
    });
  },

  /**
   * Enterprise Export Framework (Phase 2). Hits GET /api/vehicles/export
   * with the same filter fields as list(), not the currently-loaded
   * (paginated) rows -- the backend re-queries the full authorized,
   * filtered result set (capped at EXPORT_ROW_CAP) and returns a file.
   */
  async exportFile(filters: Partial<VehicleTableFilters>, format: ExportFormat = 'csv'): Promise<ExportBlobResponse> {
    return apiClient.getBlob(`${BASE}/export`, {
      params: {
        license_plate: filters.license_plate,
        make: filters.make,
        model: filters.model,
        status: filters.status,
        year: filters.year,
        vehicle_type: filters.vehicle_type,
        format,
      },
    });
  },
};
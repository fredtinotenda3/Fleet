// frontend/modules/telematics/services/telematics.api.ts

import { apiClient } from '@/shared/utils/api-client.utils';
import type {
  LiveMapPayload,
  LiveMapRouteHistory,
  DemoModeStatus,
  CartrackConfigStatus,
  CartrackConfigInput,
  CartrackTestConnectionResult,
} from '../types';

const BASE = '/api/telematics';

export const telematicsApi = {
  async getLiveMap(): Promise<LiveMapPayload> {
    return apiClient.get<LiveMapPayload>(`${BASE}/live-map`);
  },

  async getRouteHistory(vehicleId: string, minutes?: number): Promise<LiveMapRouteHistory> {
    return apiClient.get<LiveMapRouteHistory>(`${BASE}/live-map/history/${vehicleId}`, {
      params: { minutes },
    });
  },

  async getDemoStatus(): Promise<DemoModeStatus> {
    return apiClient.get<DemoModeStatus>(`${BASE}/demo`);
  },

  async setDemoStatus(enabled: boolean): Promise<DemoModeStatus> {
    return apiClient.post<DemoModeStatus>(`${BASE}/demo`, { enabled });
  },

  /**
   * GET /api/telematics/cartrack/config -- gated on Permission.ORG_SETTINGS
   * server-side (see modules/telematics/controllers/cartrack.controller.ts).
   * The response never carries apiSecret or apiSecretEncrypted; only
   * accountId/apiKey/baseUrl (non-secret identifiers) plus sync status.
   */
  async getCartrackConfig(): Promise<CartrackConfigStatus> {
    return apiClient.get<CartrackConfigStatus>(`${BASE}/cartrack/config`);
  },

  /**
   * PUT /api/telematics/cartrack/config -- upserts the tenant's Cartrack
   * credentials. The backend contract (shared/validations/cartrack.schema.ts)
   * requires apiSecret on every call, including one that only changes
   * `enabled` or `baseUrl` -- there is no partial-update / "keep existing
   * secret" endpoint, so the caller must always supply the current secret.
   */
  async updateCartrackConfig(data: CartrackConfigInput): Promise<CartrackConfigStatus> {
    return apiClient.put<CartrackConfigStatus>(`${BASE}/cartrack/config`, data);
  },

  /** POST /api/telematics/cartrack/test-connection -- verifies the tenant's already-saved credentials; takes no body. */
  async testCartrackConnection(): Promise<CartrackTestConnectionResult> {
    return apiClient.post<CartrackTestConnectionResult>(`${BASE}/cartrack/test-connection`);
  },
};

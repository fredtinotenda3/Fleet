// frontend/modules/telematics/services/telematics.api.ts

import { apiClient } from '@/shared/utils/api-client.utils';
import type {
  LiveMapPayload,
  LiveMapRouteHistory,
  LiveMapVehicleDetail,
  DemoModeStatus,
  CartrackConfigStatus,
  CartrackConfigInput,
  CartrackTestConnectionResult,
  EagleTrackConfigStatus,
  EagleTrackConfigInput,
  EagleTrackTestConnectionResult,
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

  /**
   * GET /api/telematics/live-map/vehicle/[vehicleId] -- full live
   * telemetry (engine, trip/odometer, fuel, device health) for the
   * detail panel shown when a vehicle is selected on the live map.
   * `null` when the vehicle has never reported a fix, or is outside the
   * caller's org-unit scope.
   */
  async getVehicleDetail(vehicleId: string): Promise<LiveMapVehicleDetail | null> {
    return apiClient.get<LiveMapVehicleDetail | null>(`${BASE}/live-map/vehicle/${vehicleId}`);
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

  /**
   * GET /api/telematics/eagletrack/config -- gated on
   * Permission.ORG_SETTINGS server-side. The response never carries the
   * API token or its ciphertext; only the domain plus sync status.
   */
  async getEagleTrackConfig(): Promise<EagleTrackConfigStatus> {
    return apiClient.get<EagleTrackConfigStatus>(`${BASE}/eagletrack/config`);
  },

  /**
   * PUT /api/telematics/eagletrack/config. As with Cartrack, the backend
   * contract (shared/validations/eagletrack.schema.ts) requires the token
   * on every call, including one that only flips `enabled` -- there is no
   * partial-update / "keep existing token" endpoint.
   */
  async updateEagleTrackConfig(data: EagleTrackConfigInput): Promise<EagleTrackConfigStatus> {
    return apiClient.put<EagleTrackConfigStatus>(`${BASE}/eagletrack/config`, data);
  },

  /** POST /api/telematics/eagletrack/test-connection -- verifies the tenant's already-saved credentials; takes no body. */
  async testEagleTrackConnection(): Promise<EagleTrackTestConnectionResult> {
    return apiClient.post<EagleTrackTestConnectionResult>(`${BASE}/eagletrack/test-connection`);
  },
};
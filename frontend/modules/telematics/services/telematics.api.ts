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
  EagleTrackHistoryResult,
  EagleTrackFuelReport,
  EagleTrackTriggerView,
  EagleTrackTrackerMapping,
  EagleTrackTrackerLink,
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

  /**
   * GET /api/telematics/eagletrack/history/[vehicleId]
   *
   * `from`/`to` are BOTH required by the backend schema -- there is no
   * defaulted window, deliberately, because a wrong window is billed in
   * vendor API requests. ISO strings; the server treats them as UTC.
   */
  async getEagleTrackHistory(
    vehicleId: string,
    range: { from: string; to: string; includeAlerts?: boolean }
  ): Promise<EagleTrackHistoryResult> {
    return apiClient.get<EagleTrackHistoryResult>(`${BASE}/eagletrack/history/${vehicleId}`, {
      params: range,
    });
  },

  /** GET /api/telematics/eagletrack/fuel/[vehicleId] -- gated on FUEL_VIEW server-side, not VEHICLE_VIEW. */
  async getEagleTrackFuelReport(
    vehicleId: string,
    range: { from: string; to: string }
  ): Promise<EagleTrackFuelReport> {
    return apiClient.get<EagleTrackFuelReport>(`${BASE}/eagletrack/fuel/${vehicleId}`, {
      params: range,
    });
  },

  /** GET /api/telematics/eagletrack/triggers -- reads our synced copy, never the vendor directly. */
  async getEagleTrackTriggers(): Promise<{ triggers: EagleTrackTriggerView[] }> {
    return apiClient.get<{ triggers: EagleTrackTriggerView[] }>(`${BASE}/eagletrack/triggers`);
  },

  /** GET /api/telematics/eagletrack/tracker-links -- unmatched trackers from the last sync, plus existing links. */
  async getEagleTrackTrackerMapping(): Promise<EagleTrackTrackerMapping> {
    return apiClient.get<EagleTrackTrackerMapping>(`${BASE}/eagletrack/tracker-links`);
  },

  /**
   * POST /api/telematics/eagletrack/tracker-links
   *
   * `vehicleId` is the vehicle's Mongo _id, NOT a license plate -- the
   * backend rejects anything that is not 24 hex characters. Plates are
   * mutable; a re-plated vehicle would silently break the link.
   */
  async createEagleTrackTrackerLink(input: {
    uin: string;
    vehicleId: string;
    note?: string;
  }): Promise<EagleTrackTrackerLink> {
    return apiClient.post<EagleTrackTrackerLink>(`${BASE}/eagletrack/tracker-links`, input);
  },

  async deleteEagleTrackTrackerLink(uin: string): Promise<{ uin: string; removed: boolean }> {
    return apiClient.delete<{ uin: string; removed: boolean }>(
      `${BASE}/eagletrack/tracker-links/${encodeURIComponent(uin)}`
    );
  },
};
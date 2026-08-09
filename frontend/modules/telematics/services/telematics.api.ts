// frontend/modules/telematics/services/telematics.api.ts

import { apiClient } from '@/shared/utils/api-client.utils';
import type { LiveMapPayload, LiveMapRouteHistory, DemoModeStatus } from '../types';

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
};

// frontend/modules/observability/services/observability.api.ts

import { apiClient } from '@/shared/utils/api-client.utils';
import type { ProviderHealthResponse } from '../types';

const BASE = '/api/observability';

export const observabilityApi = {
  /**
   * GET /api/observability/telematics/providers -- gated on
   * Permission.PLATFORM_VIEW server-side (see
   * app/api/observability/telematics/providers/route.ts). A caller
   * without that permission gets a 403 from withAuth before this ever
   * resolves; the page-level PLATFORM_VIEW check in
   * ProviderHealthDashboardPage is a UI convenience on top of that,
   * not a substitute for it.
   */
  async getTelematicsProviderHealth(): Promise<ProviderHealthResponse> {
    return apiClient.get<ProviderHealthResponse>(`${BASE}/telematics/providers`);
  },
};

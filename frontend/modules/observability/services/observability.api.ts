// frontend/modules/observability/services/observability.api.ts

import { apiClient } from '@/shared/utils/api-client.utils';
import type {
  ProviderHealthResponse,
  OutboxSummaryResponse,
  ObservabilitySummaryResponse,
} from '../types';

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

  /**
   * GET /api/observability/outbox -- gated on Permission.PLATFORM_VIEW,
   * same as provider health (see app/api/observability/outbox/route.ts).
   * Plain (non-enveloped) JSON, so apiClient.get() returns it as-is.
   */
  async getOutboxSummary(): Promise<OutboxSummaryResponse> {
    return apiClient.get<OutboxSummaryResponse>(`${BASE}/outbox`);
  },

  /**
   * GET /api/observability/summary -- gated on Permission.JOB_VIEW,
   * NOT PLATFORM_VIEW (see app/api/observability/summary/route.ts and
   * the note on ObservabilitySummaryResponse in ../types). Enveloped
   * via successResponse ({ success, data, meta }); apiClient.get()
   * unwraps `data` automatically, so the resolved value here is
   * already the inner payload.
   */
  async getSummary(): Promise<ObservabilitySummaryResponse> {
    return apiClient.get<ObservabilitySummaryResponse>(`${BASE}/summary`);
  },
};

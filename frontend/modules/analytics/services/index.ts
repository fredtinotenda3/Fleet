// frontend/modules/analytics/services/index.ts

import { apiClient } from '@/shared/utils/api-client.utils';
import type { DataQualityCoverageReport } from '../types';

export const analyticsApi = {
  /**
   * PART 11: GET /api/analytics?action=data-quality-coverage.
   * Reuses the existing action-dispatch analytics route (gated by
   * Permission.ANALYTICS_VIEW) rather than a new endpoint -- see
   * analytics.controller.ts's action switch.
   */
  async getDataQualityCoverage(): Promise<DataQualityCoverageReport> {
    return apiClient.get<DataQualityCoverageReport>('/api/analytics', {
      params: { action: 'data-quality-coverage' },
    });
  },
};

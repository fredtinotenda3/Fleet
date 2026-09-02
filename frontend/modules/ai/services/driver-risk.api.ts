// frontend/modules/ai/services/driver-risk.api.ts
//
// Path-based wrapper matching the actual route contract exposed by
// app/api/ai/driver-risk/route.ts (single GET handler, gated on
// Permission.ANALYTICS_VIEW, dispatching on the presence of a
// `driverId` query param -- see ai.controller.ts's getDriverRisk):
//
//   GET /api/ai/driver-risk             -> DriverRiskBatchResult (every driver in scope)
//   GET /api/ai/driver-risk?driverId=X  -> DriverRiskScore (one driver), 404 if not found/not in scope
//
// apiClient already unwraps the outer `{ success, data, meta }`
// envelope (see shared/utils/api-client.utils.ts's handleResponse), so
// both calls below resolve directly to the shapes documented above --
// never to the envelope itself.
//
// This is the ONLY AI backend route this service touches. Do not widen
// it to call the other app/api/ai/** routes (fleet-health, fuel-fraud,
// etc.) -- those are unrelated predictions with their own shapes; see
// ai.types.ts if a future module needs them.

import { apiClient } from '@/shared/utils/api-client.utils';
import type { DriverRiskScore, DriverRiskBatchResult } from '../types/driver-risk.types';

const BASE = '/api/ai/driver-risk';

export const driverRiskApi = {
  /**
   * GET /api/ai/driver-risk -- every driver the caller's scope can see,
   * each individually success/failure-flagged. This is the only way to
   * discover which driverIds exist to look up (there is no separate
   * driver-risk roster endpoint), so the scorecard picker is built on
   * top of this call rather than the unrelated tbldrivers roster (see
   * the driverId doc comment on DriverRiskScore in ../types).
   */
  async listDriverRisk(): Promise<DriverRiskBatchResult> {
    return apiClient.get<DriverRiskBatchResult>(BASE);
  },

  /**
   * GET /api/ai/driver-risk?driverId=X -- a single driver's full risk
   * score. Throws ApiError('Driver not found', 404) via apiClient if
   * the id doesn't match any AIBatchItem in scope (see
   * ai.controller.ts's getDriverRisk).
   */
  async getDriverRisk(driverId: string): Promise<DriverRiskScore> {
    return apiClient.get<DriverRiskScore>(BASE, { params: { driverId } });
  },
};

export default driverRiskApi;

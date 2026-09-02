// frontend/modules/leaderboard/services/leaderboard.api.ts
//
// Read-only wrappers over THREE endpoints that already exist. No new
// backend route is called, created or implied by this file.
//
//   GET /api/ai/dashboard                                 Permission.ANALYTICS_VIEW
//   GET /api/reminders?action=stats                       Permission.MAINTENANCE_VIEW
//   GET /api/reminders?action=most-expensive-vehicles     Permission.MAINTENANCE_VIEW
//   GET /api/reminders?action=repair-frequency            Permission.MAINTENANCE_VIEW
//
// Every one of them resolves its own tenant/org-unit scope server-side
// via resolveTenantContext(req). Nothing here sends an organization,
// tenant or org-unit identifier, and nothing here may start doing so:
// a caller-supplied scope parameter is exactly the leak the AI and
// analytics controllers were narrowed to close.
//
// apiClient.get() unwraps the outer `{ success, data, meta }` envelope
// (shared/utils/api-client.utils.ts's handleResponse), so each call
// below resolves directly to the documented payload.
//
// WHY ONE /api/ai/dashboard CALL RATHER THAN FOUR AI CALLS. The page
// needs driver risk, predictive maintenance, fuel fraud and expense
// anomalies. Requesting them individually is four requests, and each
// one recomputes its service from scratch over trip/telematics/fuel/
// expense history -- the combined endpoint runs the same five services
// once, under a single `maxDuration = 60`. See app/api/ai/dashboard/
// route.ts's own comment about cold-lambda fan-out cost.

import { apiClient } from '@/shared/utils/api-client.utils';
import type {
  AiDashboardSummary,
  MaintenanceStats,
  MostExpensiveVehicleRow,
  RepairFrequencyByVehicleRow,
} from '../types';

const AI_DASHBOARD = '/api/ai/dashboard';
const REMINDERS = '/api/reminders';

/**
 * Upper bound on rows requested from the two server-ranked maintenance
 * aggregations. Both accept `limit` and apply it INSIDE the aggregation
 * ($sort then $limit), so this caps work done in Mongo, not just rows
 * transferred. Kept modest: a leaderboard is a top-N view, and asking
 * for hundreds of rows to render ten is the shape of a slow page.
 */
export const MAX_LEADERBOARD_ROWS = 25;

/** Clamps a caller-supplied row count into [1, MAX_LEADERBOARD_ROWS]. */
function clampLimit(limit: number): number {
  if (!Number.isFinite(limit)) return MAX_LEADERBOARD_ROWS;
  return Math.min(MAX_LEADERBOARD_ROWS, Math.max(1, Math.trunc(limit)));
}

export const leaderboardApi = {
  /**
   * GET /api/ai/dashboard -- fleet health, predictive maintenance,
   * driver risk, fuel fraud and expense anomalies in one response.
   *
   * Powers the driver leaderboard, the vehicle "open alerts" metric and
   * four of the seven category tiles. Every panel is independently
   * nullable; a null panel means that service did not produce an answer
   * and must never be rendered as a zero (see AiDashboardSummary).
   */
  async getAiDashboard(): Promise<AiDashboardSummary> {
    return apiClient.get<AiDashboardSummary>(AI_DASHBOARD);
  },

  /**
   * GET /api/reminders?action=stats -- fleet-wide reminder counts.
   *
   * `overdue` is "unresolved AND due_date < now" and `pending` is
   * "unresolved AND due_date >= now", both computed in the same
   * aggregation the Maintenance page's own stat cards read (see
   * MaintenanceRepository.getMaintenanceStats). Reusing it is
   * deliberate: a leaderboard that disagreed with the maintenance page
   * about how many jobs are overdue would be worse than no leaderboard.
   */
  async getMaintenanceStats(): Promise<MaintenanceStats> {
    return apiClient.get<MaintenanceStats>(REMINDERS, { params: { action: 'stats' } });
  },

  /**
   * GET /api/reminders?action=most-expensive-vehicles -- vehicles by
   * cumulative estimated maintenance cost, already sorted descending
   * server-side over COMPLETED records only.
   *
   * Cost is `estimated_cost`, not an invoiced actual -- Reminder has no
   * actual-cost field today (see the doc comment on
   * MostExpensiveVehicleRow). The UI must say "estimated" wherever it
   * shows this figure.
   */
  async getMostExpensiveVehicles(limit: number = 10): Promise<MostExpensiveVehicleRow[]> {
    return apiClient.get<MostExpensiveVehicleRow[]>(REMINDERS, {
      params: { action: 'most-expensive-vehicles', limit: clampLimit(limit) },
    });
  },

  /**
   * GET /api/reminders?action=repair-frequency -- vehicles by count of
   * completed maintenance records, already sorted descending
   * server-side.
   */
  async getRepairFrequencyByVehicle(limit: number = 10): Promise<RepairFrequencyByVehicleRow[]> {
    return apiClient.get<RepairFrequencyByVehicleRow[]>(REMINDERS, {
      params: { action: 'repair-frequency', limit: clampLimit(limit) },
    });
  },
};

export default leaderboardApi;

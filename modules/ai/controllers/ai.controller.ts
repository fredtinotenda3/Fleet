// modules/ai/controllers/ai.controller.ts

import { NextRequest } from 'next/server';
import {
  predictiveMaintenanceService,
  fleetHealthService,
  driverRiskService,
  fuelFraudDetectionService,
  expenseAnomalyDetectionService,
} from '../services';
import { needsAttentionService } from '../services/needs-attention.service';

import { successResponse, errorResponse } from '@/server/utils/response.utils';
import { AppError, isAppError, describeError } from '@/server/errors/app.errors';
import { getTenantFromRequest } from '@/server/utils/context.utils';
import { resolveTenantContext } from '@/server/utils/tenant-context.utils';

/**
 * RESOLVED -- kept for the next AI endpoint that lands unscoped.
 *
 * All five AI services (fleet health, driver risk, predictive
 * maintenance, fuel fraud, expense anomalies) now accept an optional
 * TenantContext and narrow every read to context.accessibleOrgUnitIds,
 * the same pattern used across the rest of this codebase
 * (tenantScopeService.buildFilter). None of the five gate on scope
 * anymore -- see each service file for the specific fields it scopes
 * on and, for driver-risk, an open question about driver_id's actual
 * join shape that scoping alone doesn't resolve.
 *
 * This helper and the "fail closed until scoped" pattern it embodies
 * are left in place as the template for whatever AI feature ships
 * next: land it gated behind this, exactly like these five originally
 * were, rather than shipping an unscoped aggregation to every branch
 * manager on day one. Showing nothing is recoverable. Showing another
 * branch's figures is not.
 */
function scopedAiUnavailable() {
  return {
    available: false,
    reason: 'SCOPE_NOT_SUPPORTED',
    message:
      'AI insights are currently available only to organization-wide roles. ' +
      'Branch, department, workshop and fleet scoped views are being added.',
  };
}

export class AIController {
  // ─── Predictive Maintenance ───────────────────────────────────────────────

  async getPredictiveMaintenance(req: NextRequest) {
    try {
      const tenantId = await getTenantFromRequest(req);
      const aiContext = await resolveTenantContext(req);
      const vehicleId = req.nextUrl.searchParams.get('vehicleId');

      if (vehicleId) {
        const result = await predictiveMaintenanceService.predictVehicle(vehicleId, tenantId, aiContext);
        if (result.success) return successResponse(result.data);

        return errorResponse('Prediction failed', 'AI_ERROR', 500);
      }

      const result = await predictiveMaintenanceService.predictAll(tenantId, aiContext);
      return successResponse(result);
    } catch (error) {
      return this.handleError(error);
    }
  }

  // ─── Fleet Health ──────────────────────────────────────────────────────────

  async getFleetHealth(req: NextRequest) {
    try {
      const tenantId = await getTenantFromRequest(req);
      /**
       * Fleet health IS scoped now, so scoped users get real numbers
       * here rather than the placeholder. The gate stays on the other
       * four endpoints until their pipelines are narrowed too.
       */
      const aiContext = await resolveTenantContext(req);
      const result = await fleetHealthService.calculateHealthScore(
        aiContext.organizationId,
        aiContext
      );

      if (!result.success) {
        return errorResponse('Health score calculation failed', 'AI_ERROR', 500);
      }

      return successResponse(result.data);
    } catch (error) {
      return this.handleError(error);
    }
  }

  // ─── Driver Risk ───────────────────────────────────────────────────────────

  async getDriverRisk(req: NextRequest) {
    try {
      const tenantId = await getTenantFromRequest(req);
      /**
       * Driver risk IS scoped now (see the KNOWN OPEN QUESTION note in
       * driver-risk.service.ts about driver_id's actual shape in your
       * data -- scoping is in place, but verify against real trip
       * records before trusting the numbers for scope-narrowed users).
       */
      const aiContext = await resolveTenantContext(req);
      const driverId = req.nextUrl.searchParams.get('driverId');

      const result = await driverRiskService.calculateDriverRisk(tenantId, aiContext);

      if (!result.success) {
        return errorResponse('Risk calculation failed', 'AI_ERROR', 500);
      }

      // Single driver view
      if (driverId) {
        const single = result.results.find(
          (r: any) => r.entityId === driverId
        );

        if (!single) {
          return errorResponse('Driver not found', 'NOT_FOUND', 404);
        }

        if (!single.success) {
          return errorResponse(
            single.error || 'Driver risk calculation failed',
            'AI_ERROR',
            500
          );
        }

        return successResponse(single.data);
      }

      return successResponse(result);
    } catch (error) {
      return this.handleError(error);
    }
  }

  // ─── Fuel Fraud Detection ─────────────────────────────────────────────────

  async getFuelFraud(req: NextRequest) {
    try {
      const tenantId = await getTenantFromRequest(req);
      const aiContext = await resolveTenantContext(req);
      const vehicleId = req.nextUrl.searchParams.get('vehicleId');

      const result = await fuelFraudDetectionService.detectFraud(tenantId, aiContext);

      if (!result.success) {
        return errorResponse('Fraud detection failed', 'AI_ERROR', 500);
      }

      // Single vehicle filter
      if (vehicleId) {
        const single = result.results.find(
          (r: any) => r.entityId === vehicleId
        );

        if (!single) {
          return errorResponse(
            'Vehicle not found or no fraud data',
            'NOT_FOUND',
            404
          );
        }

        if (!single.success) {
          return errorResponse(
            single.error || 'Fraud not detected',
            'AI_ERROR',
            500
          );
        }

        return successResponse(single.data);
      }

      return successResponse(result);
    } catch (error) {
      return this.handleError(error);
    }
  }

  // ─── Expense Anomaly Detection ────────────────────────────────────────────

  async getExpenseAnomalies(req: NextRequest) {
    try {
      const tenantId = await getTenantFromRequest(req);
      const aiContext = await resolveTenantContext(req);

      const result = await expenseAnomalyDetectionService.detectAnomalies(tenantId, aiContext);

      if (!result.success) {
        return errorResponse('Expense anomaly detection failed', 'AI_ERROR', 500);
      }

      return successResponse(result);
    } catch (error) {
      return this.handleError(error);
    }
  }

  // ─── Combined Dashboard ────────────────────────────────────────────────────

  async getAIDashboard(req: NextRequest) {
    try {
      const tenantId = await getTenantFromRequest(req);
      const aiContext = await resolveTenantContext(req);

      /**
       * All five AI services are org-unit scoped now (fleet-health,
       * driver-risk, predictive-maintenance, fuel-fraud-detection,
       * expense-anomaly-detection), so every panel here gets real,
       * correctly-narrowed data for a scope-narrowed caller instead of
       * the placeholder. scopedAiUnavailable() is kept as a helper in
       * case a future AI service lands here before its own scoping is
       * done -- see the note where it's defined.
       */
      const [health, maintenance, driverRisk, fuelFraud, expenseAnomalies] =
        await Promise.all([
          fleetHealthService.calculateHealthScore(aiContext.organizationId, aiContext),
          predictiveMaintenanceService.predictAll(tenantId, aiContext),
          driverRiskService.calculateDriverRisk(tenantId, aiContext),
          fuelFraudDetectionService.detectFraud(tenantId, aiContext),
          expenseAnomalyDetectionService.detectAnomalies(tenantId, aiContext),
        ]);

      return successResponse({
        fleetHealth: health.success ? health.data : null,
        predictiveMaintenance: maintenance.success ? maintenance : null,
        driverRisk: driverRisk.success ? driverRisk : null,
        fuelFraud: fuelFraud.success ? fuelFraud : null,
        expenseAnomalies: expenseAnomalies.success ? expenseAnomalies : null,
        timestamp: new Date(),
      });
    } catch (error) {
      return this.handleError(error);
    }
  }

  // ─── Needs Attention Feed ──────────────────────────────────────────────────

  /**
   * Unified, priority-ranked feed combining all five AI services plus
   * compliance and maintenance. See needs-attention.service.ts for the
   * scoring formula and per-source scoping notes -- every source it
   * reads is already org-unit scoped, so this endpoint inherits that
   * rather than adding a new unscoped read.
   */
  async getNeedsAttention(req: NextRequest) {
    try {
      const tenantId = await getTenantFromRequest(req);
      const aiContext = await resolveTenantContext(req);
      const limitParam = req.nextUrl.searchParams.get('limit');
      const limit = limitParam ? Math.min(200, Math.max(1, parseInt(limitParam, 10) || 50)) : 50;

      const feed = await needsAttentionService.getFeed(tenantId, aiContext, limit);
      return successResponse(feed);
    } catch (error) {
      return this.handleError(error);
    }
  }

  // ─── Error Handler ─────────────────────────────────────────────────────────

  private handleError(error: unknown) {
    if (isAppError(error)) {
      return errorResponse(
        error.message,
        error.code,
        error.statusCode,
        error.details
      );
    }

    console.error('[AIController] Unexpected error:', describeError(error));

    return errorResponse('Internal server error', 'INTERNAL_ERROR', 500);
  }
}

export const aiController = new AIController();
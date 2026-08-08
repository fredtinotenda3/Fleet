// modules/ai/controllers/ai.controller.ts

import { NextRequest } from 'next/server';
import {
  predictiveMaintenanceService,
  fleetHealthService,
  driverRiskService,
  fuelFraudDetectionService,
  expenseAnomalyDetectionService,
} from '../services';

import { successResponse, errorResponse } from '@/server/utils/response.utils';
import { AppError, isAppError, describeError } from '@/server/errors/app.errors';
import { getTenantFromRequest } from '@/server/utils/context.utils';
import { resolveTenantContext } from '@/server/utils/tenant-context.utils';

/**
 * INTERIM CONTAINMENT -- read this before removing it.
 *
 * The five AI services (fleet health, predictive maintenance, driver
 * risk, fuel fraud, expense anomalies) each run their own multi-stage
 * aggregations directly against vehicles/fuel/expenses/reminders. They
 * accept only a tenantId, so they compute organization-wide figures --
 * "Based on 76 vehicles", "fleet health 73/100", "27 fuel anomalies",
 * "242 expense flags" -- and those were being shown verbatim to branch
 * managers who can see none of the underlying rows. A derived metric
 * leaks its inputs: "27 fuel anomalies" tells a Bulawayo manager how
 * much fuel activity exists in Harare.
 *
 * Properly scoping them means threading TenantContext into every stage
 * of five separate analytical pipelines. Until that lands, these
 * endpoints FAIL CLOSED for scope-narrowed callers: they return an
 * explicit "unavailable for your scope" payload rather than org-wide
 * numbers. Org-wide roles (owner/admin/platform) are unaffected.
 *
 * Showing nothing is recoverable. Showing another branch's figures is
 * not.
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
      if (aiContext.accessibleOrgUnitIds !== null) {
        return successResponse(scopedAiUnavailable());
      }
      const vehicleId = req.nextUrl.searchParams.get('vehicleId');

      if (vehicleId) {
        const result = await predictiveMaintenanceService.predictVehicle(vehicleId, tenantId);
        if (result.success) return successResponse(result.data);

        return errorResponse('Prediction failed', 'AI_ERROR', 500);
      }

      const result = await predictiveMaintenanceService.predictAll(tenantId);
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
      if (aiContext.accessibleOrgUnitIds !== null) {
        return successResponse(scopedAiUnavailable());
      }
      const vehicleId = req.nextUrl.searchParams.get('vehicleId');

      const result = await fuelFraudDetectionService.detectFraud(tenantId);

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
      if (aiContext.accessibleOrgUnitIds !== null) {
        return successResponse(scopedAiUnavailable());
      }

      const result = await expenseAnomalyDetectionService.detectAnomalies(tenantId);

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
      const isScoped = aiContext.accessibleOrgUnitIds !== null;

      /**
       * fleet-health and driver-risk are properly org-unit scoped now,
       * so a scope-narrowed caller (branch/department/workshop/fleet
       * manager) gets real numbers for those two instead of nothing.
       * predictive-maintenance, fuel-fraud and expense-anomaly remain
       * behind the fail-closed placeholder until each is scoped the
       * same way -- see scopedAiUnavailable() above for why a
       * partially-scoped panel is worse than a blocked one.
       */
      const [health, maintenance, driverRisk, fuelFraud, expenseAnomalies] =
        await Promise.all([
          fleetHealthService.calculateHealthScore(aiContext.organizationId, aiContext),
          isScoped
            ? Promise.resolve(null)
            : predictiveMaintenanceService.predictAll(tenantId),
          driverRiskService.calculateDriverRisk(tenantId, aiContext),
          isScoped
            ? Promise.resolve(null)
            : fuelFraudDetectionService.detectFraud(tenantId),
          isScoped
            ? Promise.resolve(null)
            : expenseAnomalyDetectionService.detectAnomalies(tenantId),
        ]);

      return successResponse({
        fleetHealth: health.success ? health.data : null,
        predictiveMaintenance:
          maintenance && maintenance.success ? maintenance : isScoped ? scopedAiUnavailable() : null,
        driverRisk: driverRisk.success ? driverRisk : null,
        fuelFraud: fuelFraud && fuelFraud.success ? fuelFraud : isScoped ? scopedAiUnavailable() : null,
        expenseAnomalies:
          expenseAnomalies && expenseAnomalies.success
            ? expenseAnomalies
            : isScoped
              ? scopedAiUnavailable()
              : null,
        timestamp: new Date(),
      });
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
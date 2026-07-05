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
import { AppError } from '@/server/errors/app.errors';
import { getTenantFromRequest } from '@/server/utils/context.utils';

export class AIController {
  // ─── Predictive Maintenance ───────────────────────────────────────────────

  async getPredictiveMaintenance(req: NextRequest) {
    try {
      const tenantId = await getTenantFromRequest(req);
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

      const result = await fleetHealthService.calculateHealthScore(tenantId);

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
      const driverId = req.nextUrl.searchParams.get('driverId');

      const result = await driverRiskService.calculateDriverRisk(tenantId);

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

      const [health, maintenance, driverRisk, fuelFraud, expenseAnomalies] =
        await Promise.all([
          fleetHealthService.calculateHealthScore(tenantId),
          predictiveMaintenanceService.predictAll(tenantId),
          driverRiskService.calculateDriverRisk(tenantId),
          fuelFraudDetectionService.detectFraud(tenantId),
          expenseAnomalyDetectionService.detectAnomalies(tenantId),
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

  // ─── Error Handler ─────────────────────────────────────────────────────────

  private handleError(error: unknown) {
    if (error instanceof AppError) {
      return errorResponse(
        error.message,
        error.code,
        error.statusCode,
        error.details
      );
    }

    console.error('[AIController] Unexpected error:', error);

    return errorResponse('Internal server error', 'INTERNAL_ERROR', 500);
  }
}

export const aiController = new AIController();
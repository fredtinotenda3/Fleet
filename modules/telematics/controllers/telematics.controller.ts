// modules/telematics/controllers/telematics.controller.ts

import { NextRequest } from 'next/server';
import { telematicsService } from '../services/telematics.service';
import {
  geofenceCreateSchema,
  geofenceUpdateSchema,
  telematicsIngestSchema,
} from '@/shared/validations/telematics.schema';
import {
  successResponse,
  createdResponse,
  errorResponse,
} from '@/server/utils/response.utils';
import { AppError, ValidationError, isAppError, describeError } from '@/server/errors/app.errors';
import {
  getTenantFromRequest,
  getUserIdFromRequest,
} from '@/server/utils/context.utils';
import { Geofence } from '../types/telematics.types';
import { resolveTenantContext } from '@/server/utils/tenant-context.utils';
import { assertVehicleInScope } from '../services/telematics-scope.utils';
import { telematicsRepository } from '../repositories/telematics.repository';

export class TelematicsController {
  /**
   * PHASE 0, F-5 -- authorized, scoped telemetry ingestion.
   *
   * WHAT THIS REPLACED
   * ------------------
   * The previous body was four lines: resolve tenantId from the
   * session, Zod-parse, spread, write. It enforced authentication and
   * nothing else. No permission. No check that `vehicleId` belonged to
   * the caller's org unit -- or to any vehicle at all. No `orgUnitId`
   * on the row. Any authenticated user in the tenant could assert
   * arbitrary position, speed, odometer and fuel level against ANY
   * vehicle, and the resulting row, having no org unit, was invisible
   * to every scoped reader -- so fabricated data was harder to find
   * than real data.
   *
   * THE FOUR GATES NOW APPLIED, IN ORDER
   * ------------------------------------
   *   1. Permission.TELEMATICS_INGEST at the route (see the route file).
   *      Answers "may this identity write telemetry at all".
   *   2. assertVehicleInScope -- the SAME helper the Eagle Track
   *      endpoints use. Resolves the vehicle inside the caller's tenant
   *      AND accessible org units, 404s (never 403) on a miss so the
   *      endpoint cannot be used to probe which vehicle ids exist in
   *      another branch, and refuses a vehicle with no org unit rather
   *      than treating unassigned as shared.
   *   3. Device/vehicle binding. If this deviceId is already registered
   *      to a DIFFERENT vehicle, the write is refused. Without this a
   *      caller authorised for vehicle A could post under vehicle A's
   *      id while carrying vehicle B's deviceId, corrupting B's device
   *      record via updateDeviceLastPing on a later path and breaking
   *      the one-device-one-vehicle assumption the staleness guard
   *      depends on.
   *   4. Authoritative ownership. tenantId and orgUnitId are taken from
   *      the resolved VEHICLE record, never from the request. The
   *      schema is `.strict()`, so a body carrying either key is
   *      rejected outright rather than silently ignored -- ignoring is
   *      correct today but depends on spread order staying right
   *      forever, and this is an ownership field.
   *
   * WHAT IS DELIBERATELY NOT DONE HERE
   * Absent measurements stay absent. Nothing in this path substitutes a
   * zero for a field the caller omitted; see the schema's own comment
   * for why a fabricated `fuelLevel: 0` manufactures a high-severity
   * alert on every post.
   */
  async ingest(req: NextRequest) {
    try {
      const context = await resolveTenantContext(req);
      const body = await req.json();

      const parsed = telematicsIngestSchema.safeParse(body);
      if (!parsed.success) {
        throw new ValidationError('Invalid telematics payload', parsed.error.flatten());
      }

      // Gate 2 -- throws NotFoundError for a vehicle outside this
      // tenant, outside the caller's accessible org units, soft-deleted,
      // or unassigned.
      const vehicle = await assertVehicleInScope(parsed.data.vehicleId, context);

      // Gate 3 -- device must not already belong to a different vehicle.
      const existingDevice = await telematicsRepository.getDevice(
        parsed.data.deviceId,
        vehicle.tenantId
      );
      if (existingDevice && String(existingDevice.vehicleId) !== vehicle.vehicleId) {
        throw new AppError(
          'This device is registered to a different vehicle.',
          'DEVICE_VEHICLE_MISMATCH',
          409
        );
      }

      // Gate 4 -- ownership is resolved, never accepted.
      await telematicsService.ingestTelematicsData({
        ...parsed.data,
        vehicleId: vehicle.vehicleId,
        tenantId: vehicle.tenantId,
        ...(vehicle.orgUnitId ? { orgUnitId: vehicle.orgUnitId } : {}),
      });

      return successResponse({ message: 'Telematics data ingested' });
    } catch (error) {
      return this.handleError(error);
    }
  }

  async getCurrentLocation(req: NextRequest, vehicleId: string) {
    try {
      const tenantId = await getTenantFromRequest(req);
      const data = await telematicsService.getCurrentLocation(vehicleId, tenantId);
      return successResponse(data);
    } catch (error) {
      return this.handleError(error);
    }
  }

  async getHistory(req: NextRequest, vehicleId: string) {
    try {
      const tenantId = await getTenantFromRequest(req);
      const searchParams = req.nextUrl.searchParams;

      const startDate = new Date(searchParams.get('startDate') || Date.now() - 86_400_000);
      const endDate = new Date(searchParams.get('endDate') || Date.now());

      const history = await telematicsService.getVehicleHistory(
        vehicleId,
        startDate,
        endDate,
        tenantId
      );
      return successResponse(history);
    } catch (error) {
      return this.handleError(error);
    }
  }

  async getActiveAlerts(req: NextRequest, vehicleId: string) {
    try {
      const tenantId = await getTenantFromRequest(req);
      const alerts = await telematicsService.getActiveAlerts(vehicleId, tenantId);
      return successResponse(alerts);
    } catch (error) {
      return this.handleError(error);
    }
  }

  async acknowledgeAlert(req: NextRequest, alertId: string) {
    try {
      const tenantId = await getTenantFromRequest(req);
      const userId = await getUserIdFromRequest(req);

      const ok = await telematicsService.acknowledgeAlert(alertId, userId, tenantId);
      if (!ok) {
        return errorResponse('Alert not found', 'NOT_FOUND', 404);
      }
      return successResponse({ message: 'Alert acknowledged' });
    } catch (error) {
      return this.handleError(error);
    }
  }

  async createGeofence(req: NextRequest) {
    try {
      const tenantId = await getTenantFromRequest(req);
      const userId = await getUserIdFromRequest(req);
      const body = await req.json();

      const parsed = geofenceCreateSchema.safeParse(body);
      if (!parsed.success) {
        throw new ValidationError('Invalid geofence payload', parsed.error.flatten());
      }

      // Geofence (via BaseEntity) requires tenantId; the schema
      // deliberately excludes it since it's derived from the request,
      // not client input, so it must be added explicitly here.
      const geofence = await telematicsService.createGeofence(
        { ...parsed.data, tenantId } as Omit<Geofence, '_id' | 'createdAt' | 'updatedAt'>,
        tenantId,
        userId
      );
      return createdResponse(geofence);
    } catch (error) {
      return this.handleError(error);
    }
  }

  async updateGeofence(req: NextRequest, id: string) {
    try {
      const tenantId = await getTenantFromRequest(req);
      const userId = await getUserIdFromRequest(req);
      const body = await req.json();

      const parsed = geofenceUpdateSchema.safeParse(body);
      if (!parsed.success) {
        throw new ValidationError('Invalid geofence update payload', parsed.error.flatten());
      }

      const { telematicsRepository } = await import('../repositories/telematics.repository');
      const updated = await telematicsRepository.updateGeofence(id, parsed.data as any, tenantId, userId);

      if (!updated) {
        return errorResponse('Geofence not found', 'NOT_FOUND', 404);
      }
      return successResponse(updated);
    } catch (error) {
      return this.handleError(error);
    }
  }

  async deleteGeofence(req: NextRequest, id: string) {
    try {
      const tenantId = await getTenantFromRequest(req);
      const { telematicsRepository } = await import('../repositories/telematics.repository');
      const deleted = await telematicsRepository.deleteGeofence(id, tenantId);

      if (!deleted) {
        return errorResponse('Geofence not found', 'NOT_FOUND', 404);
      }
      return successResponse({ message: 'Geofence deleted' });
    } catch (error) {
      return this.handleError(error);
    }
  }

  async listGeofences(req: NextRequest) {
    try {
      const tenantId = await getTenantFromRequest(req);
      const vehicleId = req.nextUrl.searchParams.get('vehicleId') || undefined;

      const { telematicsRepository } = await import('../repositories/telematics.repository');
      const geofences = await telematicsRepository.getActiveGeofences(vehicleId, tenantId);
      return successResponse(geofences);
    } catch (error) {
      return this.handleError(error);
    }
  }

  private handleError(error: unknown) {
    if (isAppError(error)) {
      return errorResponse(error.message, error.code, error.statusCode, error.details);
    }
    if (error instanceof Error) {
      return errorResponse(error.message, 'VALIDATION_ERROR', 400);
    }
    console.error('[TelematicsController] Unexpected error:', describeError(error));
    return errorResponse('Internal server error', 'INTERNAL_ERROR', 500);
  }
}

export const telematicsController = new TelematicsController();
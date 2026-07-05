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
import { AppError, ValidationError } from '@/server/errors/app.errors';
import {
  getTenantFromRequest,
  getUserIdFromRequest,
} from '@/server/utils/context.utils';
import { Geofence } from '../types/telematics.types';

export class TelematicsController {
  async ingest(req: NextRequest) {
    try {
      const tenantId = await getTenantFromRequest(req);
      const body = await req.json();

      const parsed = telematicsIngestSchema.safeParse(body);
      if (!parsed.success) {
        throw new ValidationError('Invalid telematics payload', parsed.error.flatten());
      }

      await telematicsService.ingestTelematicsData({ ...parsed.data, tenantId });
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
    if (error instanceof AppError) {
      return errorResponse(error.message, error.code, error.statusCode, error.details);
    }
    if (error instanceof Error) {
      return errorResponse(error.message, 'VALIDATION_ERROR', 400);
    }
    console.error('[TelematicsController] Unexpected error:', error);
    return errorResponse('Internal server error', 'INTERNAL_ERROR', 500);
  }
}

export const telematicsController = new TelematicsController();
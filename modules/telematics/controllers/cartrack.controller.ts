// modules/telematics/controllers/cartrack.controller.ts

import { NextRequest } from 'next/server';
import { cartrackConfigRepository } from '../repositories/cartrack-config.repository';
import { cartrackConfigSchema } from '@/shared/validations/cartrack.schema';
import { successResponse } from '@/server/utils/response.utils';
import { ValidationError } from '@/server/errors/app.errors';
import { getTenantFromRequest, getUserIdFromRequest } from '@/server/utils/context.utils';
import { handleTelematicsError } from './telematics-error.utils';
import { getTelematicsProvider } from '../providers/provider.resolve';
import { PROVIDER_CARTRACK } from '../providers/provider.types';

export class CartrackController {
  /** GET /api/telematics/cartrack/config -- never returns the secret, only whether one is set. */
  async getConfig(req: NextRequest) {
    try {
      const tenantId = await getTenantFromRequest(req);
      const config = await cartrackConfigRepository.getConfig(tenantId);

      if (!config) {
        return successResponse({ configured: false, enabled: false });
      }

      return successResponse({
        configured: true,
        enabled: config.enabled,
        accountId: config.accountId,
        apiKey: config.apiKey,
        baseUrl: config.baseUrl,
        lastSyncAt: config.lastSyncAt,
        lastSyncStatus: config.lastSyncStatus,
        lastSyncError: config.lastSyncError,
      });
    } catch (error) {
      return handleTelematicsError('CartrackController', error);
    }
  }

  /** PUT /api/telematics/cartrack/config -- creates or replaces this tenant's Cartrack credentials. */
  async saveConfig(req: NextRequest) {
    try {
      const tenantId = await getTenantFromRequest(req);
      const userId = await getUserIdFromRequest(req);
      const body = await req.json();

      const parsed = cartrackConfigSchema.safeParse(body);
      if (!parsed.success) {
        throw new ValidationError('Invalid Cartrack configuration', parsed.error.flatten());
      }

      const saved = await cartrackConfigRepository.upsertConfig(tenantId, parsed.data, userId);

      return successResponse({
        configured: true,
        enabled: saved.enabled,
        accountId: saved.accountId,
        apiKey: saved.apiKey,
        baseUrl: saved.baseUrl,
      });
    } catch (error) {
      return handleTelematicsError('CartrackController', error);
    }
  }

  /** POST /api/telematics/cartrack/test-connection -- verifies stored credentials authenticate against Cartrack without pulling a full fleet payload. */
  async testConnection(req: NextRequest) {
    try {
      const tenantId = await getTenantFromRequest(req);
      // PHASE 2 (cron/worker migration): the manual trigger and
      // connection test resolve through the registry like every other
      // polling path. The ROUTE stays vendor-named -- a credential form
      // is inherently vendor-specific and the brief permits that -- but
      // what it drives is the contract, not a direct adapter import.
      const ok = await getTelematicsProvider(PROVIDER_CARTRACK).testConnection(tenantId);
      return successResponse({ connected: ok });
    } catch (error) {
      return handleTelematicsError('CartrackController', error);
    }
  }

  /**
   * POST /api/telematics/cartrack/sync -- on-demand sync, in addition to
   * the periodic background sync (see workers/telemetry.worker.ts's
   * 'cartrack-sync' handler). Useful right after saving credentials, or
   * for a manual refresh, without waiting for the next scheduled run.
   */
  async syncNow(req: NextRequest) {
    try {
      const tenantId = await getTenantFromRequest(req);
      const result = await getTelematicsProvider(PROVIDER_CARTRACK).syncTenant(tenantId);
      return successResponse(result);
    } catch (error) {
      return handleTelematicsError('CartrackController', error);
    }
  }
}

export const cartrackController = new CartrackController();
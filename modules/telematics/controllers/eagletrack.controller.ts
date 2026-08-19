// modules/telematics/controllers/eagletrack.controller.ts
//
// Identical shape to CartrackController. The one thing worth stating
// explicitly: Eagle Track's config has no non-secret identifier
// equivalent to Cartrack's accountId/apiKey. The token is the entire
// credential, so the only fields these endpoints ever return are the
// domain, the enabled flag, and sync status -- never the token, never
// its ciphertext, and never a masked or truncated form of either
// (a prefix of a static token is still a leak).

import { NextRequest } from 'next/server';
import { eagletrackConfigRepository } from '../repositories/eagletrack-config.repository';
import { eagletrackAdapter } from '../adapters/eagletrack/eagletrack.adapter';
import { eagletrackConfigSchema } from '@/shared/validations/eagletrack.schema';
import { successResponse } from '@/server/utils/response.utils';
import { ValidationError } from '@/server/errors/app.errors';
import { getTenantFromRequest, getUserIdFromRequest } from '@/server/utils/context.utils';
import { handleTelematicsError } from './telematics-error.utils';

export class EagleTrackController {
  /** GET /api/telematics/eagletrack/config -- never returns the token, only whether one is set. */
  async getConfig(req: NextRequest) {
    try {
      const tenantId = await getTenantFromRequest(req);
      const config = await eagletrackConfigRepository.getConfig(tenantId);

      if (!config) {
        return successResponse({ configured: false, enabled: false });
      }

      return successResponse({
        configured: true,
        enabled: config.enabled,
        domain: config.domain,
        lastSyncAt: config.lastSyncAt,
        lastSyncStatus: config.lastSyncStatus,
        lastSyncError: config.lastSyncError,
      });
    } catch (error) {
      return handleTelematicsError('EagleTrackController', error);
    }
  }

  /** PUT /api/telematics/eagletrack/config -- creates or replaces this tenant's Eagle Track credentials. */
  async saveConfig(req: NextRequest) {
    try {
      const tenantId = await getTenantFromRequest(req);
      const userId = await getUserIdFromRequest(req);
      const body = await req.json();

      const parsed = eagletrackConfigSchema.safeParse(body);
      if (!parsed.success) {
        throw new ValidationError('Invalid Eagle Track configuration', parsed.error.flatten());
      }

      const saved = await eagletrackConfigRepository.upsertConfig(tenantId, parsed.data, userId);

      return successResponse({
        configured: true,
        enabled: saved.enabled,
        domain: saved.domain,
      });
    } catch (error) {
      return handleTelematicsError('EagleTrackController', error);
    }
  }

  /** POST /api/telematics/eagletrack/test-connection -- verifies the stored credentials without pulling a full fleet payload. */
  async testConnection(req: NextRequest) {
    try {
      const tenantId = await getTenantFromRequest(req);
      const ok = await eagletrackAdapter.testConnection(tenantId);
      return successResponse({ connected: ok });
    } catch (error) {
      return handleTelematicsError('EagleTrackController', error);
    }
  }

  /**
   * POST /api/telematics/eagletrack/sync -- on-demand sync, in addition
   * to the periodic background sync (see workers/telemetry.worker.ts's
   * 'eagletrack-sync' handler). Useful right after saving credentials,
   * without waiting for the next scheduled run.
   */
  async syncNow(req: NextRequest) {
    try {
      const tenantId = await getTenantFromRequest(req);
      const result = await eagletrackAdapter.syncOrganization(tenantId);
      return successResponse(result);
    } catch (error) {
      return handleTelematicsError('EagleTrackController', error);
    }
  }
}

export const eagletrackController = new EagleTrackController();

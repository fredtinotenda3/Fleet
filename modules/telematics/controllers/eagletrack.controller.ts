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
import {
  eagletrackConfigSchema,
  eagletrackRangeQuerySchema,
  eagletrackTrackerLinkSchema,
} from '@/shared/validations/eagletrack.schema';
import { eagletrackHistoryService } from '../services/eagletrack-history.service';
import { eagletrackFuelService } from '../services/eagletrack-fuel.service';
import { eagletrackTrackerLinkService } from '../services/eagletrack-tracker-link.service';
import { eagletrackTriggerRepository } from '../repositories/eagletrack-trigger.repository';
import { resolveTenantContext, resolveTenantContextWithUser } from '@/server/utils/tenant-context.utils';
import { successResponse } from '@/server/utils/response.utils';
import { ValidationError } from '@/server/errors/app.errors';
import { getTenantFromRequest, getUserIdFromRequest } from '@/server/utils/context.utils';
import { handleTelematicsError } from './telematics-error.utils';
import { getTelematicsProvider } from '../providers/provider.resolve';
import { PROVIDER_EAGLETRACK } from '../providers/provider.types';

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
      // PHASE 2 (cron/worker migration): the manual trigger and
      // connection test resolve through the registry like every other
      // polling path. The ROUTE stays vendor-named -- a credential form
      // is inherently vendor-specific and the brief permits that -- but
      // what it drives is the contract, not a direct adapter import.
      const ok = await getTelematicsProvider(PROVIDER_EAGLETRACK).testConnection(tenantId);
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
      const result = await getTelematicsProvider(PROVIDER_EAGLETRACK).syncTenant(tenantId);
      return successResponse(result);
    } catch (error) {
      return handleTelematicsError('EagleTrackController', error);
    }
  }

  /**
   * GET /api/telematics/eagletrack/history/[vehicleId]?from=&to=
   *
   * Ingests the provider's history for the window (idempotently) and
   * returns the resulting breadcrumb trail, plus the vendor alerts for
   * the same window.
   *
   * Resolves a full TenantContext, not just a tenantId: the vehicle is
   * scope-checked before a single vendor request is made, and the trail
   * is read back through the org-unit-scoped query. A tenantId-only
   * signature is the leak shape server/utils/tenant-context.utils.ts
   * exists to prevent.
   */
  async getHistory(req: NextRequest, vehicleId: string) {
    try {
      const context = await resolveTenantContext(req);
      const parsed = eagletrackRangeQuerySchema.safeParse({
        from: req.nextUrl.searchParams.get('from'),
        to: req.nextUrl.searchParams.get('to'),
        includeAlerts: req.nextUrl.searchParams.get('includeAlerts') ?? undefined,
      });
      if (!parsed.success) {
        throw new ValidationError(
          'Invalid history window -- `from` and `to` are both required',
          parsed.error.flatten()
        );
      }

      const history = await eagletrackHistoryService.getHistory(vehicleId, context, parsed.data);
      return successResponse(history);
    } catch (error) {
      return handleTelematicsError('EagleTrackController', error);
    }
  }

  /** GET /api/telematics/eagletrack/fuel/[vehicleId]?from=&to= -- the provider's fuel report, mapped onto canonical fuel telemetry. */
  async getFuelReport(req: NextRequest, vehicleId: string) {
    try {
      const context = await resolveTenantContext(req);
      const parsed = eagletrackRangeQuerySchema.safeParse({
        from: req.nextUrl.searchParams.get('from'),
        to: req.nextUrl.searchParams.get('to'),
      });
      if (!parsed.success) {
        throw new ValidationError(
          'Invalid fuel report window -- `from` and `to` are both required',
          parsed.error.flatten()
        );
      }

      const report = await eagletrackFuelService.getFuelReport(vehicleId, context, parsed.data);
      return successResponse(report);
    } catch (error) {
      return handleTelematicsError('EagleTrackController', error);
    }
  }

  /**
   * GET /api/telematics/eagletrack/triggers
   *
   * The provider's trigger objects as last synced. Reads from our own
   * store rather than calling the vendor: this backs a settings screen
   * that a user may open repeatedly, and the trigger list changes on a
   * human timescale. The sync (see eagletrack-trigger-sync.service.ts)
   * is what refreshes it.
   */
  async listTriggers(req: NextRequest) {
    try {
      const context = await resolveTenantContext(req);
      const triggers = await eagletrackTriggerRepository.listInScope(context);
      return successResponse({ triggers });
    } catch (error) {
      return handleTelematicsError('EagleTrackController', error);
    }
  }

  /** GET /api/telematics/eagletrack/tracker-links -- unmatched trackers from the last sync, plus existing links. */
  async getTrackerMapping(req: NextRequest) {
    try {
      const context = await resolveTenantContext(req);
      return successResponse(await eagletrackTrackerLinkService.getOverview(context));
    } catch (error) {
      return handleTelematicsError('EagleTrackController', error);
    }
  }

  /** POST /api/telematics/eagletrack/tracker-links -- links a uin to a vehicle the caller may see. */
  async createTrackerLink(req: NextRequest) {
    try {
      const { context, userId } = await resolveTenantContextWithUser(req);
      const parsed = eagletrackTrackerLinkSchema.safeParse(await req.json());
      if (!parsed.success) {
        throw new ValidationError('Invalid tracker link', parsed.error.flatten());
      }

      const link = await eagletrackTrackerLinkService.createLink(parsed.data, context, userId);
      return successResponse(link);
    } catch (error) {
      return handleTelematicsError('EagleTrackController', error);
    }
  }

  /** DELETE /api/telematics/eagletrack/tracker-links/[uin] */
  async deleteTrackerLink(req: NextRequest, uin: string) {
    try {
      const { context, userId } = await resolveTenantContextWithUser(req);
      await eagletrackTrackerLinkService.removeLink(uin, context, userId);
      return successResponse({ uin, removed: true });
    } catch (error) {
      return handleTelematicsError('EagleTrackController', error);
    }
  }
}

export const eagletrackController = new EagleTrackController();

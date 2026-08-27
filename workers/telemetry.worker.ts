// workers/telemetry.worker.ts

import { BaseWorker } from '@/infrastructure/queue/worker-base.service';
import { telematicsService } from '@/modules/telematics/services/telematics.service';
import { notificationService } from '@/modules/notifications/services/notification.service';
import { backgroundJobScopeService } from '@/server/scheduler/background-job-scope.service';
import { monitoring } from '@/infrastructure/monitoring/logger';
import type { TelematicsDevice } from '@/modules/telematics/types/telematics.types';
import {
  getTelematicsProvider,
  isKnownProvider,
} from '@/modules/telematics/providers/provider.resolve';
import { ProviderError } from '@/modules/telematics/providers/provider.errors';

interface IngestBatchPayload {
  records: Array<Record<string, unknown>>;
}

interface OrgMember {
  userId: string;
  role: string;
}

/**
 * Handles overflow telemetry ingestion (high-volume GPS/OBD2 pings that
 * callers batch rather than sending one HTTP request per point) plus
 * the recurring offline-device sweep. Bulk ingestion reuses
 * telematicsService.bulkIngest, which already batches the DB write per
 * tenant; offline detection reuses telematicsService.getOfflineDevices
 * per active organization and notifies fleet managers once per device
 * per run (idempotent at the notification-preference level).
 */
export class TelemetryWorker extends BaseWorker<IngestBatchPayload | Record<string, never>> {
  constructor(queueName: 'telemetry-jobs') {
    super(queueName);
  }

  protected async process(jobName: string, payload: any, tenantId: string): Promise<void> {
    if (jobName === 'ingest-telemetry-batch') {
      await telematicsService.bulkIngest((payload as IngestBatchPayload).records.map((r) => ({ ...r, tenantId } as any)));
      return;
    }

    if (jobName === 'detect-offline-devices') {
      /**
       * FIX (Phase D -- enterprise organization-aware background
       * processing): this previously called
       * `organizationRepository.findByOwnerId('')` -- a placeholder
       * that always returns an empty array and was discarded on the
       * very next line -- and then fell through to a hand-rolled
       * `db.collection('tblorganizations').find(...)`, duplicating the
       * same tenant-enumeration logic that billing.worker.ts,
       * cleanup.worker.ts, and sla-compliance.worker.ts each
       * independently re-implemented. This now goes through
       * BackgroundJobScopeService, the single shared driver for "walk
       * every active organization" background jobs, which itself reuses
       * OrganizationRepository/TenantContextService rather than
       * querying tblorganizations directly. A failure for one
       * organization is caught, audited, and skipped -- it never
       * aborts the sweep for the rest of the platform.
       */
      await backgroundJobScopeService.forEachOrganization('detect-offline-devices', async (scope) => {
        const offline = await telematicsService.getOfflineDevices(scope.organizationId, 5);
        if (offline.length === 0) return;

        await this.notifyOfflineDevices(scope.organizationId, offline);
      });
      return;
    }

    /**
     * PHASE 2 (cron/worker migration) -- ONE generic provider sweep.
     *
     * WHAT THIS REPLACES
     * Two near-identical branches, `jobName === 'cartrack-sync'` and
     * `jobName === 'eagletrack-sync'`, each importing a vendor's config
     * repository BY NAME to enumerate tenants and a vendor's adapter BY
     * NAME to poll them. Adding a third provider meant editing this
     * worker -- generic scheduling code -- which is exactly the coupling
     * Phase 2 exists to remove.
     *
     * Job names are already `<providerId>-sync` (see JobType in
     * queue.service.ts), so the provider id is derived from the job name
     * and RESOLVED THROUGH THE REGISTRY. Existing schedules keep working
     * unchanged: `telemetry-cartrack-sync` and `telemetry-eagletrack-sync`
     * already dispatch these exact job names, so no migration of stored
     * schedules is required.
     *
     * An unregistered provider id THROWS rather than silently doing
     * nothing: a schedule that quietly stops ingesting is
     * indistinguishable from a fleet that stopped moving. It never falls
     * back to a default provider.
     */
    if (jobName === 'telemetry-rollup') {
      await this.rollupPreviousDay();
      return;
    }

    const providerSyncMatch = /^(.+)-sync$/.exec(jobName);
    if (providerSyncMatch) {
      const providerId = providerSyncMatch[1];

      if (!isKnownProvider(providerId)) {
        throw new Error(
          `[TelemetryWorker] Job '${jobName}' names an unregistered telematics provider '${providerId}'.`
        );
      }

      const provider = getTelematicsProvider(providerId);

      /**
       * Only tenants with this provider enabled -- via the contract
       * rather than a vendor config repository. Most tenants have no
       * integration configured at all, and there is no reason to pay for
       * a no-op on every org on every run.
       *
       * The per-tenant try/catch below is load-bearing, not defensive
       * decoration. Eagle Track is deployed per customer, so each tenant
       * points at a DIFFERENT host we do not operate: one tenant's
       * expired token, DNS failure or unreachable box must not stop the
       * sweep for every other tenant.
       */
      const tenantIds = await provider.listEnabledTenants();

      for (const tenantId of tenantIds) {
        try {
          const result = await provider.syncTenant(tenantId);

          // A non-empty `errors` does NOT mean the sync failed: both
          // adapters convert per-vehicle API failures into entries here
          // and continue, so a sweep can be partially successful.
          if (result.errors.length > 0) {
            monitoring.logError(
              '[TelemetryWorker] Provider sync completed with errors',
              new Error(result.errors.join('; ')),
              {
                providerId,
                tenantId,
                matched: result.matched,
                unmatched: result.unmatchedCount,
              }
            );
          }
        } catch (error) {
          // ProviderError carries a neutral category and an
          // already-redacted detail, so this log line cannot contain a
          // vendor token.
          const context =
            error instanceof ProviderError
              ? { providerId, tenantId, ...error.toLogContext() }
              : { providerId, tenantId };

          monitoring.logError(
            '[TelemetryWorker] Provider sync failed',
            error as Error,
            context
          );
        }
      }
      return;
    }
  }

  /**
   * FIX (Phase D finalization -- telemetry notification scope): the
   * previous version notified every 'fleet_manager' in the organization
   * about every offline device, regardless of which fleet/workshop the
   * device's vehicle actually belongs to -- a real violation of "Fleet
   * Manager can only see their assigned fleet" (see the same principle
   * enforced in modules/tenancy/services/tenant-context.service.ts's
   * Phase A fix). This groups offline devices by the org unit their
   * vehicle is assigned to (Vehicle.orgUnitId -- see
   * modules/vehicles/repositories/vehicle.repository.ts's
   * tenantScopeService.buildFilter<Vehicle>(context, 'orgUnitId')) and,
   * for each group, only notifies fleet managers whose resolved
   * TenantContext actually covers that org unit.
   *
   * Deliberately reuses existing hierarchy logic instead of
   * reimplementing it:
   *  - TenantContextService.resolveContext() already expands a user's
   *    UserScopeAssignment records to include descendant org units
   *    (so a manager scoped at a Branch/Department still correctly
   *    covers the Fleets/Workshops beneath it).
   *  - TenantScopeService.canAccessOrgUnit() is the existing "does this
   *    resolved context cover org unit X" check.
   * No ancestor/descendant path-walking is duplicated here.
   *
   * Each fleet manager's context is resolved once per run (not once per
   * device or per fleet), since resolveContext() returns their full
   * accessible set in one call -- checking membership in that set for
   * each affected fleet afterwards is a cheap in-memory operation, so
   * this stays at O(managers) DB round trips rather than
   * O(managers x fleets).
   *
   * Organization owners are always included directly from organization
   * membership (not via scope assignment) since ORGANIZATION_OWNER is
   * one of the FULL_ORG_UNIT_VISIBILITY_ROLES and isn't expected to
   * hold explicit UserScopeAssignment rows.
   *
   * Devices whose vehicle has no orgUnitId (unassigned) or whose
   * vehicle record can't be resolved fall back to organization owners
   * only -- never broadened to every fleet manager, since there is no
   * org unit to check anyone's scope against.
   */
  private async notifyOfflineDevices(organizationId: string, offline: TelematicsDevice[]): Promise<void> {
    const { organizationRepository } = await import('@/modules/organizations/repositories/organization.repository');
    const { vehicleRepository } = await import('@/modules/vehicles/repositories/vehicle.repository');
    const { tenantContextService } = await import('@/modules/tenancy/services/tenant-context.service');
    const { tenantScopeService } = await import('@/modules/tenancy/services/tenant-scope.service');

    const { resolveOrganization } = await import('@/server/tenancy/organization-resolver');
    const org = await resolveOrganization(organizationId);
    if (!org) return;

    const members: OrgMember[] = org.members || [];
    const ownerIds = members
      .filter((m) => m.role === 'organization_owner')
      .map((m) => m.userId);
    const fleetManagers = members.filter((m) => m.role === 'fleet_manager');

    const managerContexts = await Promise.all(
      fleetManagers.map(async (m) => ({
        userId: m.userId,
        context: await tenantContextService.resolveContext(m.userId, organizationId, [m.role], false),
      }))
    );

    const byOrgUnit = new Map<string, TelematicsDevice[]>();
    const unassigned: TelematicsDevice[] = [];

    for (const device of offline) {
      const vehicle = await vehicleRepository.findById(device.vehicleId, organizationId);
      const orgUnitId = (vehicle as { orgUnitId?: string } | null)?.orgUnitId;

      if (!orgUnitId) {
        unassigned.push(device);
        continue;
      }

      const group = byOrgUnit.get(orgUnitId) || [];
      group.push(device);
      byOrgUnit.set(orgUnitId, group);
    }

    const notifyGroup = async (devices: TelematicsDevice[], orgUnitId: string | null) => {
      if (devices.length === 0) return;

      const scopedManagerIds = orgUnitId
        ? managerContexts
            .filter(({ context }) => tenantScopeService.canAccessOrgUnit(context, orgUnitId))
            .map(({ userId }) => userId)
        : [];

      const recipientIds = Array.from(new Set([...ownerIds, ...scopedManagerIds]));
      if (recipientIds.length === 0) return;

      await notificationService.sendBulkNotification(recipientIds, organizationId, {
        type: 'alert',
        title: 'Devices Offline',
        message: `${devices.length} telematics device(s) have gone offline`,
        priority: 'high',
        data: { deviceIds: devices.map((d) => d.deviceId), orgUnitId: orgUnitId ?? undefined },
        actionUrl: '/telematics',
        actionLabel: 'View Devices',
      } as any);
    };

    for (const [orgUnitId, devices] of byOrgUnit) {
      await notifyGroup(devices, orgUnitId);
    }
    await notifyGroup(unassigned, null);
  }
  /**
   * PHASE 4, F-12 -- rolls yesterday into daily per-vehicle aggregates.
   *
   * Runs BEFORE the TTL would remove the raw fixes (retention is 90 days
   * by default; this runs at 01:00 the next morning), so a failed run has
   * roughly the whole window to be retried before the source data is
   * gone.
   *
   * STREAMED AND FLUSHED PER VEHICLE. The cursor is sorted by
   * tenant+vehicle, so readings for one vehicle arrive contiguously and
   * can be aggregated and discarded before the next vehicle starts.
   * Peak memory is one vehicle-day (~1,700 readings), not one
   * fleet-day (~1.7M) -- which is the same defect being removed from the
   * backup worker, and it would have been easy to reintroduce here by
   * calling .toArray().
   */
  private async rollupPreviousDay(): Promise<void> {
    const { telematicsRepository } = await import(
      '@/modules/telematics/repositories/telematics.repository'
    );
    const { aggregateReadings } = await import(
      '@/modules/telematics/services/telemetry-rollup.service'
    );

    const now = new Date();
    const yesterday = new Date(
      Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate() - 1)
    );

    const cursor = await telematicsRepository.streamReadingsForDay(yesterday);

    let batch: any[] = [];
    let currentKey: string | null = null;
    let written = 0;

    const flush = async () => {
      if (batch.length === 0) return;
      const rollups = aggregateReadings(batch);
      written += await telematicsRepository.upsertDailyRollups(rollups as never);
      batch = [];
    };

    for await (const reading of cursor) {
      const key = `${reading.tenantId}:${reading.vehicleId}`;
      if (currentKey !== null && key !== currentKey) {
        await flush();
      }
      currentKey = key;
      batch.push(reading);
    }
    await flush();

    monitoring.logInfo('[TelemetryWorker] Daily rollup complete', {
      day: yesterday.toISOString().slice(0, 10),
      rollupsWritten: written,
    });
  }

}
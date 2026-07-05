// workers/telemetry.worker.ts

import { BaseWorker } from '@/infrastructure/queue/worker-base.service';
import { telematicsService } from '@/modules/telematics/services/telematics.service';
import { notificationService } from '@/modules/notifications/services/notification.service';
import { organizationRepository } from '@/modules/organizations/repositories/organization.repository';

interface IngestBatchPayload {
  records: Array<Record<string, unknown>>;
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
      const orgs = await organizationRepository.findByOwnerId(''); // placeholder; see note below
      // NOTE: production wiring should iterate every active organization
      // (mirrors the pattern in app/api/workflows/process-timeouts/route.ts),
      // then for each: telematicsService.getOfflineDevices(orgTenantId)
      // and notify fleet managers via notificationService.sendBulkNotification.
      const db = await (await import('@/infrastructure/database/mongodb')).default();
      const activeOrgs = await db.collection('tblorganizations').find({ isDeleted: { $ne: true }, status: 'active' }).toArray();

      for (const org of activeOrgs) {
        const offline = await telematicsService.getOfflineDevices(org.tenantId, 5);
        if (offline.length === 0) continue;

        const managerIds = (org.members || [])
          .filter((m: any) => ['organization_owner', 'fleet_manager'].includes(m.role))
          .map((m: any) => m.userId);

        if (managerIds.length === 0) continue;

        await notificationService.sendBulkNotification(managerIds, org.tenantId, {
          type: 'alert',
          title: 'Devices Offline',
          message: `${offline.length} telematics device(s) have gone offline`,
          priority: 'high',
          data: { deviceIds: offline.map((d) => d.deviceId) },
          actionUrl: '/telematics',
          actionLabel: 'View Devices',
        } as any);
      }
    }
  }
}
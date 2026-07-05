// workers/cleanup.worker.ts

import { BaseWorker } from '@/infrastructure/queue/worker-base.service';
import { notificationService } from '@/modules/notifications/services/notification.service';
import { sessionRepository } from '@/modules/security/repositories/session.repository';
import { refreshTokenRepository } from '@/modules/security/repositories/refresh-token.repository';
import { apiKeyRepository } from '@/modules/security/repositories/api-key.repository';
import { resourcePermissionRepository } from '@/modules/security/repositories/resource-permission.repository';
import { permissionCacheService } from '@/modules/security/services/permission-cache.service';
import { OutboxRepository } from '@/server/events/outbox/OutboxRepository';
import { monitoring } from '@/infrastructure/monitoring/logger';

const outboxRepository = new OutboxRepository();

/**
 * Housekeeping jobs, all low-priority/recurring, each independently
 * idempotent so a partial failure never corrupts state:
 *  - cleanup-sessions: expires stale UserSession/RefreshToken/ApiKey rows
 *  - cleanup-notifications: purges old/expired notifications per tenant
 *  - cleanup-outbox: removes processed outbox events past retention
 *  - expire-resource-grants: soft-deletes expired ResourcePermission grants
 */
export class CleanupWorker extends BaseWorker<Record<string, never>> {
  constructor(queueName: 'cleanup-jobs') {
    super(queueName);
  }

  protected async process(jobName: string): Promise<void> {
    switch (jobName) {
      case 'cleanup-sessions': {
        const [sessions, tokens, keys] = await Promise.all([
          sessionRepository.expireStaleSessions(),
          refreshTokenRepository.deleteExpired(),
          apiKeyRepository.expireStaleKeys(),
        ]);
        monitoring.logInfo(`[CleanupWorker] Expired ${sessions} session(s), removed ${tokens} refresh token(s), expired ${keys} API key(s)`);
        return;
      }

      case 'cleanup-notifications': {
        const db = await (await import('@/infrastructure/database/mongodb')).default();
        const orgs = await db.collection('tblorganizations').find({ isDeleted: { $ne: true } }).project({ tenantId: 1 }).toArray();
        let total = 0;
        for (const org of orgs) {
          total += await notificationService.cleanupOldNotifications(org.tenantId, 30);
        }
        monitoring.logInfo(`[CleanupWorker] Purged ${total} old notification(s)`);
        return;
      }

      case 'cleanup-outbox': {
        const collection = await (outboxRepository as any).getCollection();
        const cutoff = new Date(Date.now() - 7 * 24 * 3600 * 1000);
        const result = await collection.deleteMany({ processed: true, processedAt: { $lt: cutoff } });
        monitoring.logInfo(`[CleanupWorker] Purged ${result.deletedCount} processed outbox event(s)`);
        return;
      }

      case 'expire-resource-grants': {
        const expired = await resourcePermissionRepository.expireStaleGrants();
        if (expired > 0) await permissionCacheService.invalidateAll();
        monitoring.logInfo(`[CleanupWorker] Expired ${expired} resource permission grant(s)`);
        return;
      }

      default:
        monitoring.logWarn(`[CleanupWorker] Unknown job name "${jobName}"`);
    }
  }
}
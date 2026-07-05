// server/events/handlers/security/PermissionCacheInvalidationHandler.ts

import { IEventHandler } from '../../base/IEventHandler';
import { DomainEvent } from '../../base/DomainEvent';
import { permissionCacheService } from '@/modules/security/services/permission-cache.service';
import { monitoring } from '@/infrastructure/monitoring/logger';

/**
 * Invalidates cached permission decisions whenever the inputs that feed
 * the Permission Engine change: a custom role's permission set, an
 * explicit resource-level grant/denial, an org unit's hierarchy, or a
 * user's scope assignment. Without this, a revoked grant or a demoted
 * custom role could remain effectively active until the cache TTL
 * (permission-cache.service.ts) expires on its own.
 *
 * This invalidates the whole tenant's permission cache rather than
 * computing the precise blast radius of a single grant change (which
 * subject(s), which resource(s), which org units inherit from it) â€”
 * permission decisions are cheap to recompute and cached for only a
 * short TTL, so tenant-wide invalidation trades a small amount of extra
 * recomputation for correctness simplicity.
 */
export class PermissionCacheInvalidationHandler implements IEventHandler<DomainEvent> {
  async handle(event: DomainEvent): Promise<void> {
    const tenantId =
      (event.metadata?.tenantId as string) ||
      (event.payload?.tenantId as string) ||
      'default';

    try {
      await permissionCacheService.invalidateTenant(tenantId);
    } catch (error) {
      monitoring.logError(
        `[PermissionCacheInvalidationHandler] Failed to invalidate cache for tenant ${tenantId}`,
        error as Error,
        { eventName: event.eventName }
      );
    }
  }
}
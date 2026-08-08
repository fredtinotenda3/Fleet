// modules/notifications/repositories/notification.repository.ts

import { TenantScopedRepository } from '@/server/repositories/tenant-scoped.repository';
import { tenantScopeService } from '@/modules/tenancy/services/tenant-scope.service';
import { TenantContext } from '@/modules/tenancy/services/tenant-context.service';
import { Notification } from '../types/notification.types';
import { Filter, ObjectId, UpdateFilter } from 'mongodb';
import {
  PaginationParams,
  PaginatedResponse,
} from '@/shared/types/common.types';

/**
 * FIX (Phase C -- notifications hierarchy filtering): previously extended
 * BaseRepository directly, same gap #4 class as fuel/expense/maintenance/
 * trips before Phase B. Now extends TenantScopedRepository<Notification>
 * so broadcast (orgUnitId-tagged) notifications are scoped the same way
 * every other domain module's org-unit data already is.
 */
export class NotificationRepository extends TenantScopedRepository<Notification> {
  protected collectionName = 'tblnotifications';

  /**
   * A notification is visible to `userId` if either:
   *  (a) it's a direct notification addressed to them (unchanged
   *      behaviour), or
   *  (b) it's a broadcast (no userId, has orgUnitId) whose orgUnitId is
   *      inside the caller's accessibleOrgUnitIds -- same
   *      tenantScopeService.buildFilter semantics fuel/expense/etc. use:
   *      null = unrestricted (full-visibility roles see every broadcast
   *      in the tenant), [] = fail closed, otherwise exact $in match.
   */
  private buildVisibilityFilter(userId: string, context: TenantContext): Filter<Notification> {
    const broadcastScope = tenantScopeService.buildFilter<Notification>(context, 'orgUnitId');
    return {
      $or: [
        { userId },
        {
          userId: { $exists: false },
          orgUnitId: { $exists: true },
          ...broadcastScope,
        },
      ],
    } as Filter<Notification>;
  }

  /** "Unread" for a direct notification is `read !== true`; for a broadcast it's "userId not yet in readBy". */
  private buildUnreadFilter(userId: string): Filter<Notification> {
    return {
      $or: [
        { userId, read: { $ne: true } },
        { userId: { $exists: false }, readBy: { $ne: userId } },
      ],
    } as Filter<Notification>;
  }

  // ── Legacy, userId+tenantId-only methods (unchanged; kept for callers not yet passing TenantContext) ──

  /** @deprecated Prefer findByUserIdInScope -- does not filter out-of-scope broadcasts. */
  async findByUserId(
    userId: string,
    tenantId: string,
    pagination: PaginationParams,
    unreadOnly: boolean = false
  ): Promise<PaginatedResponse<Notification>> {
    const filter: Filter<Notification> = {
      userId,
      ...(unreadOnly && { read: { $ne: true } }),
    } as Filter<Notification>;

    return this.findWithPagination(filter, pagination, tenantId);
  }

  /** @deprecated Prefer getUnreadCountInScope. */
  async getUnreadCount(userId: string, tenantId: string): Promise<number> {
    const collection = await this.getCollection();
    const filter = {
      ...this.getActiveFilter(tenantId),
      userId,
      read: { $ne: true },
    };
    return collection.countDocuments(filter as unknown as Filter<Notification>);
  }

  /** @deprecated Prefer markAsReadInScope -- can't mark broadcast notifications read. */
  async markAsRead(
    notificationId: string,
    userId: string,
    tenantId: string
  ): Promise<boolean> {
    if (!ObjectId.isValid(notificationId)) return false;
    const collection = await this.getCollection();
    const filter = {
      ...this.getActiveFilter(tenantId),
      _id: new ObjectId(notificationId),
      userId,
    };

    const result = await collection.updateOne(
      filter as unknown as Filter<Notification>,
      { $set: { read: true, readAt: new Date() } }
    );

    return result.modifiedCount > 0;
  }

  /** @deprecated Prefer markAllAsReadInScope. */
  async markAllAsRead(userId: string, tenantId: string): Promise<number> {
    const collection = await this.getCollection();
    const filter = {
      ...this.getActiveFilter(tenantId),
      userId,
      read: { $ne: true },
    };

    const result = await collection.updateMany(
      filter as unknown as Filter<Notification>,
      { $set: { read: true, readAt: new Date() } }
    );

    return result.modifiedCount;
  }

  /** @deprecated Prefer getHighPriorityUnreadInScope -- currently reaches every tenant user regardless of org unit (audit gap #4). */
  async getHighPriorityUnread(tenantId: string): Promise<Notification[]> {
    return this.findMany(
      {
        read: { $ne: true },
        priority: { $in: ['high', 'critical'] },
      } as unknown as Filter<Notification>,
      tenantId,
      { sortBy: 'sentAt', sortOrder: 'desc' }
    );
  }

  async deleteOldNotifications(tenantId: string, daysOld: number = 30): Promise<number> {
    const collection = await this.getCollection();
    const cutoffDate = new Date();
    cutoffDate.setDate(cutoffDate.getDate() - daysOld);

    const filter = {
      ...this.getActiveFilter(tenantId),
      sentAt: { $lt: cutoffDate },
      read: true,
    };

    const result = await collection.deleteMany(filter as unknown as Filter<Notification>);
    return result.deletedCount || 0;
  }

  async deleteExpired(tenantId: string): Promise<number> {
    const collection = await this.getCollection();
    const filter = {
      ...this.getActiveFilter(tenantId),
      expiresAt: { $lt: new Date() },
    };
    const result = await collection.deleteMany(filter as unknown as Filter<Notification>);
    return result.deletedCount || 0;
  }

  // ── NEW (Phase C): org-unit-hierarchy-aware variants ──

  async findByUserIdInScope(
    userId: string,
    context: TenantContext,
    pagination: PaginationParams,
    unreadOnly: boolean = false
  ): Promise<PaginatedResponse<Notification>> {
    const visibility = this.buildVisibilityFilter(userId, context);
    const filter = unreadOnly
      ? ({ $and: [visibility, this.buildUnreadFilter(userId)] } as Filter<Notification>)
      : visibility;

    return this.findWithPagination(filter, pagination, context.organizationId);
  }

  async getUnreadCountInScope(userId: string, context: TenantContext): Promise<number> {
    const collection = await this.getCollection();
    const filter = {
      ...this.getActiveFilter(context.organizationId),
      $and: [this.buildVisibilityFilter(userId, context), this.buildUnreadFilter(userId)],
    };
    return collection.countDocuments(filter as unknown as Filter<Notification>);
  }

  /**
   * Marks a notification read for `userId`. Tries the direct
   * (userId-targeted) update first; if nothing matched, falls back to
   * the broadcast path -- $addToSet on readBy, only if the notification
   * is actually within the caller's org-unit scope (so a user can't
   * mark-read a broadcast they weren't allowed to see in the first
   * place).
   */
  async markAsReadInScope(
    notificationId: string,
    userId: string,
    context: TenantContext
  ): Promise<boolean> {
    if (!ObjectId.isValid(notificationId)) return false;
    const collection = await this.getCollection();
    const _id = new ObjectId(notificationId);
    const base = this.getActiveFilter(context.organizationId);

    const directResult = await collection.updateOne(
      { ...base, _id, userId } as unknown as Filter<Notification>,
      { $set: { read: true, readAt: new Date() } }
    );
    if (directResult.modifiedCount > 0) return true;

    const broadcastScope = tenantScopeService.buildFilter<Notification>(context, 'orgUnitId');
    const broadcastResult = await collection.updateOne(
      {
        ...base,
        _id,
        userId: { $exists: false },
        orgUnitId: { $exists: true },
        ...broadcastScope,
      } as unknown as Filter<Notification>,
      { $addToSet: { readBy: userId } } as unknown as UpdateFilter<Notification>
    );
    return broadcastResult.modifiedCount > 0;
  }

  async markAllAsReadInScope(userId: string, context: TenantContext): Promise<number> {
    const collection = await this.getCollection();
    const base = this.getActiveFilter(context.organizationId);
    const broadcastScope = tenantScopeService.buildFilter<Notification>(context, 'orgUnitId');

    const [directResult, broadcastResult] = await Promise.all([
      collection.updateMany(
        { ...base, userId, read: { $ne: true } } as Filter<Notification>,
        { $set: { read: true, readAt: new Date() } }
      ),
      collection.updateMany(
        {
          ...base,
          userId: { $exists: false },
          orgUnitId: { $exists: true },
          readBy: { $ne: userId },
          ...broadcastScope,
        } as Filter<Notification>,
        { $addToSet: { readBy: userId } } as unknown as UpdateFilter<Notification>
      ),
    ]);

    return directResult.modifiedCount + broadcastResult.modifiedCount;
  }

  async getHighPriorityUnreadInScope(userId: string, context: TenantContext): Promise<Notification[]> {
    const visibility = this.buildVisibilityFilter(userId, context);
    const unread = this.buildUnreadFilter(userId);
    return this.findMany(
      {
        $and: [visibility, unread, { priority: { $in: ['high', 'critical'] } }],
      } as unknown as Filter<Notification>,
      context.organizationId,
      { sortBy: 'sentAt', sortOrder: 'desc' }
    );
  }
}

export const notificationRepository = new NotificationRepository();
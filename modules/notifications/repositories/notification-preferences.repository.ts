// modules/notifications/repositories/notification-preferences.repository.ts

import connectToDatabase from '@/infrastructure/database/mongodb';
import { NotificationPreferences } from '../types/notification.types';
import { resolveTenantScope } from '@/server/tenancy/tenant-scope';

/**
 * Preferences are stored in their own collection (tblnotification_preferences),
 * keyed by userId + tenantId, rather than being shoehorned into the
 * notifications collection with a synthetic string _id (which broke
 * BaseRepository's ObjectId assumptions and could collide with real
 * notification documents).
 *
 * ---------------------------------------------------------------------
 * Phase F: why this repository does NOT get an orgUnitId filter
 * ---------------------------------------------------------------------
 * Its sibling, NotificationRepository, is org-unit scoped, so the
 * obvious move is to copy that. That would be wrong here, and the
 * difference is worth stating rather than leaving as an apparent
 * oversight for the next person to "fix".
 *
 * A preferences row is keyed by userId. userId is STRICTLY NARROWER than
 * any org-unit predicate: there is no caller for whom "my own
 * preferences" and "preferences in my org unit" differ, because a user
 * only ever reads their own row. Adding an orgUnitId filter would add no
 * security and would introduce a real bug -- a user moved between
 * branches would silently lose their notification settings, because the
 * row would no longer match their new scope.
 *
 * What WAS genuinely missing is the fail-closed tenant check. This class
 * does not extend BaseRepository, so it never went through
 * getTenantFilter() and therefore never called resolveTenantScope(). A
 * caller arriving with a legacy sentinel ('default') or an empty
 * tenantId got a raw, unvalidated query -- the exact fail-open shape
 * that caused the original cross-organization leak. Every method now
 * resolves the scope first and throws TenantScopeError on a bad value,
 * matching BaseRepository's behaviour precisely.
 */
export class NotificationPreferencesRepository {
  private readonly collectionName = 'tblnotification_preferences';

  private async getCollection() {
    const db = await connectToDatabase();
    return db.collection<NotificationPreferences & { _docId?: string }>(
      this.collectionName
    );
  }

  /**
   * Validates the tenant scope and returns the concrete tenant id.
   *
   * Platform scope is deliberately REFUSED rather than returning every
   * tenant's rows: "the platform admin's notification preferences" is
   * not a meaningful query, and a wildcard here would let an operator's
   * preference write land on an arbitrary customer's row.
   */
  private requireTenant(tenantId: string): string {
    const scope = resolveTenantScope(tenantId);
    if (scope.kind === 'platform') {
      throw new Error(
        'Notification preferences are per-user within one organization and ' +
          'cannot be read or written at platform scope.'
      );
    }
    return scope.tenantId;
  }

  async get(userId: string, tenantId: string): Promise<NotificationPreferences | null> {
    const scopedTenantId = this.requireTenant(tenantId);
    const collection = await this.getCollection();
    const result = await collection.findOne({ userId, tenantId: scopedTenantId });
    if (!result) return null;
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    const { _id, ...preferences } = result as any;
    return preferences as NotificationPreferences;
  }

  async upsert(
    userId: string,
    tenantId: string,
    preferences: Partial<NotificationPreferences>
  ): Promise<void> {
    const scopedTenantId = this.requireTenant(tenantId);
    const collection = await this.getCollection();

    /**
     * `userId` and `tenantId` are stripped from the caller-supplied
     * payload before the spread, so a request body carrying its own
     * userId/tenantId cannot retarget the write at another user's row.
     * This is the same key-collision class that made BaseRepository's
     * filters bypassable before the spread order was reversed there.
     */
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    const { userId: _ignoredUserId, tenantId: _ignoredTenantId, ...safe } =
      preferences as Partial<NotificationPreferences> & {
        userId?: string;
        tenantId?: string;
      };

    await collection.updateOne(
      { userId, tenantId: scopedTenantId },
      {
        $set: {
          ...safe,
          userId,
          tenantId: scopedTenantId,
          updatedAt: new Date(),
        },
        $setOnInsert: {
          createdAt: new Date(),
        },
      },
      { upsert: true }
    );
  }

  async delete(userId: string, tenantId: string): Promise<boolean> {
    const scopedTenantId = this.requireTenant(tenantId);
    const collection = await this.getCollection();
    const result = await collection.deleteOne({ userId, tenantId: scopedTenantId });
    return result.deletedCount > 0;
  }
}

export const notificationPreferencesRepository = new NotificationPreferencesRepository();

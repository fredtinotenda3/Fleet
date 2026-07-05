// modules/notifications/repositories/notification-preferences.repository.ts

import connectToDatabase from '@/infrastructure/database/mongodb';
import { NotificationPreferences } from '../types/notification.types';

/**
 * Preferences are stored in their own collection (tblnotification_preferences),
 * keyed by userId + tenantId, rather than being shoehorned into the
 * notifications collection with a synthetic string _id (which broke
 * BaseRepository's ObjectId assumptions and could collide with real
 * notification documents).
 */
export class NotificationPreferencesRepository {
  private readonly collectionName = 'tblnotification_preferences';

  private async getCollection() {
    const db = await connectToDatabase();
    return db.collection<NotificationPreferences & { _docId?: string }>(
      this.collectionName
    );
  }

  async get(userId: string, tenantId: string): Promise<NotificationPreferences | null> {
    const collection = await this.getCollection();
    const result = await collection.findOne({ userId, tenantId });
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
    const collection = await this.getCollection();
    await collection.updateOne(
      { userId, tenantId },
      {
        $set: {
          ...preferences,
          userId,
          tenantId,
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
    const collection = await this.getCollection();
    const result = await collection.deleteOne({ userId, tenantId });
    return result.deletedCount > 0;
  }
}

export const notificationPreferencesRepository = new NotificationPreferencesRepository();
// modules/notifications/repositories/notification.repository.ts

import { BaseRepository } from '@/server/repositories/base.repository';
import { Notification, NotificationPreferences } from '../types/notification.types';
import { Filter, ObjectId } from 'mongodb';

export class NotificationRepository extends BaseRepository<Notification> {
  protected collectionName = 'tblnotifications';

  async findByUserId(
    userId: string,
    tenantId: string,
    page: number = 1,
    limit: number = 20,
    unreadOnly: boolean = false
  ): Promise<{ data: Notification[]; total: number; page: number; totalPages: number }> {
    const filter: Filter<Notification> = { userId } as Filter<Notification>;
    
    if (unreadOnly) {
      filter.read = { $ne: true } as any;
    }
    
    const result = await this.findWithPagination(filter, { page, limit }, tenantId);
    
    return {
      data: result.data,
      total: result.pagination.total,
      page: result.pagination.page,
      totalPages: result.pagination.totalPages,
    };
  }

  async getUnreadCount(userId: string, tenantId: string): Promise<number> {
    const collection = await this.getCollection();
    const filter = {
      ...this.getActiveFilter(tenantId),
      userId,
      read: { $ne: true },
    };
    
    return collection.countDocuments(filter as Filter<Notification>);
  }

  async markAsRead(notificationId: string, userId: string, tenantId: string): Promise<boolean> {
    const collection = await this.getCollection();
    const filter = {
      ...this.getActiveFilter(tenantId),
      _id: new ObjectId(notificationId),
      userId,
    };
    
    const result = await collection.updateOne(filter as Filter<Notification>, {
      $set: { read: true, readAt: new Date() },
    });
    
    return result.modifiedCount > 0;
  }

  async markAllAsRead(userId: string, tenantId: string): Promise<number> {
    const collection = await this.getCollection();
    const filter = {
      ...this.getActiveFilter(tenantId),
      userId,
      read: { $ne: true },
    };
    
    const result = await collection.updateMany(filter as Filter<Notification>, {
      $set: { read: true, readAt: new Date() },
    });
    
    return result.modifiedCount;
  }

  async deleteOldNotifications(daysOld: number = 30, tenantId: string): Promise<number> {
    const collection = await this.getCollection();
    const cutoffDate = new Date();
    cutoffDate.setDate(cutoffDate.getDate() - daysOld);
    
    const filter = {
      ...this.getActiveFilter(tenantId),
      sentAt: { $lt: cutoffDate },
      read: true,
    };
    
    const result = await collection.deleteMany(filter as Filter<Notification>);
    return result.deletedCount || 0;
  }

  async getPreferences(userId: string, tenantId: string): Promise<NotificationPreferences | null> {
    const collection = await this.getCollection();
    const result = await collection.findOne({
      _id: `prefs_${userId}` as any,
      tenantId,
    });
    
    return result as NotificationPreferences || null;
  }

  async upsertPreferences(
    userId: string,
    tenantId: string,
    preferences: Partial<NotificationPreferences>
  ): Promise<void> {
    const collection = await this.getCollection();
    
    await collection.updateOne(
      { _id: `prefs_${userId}`, tenantId },
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

  async getNotificationsByType(
    type: string,
    tenantId: string,
    limit: number = 100
  ): Promise<Notification[]> {
    const filter = {
      type,
      read: false,
    };
    
    return this.findMany(filter, tenantId, { limit, sortBy: 'sentAt', sortOrder: 'desc' });
  }

  async getRecentNotifications(
    tenantId: string,
    hours: number = 24,
    limit: number = 50
  ): Promise<Notification[]> {
    const cutoffDate = new Date();
    cutoffDate.setHours(cutoffDate.getHours() - hours);
    
    const filter = {
      sentAt: { $gte: cutoffDate },
    };
    
    return this.findMany(filter, tenantId, { limit, sortBy: 'sentAt', sortOrder: 'desc' });
  }

  async getHighPriorityUnread(tenantId: string): Promise<Notification[]> {
    const filter = {
      read: { $ne: true },
      priority: { $in: ['high', 'critical'] },
    };
    
    return this.findMany(filter, tenantId, { sortBy: 'sentAt', sortOrder: 'desc' });
  }
}

export const notificationRepository = new NotificationRepository();
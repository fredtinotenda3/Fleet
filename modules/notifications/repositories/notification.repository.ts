// modules/notifications/repositories/notification.repository.ts

import { BaseRepository } from '@/server/repositories/base.repository';
import { Notification } from '../types/notification.types';
import { Filter, ObjectId } from 'mongodb';
import {
  PaginationParams,
  PaginatedResponse,
} from '@/shared/types/common.types';

export class NotificationRepository extends BaseRepository<Notification> {
  protected collectionName = 'tblnotifications';

  async findByUserId(
    userId: string,
    tenantId: string,
    pagination: PaginationParams,
    unreadOnly: boolean = false
  ): Promise<PaginatedResponse<Notification>> {
    const filter: Filter<Notification> = { 
      userId,
      ...(unreadOnly && { read: { $ne: true } })
    } as Filter<Notification>;

    return this.findWithPagination(filter, pagination, tenantId);
  }

  async getUnreadCount(userId: string, tenantId: string): Promise<number> {
    const collection = await this.getCollection();
    const filter = {
      ...this.getActiveFilter(tenantId),
      userId,
      read: { $ne: true },
    };
    return collection.countDocuments(filter as unknown as Filter<Notification>);
  }

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
      {
        $set: { read: true, readAt: new Date() },
      }
    );

    return result.modifiedCount > 0;
  }

  async markAllAsRead(userId: string, tenantId: string): Promise<number> {
    const collection = await this.getCollection();
    const filter = {
      ...this.getActiveFilter(tenantId),
      userId,
      read: { $ne: true },
    };

    const result = await collection.updateMany(
      filter as unknown as Filter<Notification>,
      {
        $set: { read: true, readAt: new Date() },
      }
    );

    return result.modifiedCount;
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

  async deleteExpired(tenantId: string): Promise<number> {
    const collection = await this.getCollection();
    const filter = {
      ...this.getActiveFilter(tenantId),
      expiresAt: { $lt: new Date() },
    };
    const result = await collection.deleteMany(filter as unknown as Filter<Notification>);
    return result.deletedCount || 0;
  }
}

export const notificationRepository = new NotificationRepository();
// modules/notifications/services/notification.service.ts

import {
  Notification,
  NotificationPreferences,
  NotificationType,
} from '../types/notification.types';
import { notificationRepository } from '../repositories/notification.repository';
import { notificationPreferencesRepository } from '../repositories/notification-preferences.repository';
import { PaginationParams, PaginatedResponse } from '@/shared/types/common.types';

// Lazy-load the WebSocket manager to avoid circular dependencies
let webSocketManagerPromise: Promise<any> | null = null;
function getWebSocketManager() {
  if (!webSocketManagerPromise) {
    webSocketManagerPromise = import('@/infrastructure/websocket/server').then(
      (mod) => mod.webSocketManager
    );
  }
  return webSocketManagerPromise;
}

type NewNotificationInput = Omit<
  Notification,
  | '_id'
  | 'createdAt'
  | 'updatedAt'
  | 'tenantId'
  | 'sentAt'
  | 'read'
  | 'readAt'
  | 'deliveryMethods'
  | 'isDeleted'
>;

export class NotificationService {
  async sendNotification(
    userId: string,
    tenantId: string,
    notification: NewNotificationInput
  ): Promise<Notification | null> {
    const preferences = await this.getPreferences(userId, tenantId);
    const typeConfig = preferences.types[notification.type];

    if (!typeConfig?.enabled) {
      return null;
    }

    const deliveryMethods = typeConfig.channels.filter(
      (channel) => preferences.channels[channel as keyof typeof preferences.channels]
    );

    if (deliveryMethods.length === 0) {
      return null;
    }

    const notificationData: Omit<Notification, '_id' | 'createdAt' | 'updatedAt'> = {
      tenantId,
      userId,
      type: notification.type,
      title: notification.title,
      message: notification.message,
      data: notification.data,
      priority: notification.priority,
      actionUrl: notification.actionUrl,
      actionLabel: notification.actionLabel,
      expiresAt: notification.expiresAt,
      read: false,
      readAt: undefined,
      sentAt: new Date(),
      deliveryMethods,
      isDeleted: false,
    };

    const savedNotification = await notificationRepository.create(
      notificationData,
      tenantId,
      userId
    );

    if (deliveryMethods.includes('in_app')) {
      try {
        const wsManager = await getWebSocketManager();
        wsManager.emitToUser(userId, 'notification:new', {
          id: savedNotification._id,
          title: notification.title,
          message: notification.message,
          type: notification.type,
          priority: notification.priority,
          actionUrl: notification.actionUrl,
        });
      } catch {
        // WebSocket manager may not be initialised in all environments
      }
    }

    return savedNotification;
  }

  async sendBulkNotification(
    userIds: string[],
    tenantId: string,
    notification: Omit<NewNotificationInput, 'userId'>
  ): Promise<Notification[]> {
    const results = await Promise.all(
      userIds.map((userId) =>
        this.sendNotification(userId, tenantId, {
          ...notification,
          userId,
        } as NewNotificationInput)
      )
    );
    return results.filter((r): r is Notification => r !== null);
  }

  async sendMaintenanceOverdue(reminder: any, tenantId: string): Promise<void> {
    const assignee = reminder.assigned_to || reminder.createdBy;
    if (!assignee) return;

    await this.sendNotification(assignee, tenantId, {
      userId: assignee,
      type: 'maintenance_overdue',
      title: 'Maintenance Overdue',
      message: `${reminder.title} for vehicle ${reminder.license_plate} is overdue`,
      priority: 'high',
      data: { reminderId: reminder._id, licensePlate: reminder.license_plate },
      actionUrl: `/maintenance/${reminder._id}`,
      actionLabel: 'View Service',
    } as NewNotificationInput);
  }

  async sendMaintenanceUpcoming(reminder: any, tenantId: string): Promise<void> {
    const daysUntil = Math.ceil(
      (new Date(reminder.due_date).getTime() - new Date().getTime()) / (1000 * 60 * 60 * 24)
    );

    if (daysUntil > 3) return;

    const assignee = reminder.assigned_to || reminder.createdBy;
    if (!assignee) return;

    await this.sendNotification(assignee, tenantId, {
      userId: assignee,
      type: 'maintenance_upcoming',
      title: 'Maintenance Due Soon',
      message: `${reminder.title} for vehicle ${reminder.license_plate} is due in ${daysUntil} days`,
      priority: 'medium',
      data: { reminderId: reminder._id, licensePlate: reminder.license_plate, daysUntil },
      actionUrl: `/maintenance/${reminder._id}`,
      actionLabel: 'Schedule Service',
    } as NewNotificationInput);
  }

  async getNotifications(
    userId: string,
    tenantId: string,
    pagination: PaginationParams,
    unreadOnly: boolean = false
  ): Promise<PaginatedResponse<Notification>> {
    return notificationRepository.findByUserId(userId, tenantId, pagination, unreadOnly);
  }

  async markAsRead(notificationId: string, userId: string, tenantId: string): Promise<void> {
    await notificationRepository.markAsRead(notificationId, userId, tenantId);
  }

  async markAllAsRead(userId: string, tenantId: string): Promise<number> {
    return notificationRepository.markAllAsRead(userId, tenantId);
  }

  async getUnreadCount(userId: string, tenantId: string): Promise<number> {
    return notificationRepository.getUnreadCount(userId, tenantId);
  }

  async getHighPriorityUnread(tenantId: string) {
    return notificationRepository.getHighPriorityUnread(tenantId);
  }

  async cleanupOldNotifications(tenantId: string, daysOld: number = 30): Promise<number> {
    const [expired, old] = await Promise.all([
      notificationRepository.deleteExpired(tenantId),
      notificationRepository.deleteOldNotifications(tenantId, daysOld),
    ]);
    return expired + old;
  }

  async getPreferences(userId: string, tenantId: string): Promise<NotificationPreferences> {
    const preferences = await notificationPreferencesRepository.get(userId, tenantId);
    return preferences || this.getDefaultPreferences(userId, tenantId);
  }

  async updatePreferences(
    userId: string,
    tenantId: string,
    preferences: Partial<NotificationPreferences>
  ): Promise<NotificationPreferences> {
    await notificationPreferencesRepository.upsert(userId, tenantId, preferences);
    return this.getPreferences(userId, tenantId);
  }

  private getDefaultPreferences(userId: string, tenantId: string): NotificationPreferences {
    return {
      userId,
      tenantId,
      channels: {
        in_app: true,
        email: true,
        push: false,
      },
      types: {
        maintenance_overdue: { enabled: true, channels: ['in_app', 'email'] },
        maintenance_upcoming: { enabled: true, channels: ['in_app', 'email'] },
        insurance_expiring: { enabled: true, channels: ['in_app', 'email'] },
        registration_expiring: { enabled: true, channels: ['in_app', 'email'] },
        expense_approved: { enabled: true, channels: ['in_app'] },
        expense_rejected: { enabled: true, channels: ['in_app'] },
        fuel_anomaly: { enabled: true, channels: ['in_app', 'email'] },
        trip_completed: { enabled: false, channels: [] },
        organization_invite: { enabled: true, channels: ['email'] },
        member_joined: { enabled: true, channels: ['in_app'] },
        report_ready: { enabled: true, channels: ['in_app', 'email'] },
        alert: { enabled: true, channels: ['in_app', 'email'] },
        reminder: { enabled: true, channels: ['in_app', 'email'] },
        system: { enabled: true, channels: ['in_app'] },
      },
      digest: {
        enabled: false,
        frequency: 'daily',
      },
    };
  }
}

export const notificationService = new NotificationService();
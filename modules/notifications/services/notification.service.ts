// modules/notifications/services/notification.service.ts

import { BaseService } from '@/server/services/base.service';
import { Notification, NotificationPreferences, NotificationType } from '../types/notification.types';
import { notificationRepository } from '../repositories/notification.repository';
import { webSocketManager } from '@/infrastructure/websocket/server';
import { queueService, JobType } from '@/infrastructure/queue/queue.service';
import { auditLog } from '@/infrastructure/monitoring/audit.logger';

export class NotificationService {
  async sendNotification(
    userId: string,
    tenantId: string,
    notification: Omit<Notification, '_id' | 'createdAt' | 'updatedAt' | 'tenantId' | 'sentAt' | 'read' | 'readAt' | 'deliveryMethods'>
  ): Promise<Notification> {
    const preferences = await this.getPreferences(userId, tenantId);
    const typeConfig = preferences.types[notification.type];

    // Check if user wants this notification type
    if (!typeConfig?.enabled) {
      return null as any;
    }

    const deliveryMethods = typeConfig.channels.filter(channel => 
      preferences.channels[channel as keyof typeof preferences.channels]
    );

    const notificationData: Omit<Notification, '_id' | 'createdAt' | 'updatedAt'> = {
      userId,
      tenantId,
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

    const result = await notificationRepository.create(notificationData, tenantId);
    const savedNotification = result as Notification;

    // Send real-time notification via WebSocket
    if (deliveryMethods.includes('in_app')) {
      webSocketManager.emitToUser(userId, 'notification:new', {
        id: savedNotification._id,
        title: notification.title,
        message: notification.message,
        type: notification.type,
        priority: notification.priority,
        actionUrl: notification.actionUrl,
      });
    }

    // Queue email delivery
    if (deliveryMethods.includes('email')) {
      await queueService.addJob(JobType.SEND_NOTIFICATION, {
        type: JobType.SEND_NOTIFICATION,
        payload: {
          type: 'email',
          userId,
          notification: savedNotification,
        },
        tenantId,
      });
    }

    await auditLog.logAction('NOTIFICATION_SENT', userId, tenantId, {
      type: notification.type,
      priority: notification.priority,
    });

    return savedNotification;
  }

  async sendBulkNotification(
    userIds: string[],
    tenantId: string,
    notification: Omit<Notification, '_id' | 'createdAt' | 'updatedAt' | 'tenantId' | 'userId' | 'sentAt' | 'read' | 'readAt' | 'deliveryMethods'>
  ): Promise<Notification[]> {
    const results = await Promise.all(
      userIds.map(userId => this.sendNotification(userId, tenantId, { ...notification, userId }))
    );
    return results.filter(Boolean);
  }

  async sendMaintenanceOverdue(reminder: any, tenantId: string): Promise<void> {
    await this.sendNotification(
      reminder.assigned_to || reminder.createdBy,
      tenantId,
      {
        userId: reminder.assigned_to || reminder.createdBy,
        type: 'maintenance_overdue',
        title: 'Maintenance Overdue',
        message: `${reminder.title} for vehicle ${reminder.license_plate} is overdue by ${this.getDaysOverdue(reminder.due_date)} days`,
        priority: 'high',
        data: { reminderId: reminder._id, licensePlate: reminder.license_plate },
        actionUrl: `/maintenance/${reminder._id}`,
        actionLabel: 'View Service',
      }
    );
  }

  async sendMaintenanceUpcoming(reminder: any, tenantId: string): Promise<void> {
    const daysUntil = this.getDaysUntil(reminder.due_date);
    
    if (daysUntil <= 3) {
      await this.sendNotification(
        reminder.assigned_to || reminder.createdBy,
        tenantId,
        {
          userId: reminder.assigned_to || reminder.createdBy,
          type: 'maintenance_upcoming',
          title: 'Maintenance Due Soon',
          message: `${reminder.title} for vehicle ${reminder.license_plate} is due in ${daysUntil} days`,
          priority: 'medium',
          data: { reminderId: reminder._id, licensePlate: reminder.license_plate, daysUntil },
          actionUrl: `/maintenance/${reminder._id}`,
          actionLabel: 'Schedule Service',
        }
      );
    }
  }

  async markAsRead(notificationId: string, userId: string, tenantId: string): Promise<void> {
    await notificationRepository.update(notificationId, { read: true, readAt: new Date() }, tenantId, userId);
  }

  async markAllAsRead(userId: string, tenantId: string): Promise<void> {
    await notificationRepository.markAllAsRead(userId, tenantId);
  }

  async getUnreadCount(userId: string, tenantId: string): Promise<number> {
    return notificationRepository.getUnreadCount(userId, tenantId);
  }

  async getPreferences(userId: string, tenantId: string): Promise<NotificationPreferences> {
    const preferences = await notificationRepository.getPreferences(userId, tenantId);
    if (!preferences) {
      return this.getDefaultPreferences(userId, tenantId);
    }
    return preferences;
  }

  async updatePreferences(userId: string, tenantId: string, preferences: Partial<NotificationPreferences>): Promise<void> {
    await notificationRepository.upsertPreferences(userId, tenantId, preferences);
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

  private getDaysOverdue(date: Date): number {
    return Math.max(0, Math.ceil((new Date().getTime() - new Date(date).getTime()) / (1000 * 60 * 60 * 24)));
  }

  private getDaysUntil(date: Date): number {
    return Math.max(0, Math.ceil((new Date(date).getTime() - new Date().getTime()) / (1000 * 60 * 60 * 24)));
  }
}

export const notificationService = new NotificationService();
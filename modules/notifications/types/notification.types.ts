// modules/notifications/types/notification.types.ts

import { BaseEntity } from '@/shared/types/common.types';

export interface Notification extends BaseEntity {
  userId: string;
  type: NotificationType;
  title: string;
  message: string;
  data?: Record<string, unknown>;
  read: boolean;
  readAt?: Date;
  priority: 'low' | 'medium' | 'high' | 'critical';
  actionUrl?: string;
  actionLabel?: string;
  expiresAt?: Date;
  sentAt: Date;
  deliveryMethods: ('in_app' | 'email' | 'push')[];
}

export type NotificationType =
  | 'maintenance_overdue'
  | 'maintenance_upcoming'
  | 'insurance_expiring'
  | 'registration_expiring'
  | 'expense_approved'
  | 'expense_rejected'
  | 'fuel_anomaly'
  | 'trip_completed'
  | 'organization_invite'
  | 'member_joined'
  | 'report_ready'
  | 'alert'
  | 'reminder'
  | 'system';

export interface NotificationPreferences {
  userId: string;
  tenantId: string;
  channels: {
    in_app: boolean;
    email: boolean;
    push: boolean;
  };
  types: Record<NotificationType, {
    enabled: boolean;
    channels: ('in_app' | 'email' | 'push')[];
  }>;
  digest: {
    enabled: boolean;
    frequency: 'daily' | 'weekly';
    lastSent?: Date;
  };
}

export interface NotificationTemplate {
  _id?: string;
  name: string;
  type: NotificationType;
  subject: string;
  body: string;
  bodyHtml?: string;
  variables: string[];
  createdAt: Date;
  updatedAt: Date;
}
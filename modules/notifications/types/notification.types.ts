// modules/notifications/types/notification.types.ts

import { BaseEntity } from '@/shared/types/common.types';

export interface Notification extends BaseEntity {
  /**
   * Required for direct, user-targeted notifications (existing
   * behaviour, unchanged). Absent on org-unit broadcast notifications
   * (Phase C) -- those are addressed via `orgUnitId` instead.
   */
  userId?: string;
  /**
   * FIX (Phase C -- notifications hierarchy filtering): new field.
   * Required on broadcast notifications (e.g. "fleet-wide alert"); the
   * org unit (branch/department/fleet/workshop) the notification is
   * scoped to. Read access is gated by TenantScopedRepository the same
   * way every other domain module's orgUnitId already is -- a user only
   * sees this notification if it's inside their
   * TenantContext.accessibleOrgUnitIds. Previously this filtering did
   * not exist at all: every notification method filtered only by
   * { userId, tenantId }, so "branch users never receive another
   * branch's notifications" was only incidentally true (everything
   * happened to be sent to a specific userId already). Left undefined
   * for direct notifications.
   */
  orgUnitId?: string;
  type: NotificationType;
  title: string;
  message: string;
  data?: Record<string, unknown>;
  /** Meaningful only for direct (userId-targeted) notifications. */
  read: boolean;
  readAt?: Date;
  /**
   * FIX (Phase C): meaningful only for org-unit broadcast notifications.
   * A broadcast is a single shared document visible to every user in
   * scope, so a single boolean `read` flag can't represent "read by
   * user A, unread for user B" -- this tracks per-user read receipts
   * instead. Left undefined/empty for direct notifications.
   */
  readBy?: string[];
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
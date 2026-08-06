// shared/validations/notification.schema.ts

import { z } from 'zod';

const notificationTypeSchema = z.enum([
  'maintenance_overdue',
  'maintenance_upcoming',
  'insurance_expiring',
  'registration_expiring',
  'expense_approved',
  'expense_rejected',
  'fuel_anomaly',
  'trip_completed',
  'organization_invite',
  'member_joined',
  'report_ready',
  'alert',
  'reminder',
  'system',
]);

const channelSchema = z.enum(['in_app', 'email', 'push']);

const typeConfigSchema = z.object({
  enabled: z.boolean(),
  channels: z.array(channelSchema),
});

export const notificationPreferencesUpdateSchema = z.object({
  channels: z
    .object({
      in_app: z.boolean().optional(),
      email: z.boolean().optional(),
      push: z.boolean().optional(),
    })
    .optional(),
  types: z.record(notificationTypeSchema, typeConfigSchema).optional(),
  digest: z
    .object({
      enabled: z.boolean().optional(),
      frequency: z.enum(['daily', 'weekly']).optional(),
    })
    .optional(),
});

export const notificationListQuerySchema = z.object({
  page: z.coerce.number().int().positive().default(1),
  limit: z.coerce.number().int().positive().max(100).default(20),
  unreadOnly: z.coerce.boolean().default(false),
});

/**
 * NEW (Phase C): payload for creating an org-unit broadcast notification
 * (e.g. "fleet-wide alert"), as opposed to a direct userId-targeted one.
 * `orgUnitId` is required -- this is what the TenantScopedRepository-style
 * read filter matches against.
 */
export const notificationBroadcastCreateSchema = z.object({
  orgUnitId: z.string().min(1, 'orgUnitId is required'),
  type: notificationTypeSchema,
  title: z.string().min(1).max(200),
  message: z.string().min(1).max(2000),
  priority: z.enum(['low', 'medium', 'high', 'critical']).default('medium'),
  actionUrl: z.string().url().optional(),
  actionLabel: z.string().max(100).optional(),
  expiresAt: z.coerce.date().optional(),
  // FIX: z.record() requires an explicit key-type argument in this zod
  // version -- z.record(z.unknown()) resolved to a 1-arg call and threw
  // "argument for 'valueType' was not provided" (it was reading
  // z.unknown() as the keyType and finding no valueType after it).
  data: z.record(z.string(), z.unknown()).optional(),
});

// Export the inferred types
export type NotificationPreferencesUpdateInput = z.infer<
  typeof notificationPreferencesUpdateSchema
>;
export type NotificationBroadcastCreateInput = z.infer<
  typeof notificationBroadcastCreateSchema
>;
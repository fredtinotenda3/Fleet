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

// Export the inferred type
export type NotificationPreferencesUpdateInput = z.infer<
  typeof notificationPreferencesUpdateSchema
>;
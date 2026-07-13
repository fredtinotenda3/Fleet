// frontend/modules/reports/schemas/scheduleConfig.ts
//
// Backs the "Scheduled Reports" UI, which writes through app/api/reports/
// schedule (report.controller.ts) and report-scheduler.service.ts, which in
// turn registers the job with the platform cron engine
// (modules/reporting/services/report-scheduler... via
// scheduler/cron-engine.service.ts) and delivers via
// report-delivery.service.ts / workers/report-execution.worker.ts.

import { z } from 'zod';
import { EXPORT_FORMATS } from './exportConfig';

export const SCHEDULE_FREQUENCIES = ['daily', 'weekly', 'monthly', 'quarterly', 'yearly', 'custom'] as const;
export type ScheduleFrequency = (typeof SCHEDULE_FREQUENCIES)[number];

export const DELIVERY_METHODS = ['email', 'download'] as const;
export type DeliveryMethod = (typeof DELIVERY_METHODS)[number];

export const scheduleConfigSchema = z
  .object({
    reportDefinitionId: z.string().min(1, 'Choose a report to schedule.'),
    frequency: z.enum(SCHEDULE_FREQUENCIES),
    cron: z.string().optional(),
    timeOfDay: z.string().regex(/^([01]\d|2[0-3]):([0-5]\d)$/, 'Use HH:MM (24h).').default('06:00'),
    dayOfWeek: z.number().int().min(0).max(6).optional(),
    dayOfMonth: z.number().int().min(1).max(28).optional(),
    timezone: z.string().default('UTC'),
    format: z.enum(EXPORT_FORMATS).default('excel'),
    deliveryMethod: z.enum(DELIVERY_METHODS).default('email'),
    recipients: z.array(z.string().email()).default([]),
    isActive: z.boolean().default(true),
  })
  .refine((s) => s.frequency !== 'custom' || !!s.cron, {
    message: 'Provide a cron expression for a custom frequency.',
    path: ['cron'],
  })
  .refine((s) => s.frequency !== 'weekly' || s.dayOfWeek !== undefined, {
    message: 'Choose a day of the week.',
    path: ['dayOfWeek'],
  })
  .refine((s) => !['monthly', 'quarterly', 'yearly'].includes(s.frequency) || s.dayOfMonth !== undefined, {
    message: 'Choose a day of the month.',
    path: ['dayOfMonth'],
  })
  .refine((s) => s.deliveryMethod !== 'email' || s.recipients.length > 0, {
    message: 'Add at least one recipient email.',
    path: ['recipients'],
  });

export type ScheduleConfigForm = z.infer<typeof scheduleConfigSchema>;

export const defaultScheduleConfig: Partial<ScheduleConfigForm> = {
  frequency: 'monthly',
  timeOfDay: '06:00',
  timezone: 'UTC',
  format: 'excel',
  deliveryMethod: 'email',
  recipients: [],
  isActive: true,
};
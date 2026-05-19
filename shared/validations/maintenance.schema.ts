// shared/validations/maintenance.schema.ts

import { z } from 'zod';

const reminderStatusSchema = z.enum(['pending', 'completed', 'overdue', 'cancelled']);
const prioritySchema = z.enum(['low', 'medium', 'high', 'critical']);
const recurrenceSchema = z.string().regex(/^(\d+)(d|m|y)$/, 'Invalid recurrence format (e.g., 30d, 3m, 1y)').optional();

export const reminderSchema = z.object({
  license_plate: z.string().min(1, 'License plate is required'),
  title: z.string().min(1, 'Title is required').max(200, 'Title too long'),
  due_date: z.date().or(z.string().datetime()).transform(val => new Date(val)),
  notes: z.string().max(1000).optional(),
  status: reminderStatusSchema.default('pending'),
  priority: prioritySchema.default('medium'),
  service_type: z.string().max(50).optional(),
  recurrence_interval: recurrenceSchema,
  assigned_to: z.string().optional(),
});

export const reminderCreateSchema = reminderSchema.omit({ status: true });
export const reminderUpdateSchema = reminderSchema.partial().extend({
  _id: z.string().min(1, 'Reminder ID is required'),
  status: reminderStatusSchema.optional(),
  completion_date: z.date().optional(),
});

export const maintenanceFiltersSchema = z.object({
  license_plate: z.string().optional(),
  status: reminderStatusSchema.optional(),
  priority: prioritySchema.optional(),
  startDate: z.date().optional(),
  endDate: z.date().optional(),
  assigned_to: z.string().optional(),
  page: z.number().int().positive().default(1),
  limit: z.number().int().positive().max(100).default(10),
});

export type ReminderInput = z.infer<typeof reminderSchema>;
export type ReminderCreateInput = z.infer<typeof reminderCreateSchema>;
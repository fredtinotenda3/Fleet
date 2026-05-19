// shared/validations/expense.schema.ts

import { z } from 'zod';

export const expenseSchema = z.object({
  license_plate: z.string().min(1, 'License plate is required'),
  amount: z.number()
    .positive('Amount must be positive')
    .max(9999999.99, 'Amount exceeds maximum allowed'),
  date: z.date().or(z.string().datetime()).transform(val => new Date(val)),
  expense_type_id: z.string().min(1, 'Expense type is required'),
  description: z.string().max(500, 'Description too long').optional(),
  jobTrip: z.string().max(100, 'Job/Trip reference too long').optional(),
  notes: z.string().max(1000, 'Notes too long').optional(),
});

export const expenseCreateSchema = expenseSchema;
export const expenseUpdateSchema = expenseSchema.partial().extend({
  _id: z.string().min(1, 'Expense ID is required'),
});

export const expenseFiltersSchema = z.object({
  license_plate: z.string().optional(),
  type: z.string().optional(),
  startDate: z.date().optional(),
  endDate: z.date().optional(),
  minAmount: z.number().positive().optional(),
  maxAmount: z.number().positive().optional(),
  page: z.number().int().positive().default(1),
  limit: z.number().int().positive().max(100).default(50),
});

export const expenseTypeSchema = z.object({
  name: z.string().min(1, 'Name is required').max(50, 'Name too long'),
  category: z.string().min(1, 'Category is required'),
  description: z.string().max(200).optional(),
});

export type ExpenseInput = z.infer<typeof expenseSchema>;
export type ExpenseCreateInput = z.infer<typeof expenseCreateSchema>;
export type ExpenseFiltersInput = z.infer<typeof expenseFiltersSchema>;
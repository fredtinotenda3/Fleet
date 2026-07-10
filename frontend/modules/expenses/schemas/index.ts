
// frontend/modules/expenses/schemas/index.ts

import { z } from 'zod';

export const expenseFormSchema = z.object({
  license_plate: z.string().min(1, 'Vehicle is required'),
  amount: z
    .number({ error: 'Amount must be a number' })
    .positive('Amount must be positive')
    .max(9_999_999.99, 'Amount exceeds maximum allowed'),
  date: z.string().min(1, 'Date is required'),
  expense_type_id: z.string().optional(),
  description: z.string().max(500, 'Description too long').optional(),
  jobTrip: z.string().max(100, 'Job/Trip reference too long').optional(),
  notes: z.string().max(1000, 'Notes too long').optional(),
});

export type ExpenseFormValues = z.infer<typeof expenseFormSchema>;
export type ExpenseFormOutput = ExpenseFormValues;
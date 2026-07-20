

// app/api/expenses/import/route.ts

import { NextRequest } from 'next/server';
import { expenseController } from '@/modules/expenses/controllers/expense.controller';
import { withAuth } from '@/server/middleware/with-auth';
import { Permission } from '@/server/permissions/roles';

export const POST = withAuth(
  async (req: NextRequest) => expenseController.importExpenses(req),
  { permission: Permission.EXPENSE_CREATE }
);
// app/api/expenses/route.ts

import { NextRequest } from 'next/server';
import { expenseController } from '@/modules/expenses/controllers/expense.controller';
import { withAuth } from '@/server/middleware/with-auth';
import { Permission } from '@/server/permissions/roles';
import { errorResponse } from '@/server/utils/response.utils';

export const GET = withAuth(
  async (req: NextRequest) => {
    const searchParams = req.nextUrl.searchParams;
    const action = searchParams.get('action');
    const id = searchParams.get('id');

    if (action === 'stats') return expenseController.getExpenseStats(req);
    if (action === 'monthly') return expenseController.getMonthlyTrends(req);
    if (action === 'analytics') return expenseController.getExpenseAnalytics(req);
    if (action === 'category-over-time') return expenseController.getCategoryOverTime(req);
    if (action === 'top-vehicles') return expenseController.getTopVehicles(req);
    if (action === 'vehicle-breakdown') return expenseController.getVehicleBreakdown(req);
    if (action === 'amount-distribution') return expenseController.getAmountDistribution(req);
    if (action === 'job-trip') return expenseController.getJobTripExpense(req);
    if (id) return expenseController.getExpense(req, id);

    return expenseController.getExpenses(req);
  },
  { permission: Permission.EXPENSE_VIEW }
);

export const POST = withAuth(
  async (req: NextRequest) => expenseController.createExpense(req),
  { permission: Permission.EXPENSE_CREATE }
);

export const PUT = withAuth(
  async (req: NextRequest) => {
    const id = req.nextUrl.searchParams.get('id');
    if (!id) {
      return errorResponse('Missing expense ID', 'VALIDATION_ERROR', 400);
    }
    return expenseController.updateExpense(req, id);
  },
  { permission: Permission.EXPENSE_EDIT }
);

export const DELETE = withAuth(
  async (req: NextRequest) => {
    const id = req.nextUrl.searchParams.get('id');
    if (!id) {
      return errorResponse('Missing expense ID', 'VALIDATION_ERROR', 400);
    }
    return expenseController.deleteExpense(req, id);
  },
  { permission: Permission.EXPENSE_DELETE }
);
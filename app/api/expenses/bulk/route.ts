
// app/api/expenses/bulk/route.ts
//
// Rewired onto the existing CQRS bulk-import pipeline
// (BulkImportExpensesCommand -> BulkImportExpensesHandler), which already
// existed in modules/expenses/commands/ but had no route calling it. The
// previous version of this file did its own raw db.collection() writes,
// bypassing the command bus, tenant-scoped repository, and audit/event
// pipeline that every other write in this module goes through.

import { NextRequest } from 'next/server';
import { expenseController } from '@/modules/expenses/controllers/expense.controller';
import { withAuth } from '@/server/middleware/with-auth';
import { Permission } from '@/server/permissions/roles';

export const POST = withAuth(
  async (req: NextRequest) => expenseController.bulkImport(req),
  { permission: Permission.EXPENSE_CREATE }
);

// app/api/expense-types/route.ts
//
// This endpoint was referenced by the (unused) modules/expenses/api/expenses.api.ts
// helper but never implemented. Backed by the existing
// modules/expenses/repositories/expense-type.repository.ts, which already
// had findActive/findByName/findWithCategory methods with no route calling them.

import { NextRequest } from 'next/server';
import { expenseTypeRepository } from '@/modules/expenses/repositories/expense-type.repository';
import { withAuth } from '@/server/middleware/with-auth';
import { Permission } from '@/server/permissions/roles';
import { successResponse, createdResponse, errorResponse } from '@/server/utils/response.utils';
import { getTenantFromRequest, getUserIdFromRequest } from '@/server/utils/context.utils';
import { expenseTypeSchema } from '@/shared/validations/expense.schema';
import { validateWithZod } from '@/shared/utils/validation.utils';

export const GET = withAuth(
  async (req: NextRequest) => {
    const tenantId = await getTenantFromRequest(req);
    const grouped = req.nextUrl.searchParams.get('grouped') === 'true';

    if (grouped) {
      const groups = await expenseTypeRepository.findWithCategory(tenantId);
      return successResponse(groups);
    }

    const types = await expenseTypeRepository.findActive(tenantId);
    return successResponse(types);
  },
  { permission: Permission.EXPENSE_VIEW }
);

export const POST = withAuth(
  async (req: NextRequest) => {
    const tenantId = await getTenantFromRequest(req);
    const userId = await getUserIdFromRequest(req);
    const body = await req.json();

    const result = await validateWithZod(expenseTypeSchema, body);
    if (!result.success || !result.data) {
      return errorResponse('Validation failed', 'VALIDATION_ERROR', 400, result.errors);
    }

    const existing = await expenseTypeRepository.findByName(result.data.name, tenantId);
    if (existing) {
      return errorResponse(
        `Expense category "${result.data.name}" already exists`,
        'CONFLICT',
        409
      );
    }

    const created = await expenseTypeRepository.create(
      {
        name: result.data.name,
        category: result.data.category,
        description: result.data.description,
        isDefault: false,
      },
      tenantId,
      userId
    );

    return createdResponse(created);
  },
  { permission: Permission.EXPENSE_CREATE }
);
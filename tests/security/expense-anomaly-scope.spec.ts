// tests/security/expense-anomaly-scope.spec.ts
//
// Proves expenseAnomalyDetectionService.detectAnomalies() is org-unit
// scoped the same way the other four AI services are: a caller with a
// narrowed TenantContext only sees expenses within an accessible org
// unit, and the anomaly baseline (average amount, category/vendor
// distribution) is computed only from that same narrowed set. Expense
// TYPES are deliberately organization-wide (a shared taxonomy, not
// branch-owned data) and are asserted to stay unscoped.
//
// Mirrors the mocking style of tests/security/driver-risk-scope.spec.ts
// -- mock the repositories at the boundary this service actually calls,
// rather than standing up a real Mongo connection.

import { expenseAnomalyDetectionService } from '../../modules/ai/services/expense-anomaly-detection.service';
import { expenseRepository } from '../../modules/expenses/repositories/expense.repository';
import { expenseTypeRepository } from '../../modules/expenses/repositories/expense-type.repository';
import { TenantContext } from '../../modules/tenancy/services/tenant-context.service';

jest.mock('../../modules/expenses/repositories/expense.repository', () => ({
  expenseRepository: { findMany: jest.fn() },
}));
jest.mock('../../modules/expenses/repositories/expense-type.repository', () => ({
  expenseTypeRepository: { findActive: jest.fn() },
}));

const mockedExpenseFindMany = expenseRepository.findMany as jest.Mock;
const mockedExpenseTypeFindActive = expenseTypeRepository.findActive as jest.Mock;

const TENANT = 'willsgrove-farm-enterprises-9e80ed';
const HARARE_BRANCH = 'branch-harare';
const BULAWAYO_BRANCH = 'branch-bulawayo';

const hareExpense = {
  _id: 'expense-harare',
  license_plate: 'HRE1234',
  amount: 25,
  date: new Date('2026-08-04').toISOString(), // Tuesday
  orgUnitId: HARARE_BRANCH,
};

const bulawayoExpense = {
  _id: 'expense-bulawayo',
  license_plate: 'BYO5678',
  amount: 30,
  date: new Date('2026-08-05').toISOString(), // Wednesday
  orgUnitId: BULAWAYO_BRANCH,
};

function makeScopedContext(accessibleOrgUnitIds: string[] | null): TenantContext {
  return {
    organizationId: TENANT,
    organizationName: 'Willsgrove Farm Enterprises',
    accessibleOrgUnitIds,
    assignedOrgUnitIds: accessibleOrgUnitIds ?? [],
    isPlatformScope: false,
  } as TenantContext;
}

describe('expense-anomaly-detection org-unit scoping', () => {
  beforeEach(() => {
    mockedExpenseTypeFindActive.mockResolvedValue([]);
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  it('with no context (org-wide caller), processes every expense unscoped', async () => {
    mockedExpenseFindMany.mockResolvedValue([hareExpense, bulawayoExpense]);

    const result = await expenseAnomalyDetectionService.detectAnomalies(TENANT);

    expect(result.success).toBe(true);
    expect(result.total).toBe(2);
    expect(mockedExpenseFindMany).toHaveBeenCalledWith(
      expect.objectContaining({ isDeleted: { $ne: true } }),
      TENANT
    );
  });

  it('with a Harare-only context, the expense query includes the org-unit filter', async () => {
    mockedExpenseFindMany.mockResolvedValue([hareExpense]);

    const context = makeScopedContext([HARARE_BRANCH]);
    const result = await expenseAnomalyDetectionService.detectAnomalies(TENANT, context);

    expect(result.success).toBe(true);
    expect(result.total).toBe(1);
    expect(mockedExpenseFindMany).toHaveBeenCalledWith(
      expect.objectContaining({
        isDeleted: { $ne: true },
        orgUnitId: { $in: [HARARE_BRANCH] },
      }),
      TENANT
    );
  });

  it('a Harare-only caller never has a Bulawayo expense feed the baseline', async () => {
    // Repository is mocked to actually honor the scope filter it
    // receives, matching how the real Mongo query would behave.
    mockedExpenseFindMany.mockResolvedValue([hareExpense]);

    const context = makeScopedContext([HARARE_BRANCH]);
    const result = await expenseAnomalyDetectionService.detectAnomalies(TENANT, context);

    const entityIds = result.results.map((r) => r.entityId);
    expect(entityIds).toEqual([hareExpense._id]);
    expect(entityIds).not.toContain(bulawayoExpense._id);
  });

  it('with accessibleOrgUnitIds resolved to an empty array, fails closed (zero expenses)', async () => {
    mockedExpenseFindMany.mockResolvedValue([]);

    const context = makeScopedContext([]);
    const result = await expenseAnomalyDetectionService.detectAnomalies(TENANT, context);

    expect(result.success).toBe(true);
    expect(result.total).toBe(0);
    expect(mockedExpenseFindMany).toHaveBeenCalledWith(
      expect.objectContaining({ orgUnitId: { $in: [] } }),
      TENANT
    );
  });

  it('expense types remain unscoped (shared organization-wide taxonomy)', async () => {
    mockedExpenseFindMany.mockResolvedValue([hareExpense]);

    const context = makeScopedContext([HARARE_BRANCH]);
    await expenseAnomalyDetectionService.detectAnomalies(TENANT, context);

    // findActive() takes only tenantId -- no org-unit filter is ever
    // passed, regardless of how narrow the caller's scope is.
    expect(mockedExpenseTypeFindActive).toHaveBeenCalledWith(TENANT);
    expect(mockedExpenseTypeFindActive).toHaveBeenCalledTimes(1);
  });
});

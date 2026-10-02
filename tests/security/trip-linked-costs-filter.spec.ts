// tests/security/trip-linked-costs-filter.spec.ts
//
// MODULE CONNECTIVITY UPGRADE (Trip <-> Fuel/Expense gap), Round 3:
// FuelLog.tripId and Expense.tripId have existed as write-only FKs for a
// while (see each type's own doc comment) -- Trip Detail's "Linked
// costs" card is the first thing that reads them back, via the new
// `tripId` filter on FuelFilters/ExpenseFilters.
//
// What this pins, for BOTH repositories:
//   1. `tripId` reaches the actual Mongo query/match as an exact-match
//      filter when supplied.
//   2. It is OMITTED from the query/match entirely when not supplied --
//      not `tripId: undefined`, which would behave differently across
//      drivers and is the class of bug export-scope-conformance-style
//      tests in this codebase exist to catch.
//   3. It composes WITH tenant/org-unit scoping, never replacing or
//      bypassing it -- a tripId filter must not become a side channel
//      that returns another tenant's fuel logs/expenses sharing a
//      (globally non-unique, UUID-collision-improbable but not
//      impossible) tripId.
//
// Bespoke minimal fakes, matching tests/security/
// fuel-driver-display-attribution.spec.ts's style, rather than the
// shared tests/helpers/fake-collection.ts -- that fake's aggregate()
// only implements $match/$group, and ExpenseRepository's real pipeline
// also carries a $lookup/$sort/$skip/$limit this suite does not need to
// exercise to prove the property above.

import { FuelRepository } from '@/modules/fuel/repositories/fuel.repository';
import { ExpenseRepository } from '@/modules/expenses/repositories/expense.repository';
import type { TenantContext } from '@/modules/tenancy/services/tenant-context.service';

const ORG = 'willsgrove-farm-enterprises-9e80ed';

function context(overrides: Partial<TenantContext> = {}): TenantContext {
  return {
    organizationId: ORG,
    organizationName: 'Willsgrove Farm Enterprises',
    accessibleOrgUnitIds: null,
    assignedOrgUnitIds: [],
    isPlatformScope: false,
    ...overrides,
  } as TenantContext;
}

// ─── FuelRepository.getFilteredLogsInScope ──────────────────────────────────

let lastFuelQuery: Record<string, unknown> | null = null;

function fakeFind() {
  const api = {
    sort: () => api,
    skip: () => api,
    limit: () => api,
    toArray: async () => [],
  };
  return api;
}

class TestFuelRepository extends FuelRepository {
  protected async getCollection(): Promise<any> {
    return {
      find: (query: Record<string, unknown>) => {
        lastFuelQuery = query;
        return fakeFind();
      },
      countDocuments: async () => 0,
    };
  }
}

describe('FuelRepository.getFilteredLogsInScope: tripId filter', () => {
  const repo = new TestFuelRepository();

  beforeEach(() => {
    lastFuelQuery = null;
  });

  it('applies tripId as an exact-match filter when supplied', async () => {
    await repo.getFilteredLogsInScope({ tripId: 'trip-abc123' }, context(), { page: 1, limit: 10 });

    expect(lastFuelQuery?.tripId).toBe('trip-abc123');
  });

  it('omits tripId entirely when not supplied, rather than filtering on undefined', async () => {
    await repo.getFilteredLogsInScope({}, context(), { page: 1, limit: 10 });

    expect(lastFuelQuery).not.toHaveProperty('tripId');
  });

  it('keeps tenant scoping alongside the tripId filter -- never a bypass', async () => {
    await repo.getFilteredLogsInScope({ tripId: 'trip-abc123' }, context(), { page: 1, limit: 10 });

    expect(lastFuelQuery?.tripId).toBe('trip-abc123');
    expect(lastFuelQuery?.tenantId).toBe(ORG);
  });

  it('keeps org-unit scoping alongside the tripId filter for a branch-scoped caller', async () => {
    await repo.getFilteredLogsInScope(
      { tripId: 'trip-abc123' },
      context({ accessibleOrgUnitIds: ['branch-harare'] }),
      { page: 1, limit: 10 }
    );

    expect(lastFuelQuery?.tripId).toBe('trip-abc123');
    expect(lastFuelQuery?.orgUnitId).toEqual({ $in: ['branch-harare'] });
  });
});

// ─── ExpenseRepository.getFilteredExpensesInScope ───────────────────────────

let lastExpenseMatch: Record<string, unknown> | null = null;

class TestExpenseRepository extends ExpenseRepository {
  protected async getCollection(): Promise<any> {
    return {
      aggregate: (pipeline: Array<Record<string, unknown>>) => {
        const matchStage = pipeline.find((s) => '$match' in s) as { $match: Record<string, unknown> } | undefined;
        if (matchStage) lastExpenseMatch = matchStage.$match;
        return { toArray: async () => [] };
      },
    };
  }
}

describe('ExpenseRepository.getFilteredExpensesInScope: tripId filter', () => {
  const repo = new TestExpenseRepository();

  beforeEach(() => {
    lastExpenseMatch = null;
  });

  it('applies tripId as an exact-match filter when supplied', async () => {
    await repo.getFilteredExpensesInScope({ tripId: 'trip-xyz789' }, context(), { page: 1, limit: 10 });

    expect(lastExpenseMatch?.tripId).toBe('trip-xyz789');
  });

  it('omits tripId entirely when not supplied, rather than filtering on undefined', async () => {
    await repo.getFilteredExpensesInScope({}, context(), { page: 1, limit: 10 });

    expect(lastExpenseMatch).not.toHaveProperty('tripId');
  });

  it('keeps tenant scoping alongside the tripId filter -- never a bypass', async () => {
    await repo.getFilteredExpensesInScope({ tripId: 'trip-xyz789' }, context(), { page: 1, limit: 10 });

    expect(lastExpenseMatch?.tripId).toBe('trip-xyz789');
    expect(lastExpenseMatch?.tenantId).toBe(ORG);
  });

  it('keeps org-unit scoping alongside the tripId filter for a branch-scoped caller', async () => {
    await repo.getFilteredExpensesInScope(
      { tripId: 'trip-xyz789' },
      context({ accessibleOrgUnitIds: ['branch-harare'] }),
      { page: 1, limit: 10 }
    );

    expect(lastExpenseMatch?.tripId).toBe('trip-xyz789');
    expect(lastExpenseMatch?.orgUnitId).toEqual({ $in: ['branch-harare'] });
  });
});

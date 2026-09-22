// tests/unit/transport-cost/transport-cost-source-record.repository.spec.ts
//
// Command Centre Slice A0. Pins TransportCostSourceRecordRepository.
// countPendingAmount's WIDENED behaviour: it used to be hardcoded to
// `sheetFamily: 'third-party'`; it now accepts any family or set of
// families (defaulting to 'third-party' so the existing O4 report
// screen's call is unaffected), and handles Vansales separately because
// Vansales rows carry no per-row `date` -- only a declared
// `vansales.periodMonth` -- which this repository's own doc comment
// explains cannot be pushed into a dotted-path Mongo filter against the
// shared FakeCollection test double (it does not walk dotted paths the
// way real MongoDB does). See
// OLIVINE_COST_INTELLIGENCE_COMMAND_CENTRE_DESIGN.md Section 6.0.

import { TransportCostSourceRecordRepository } from '../../../modules/transport-cost/repositories/transport-cost-source-record.repository';
import { FakeCollection } from '../../helpers/fake-collection';
import type { TenantContext } from '../../../modules/tenancy/services/tenant-context.service';

const TENANT = 'olivine-group-a0';
// Local-time (not UTC-ISO) boundaries, deliberately: parsePeriodMonth
// (normalization.utils.ts) builds a Vansales row's declared-month period
// with `new Date(year, month, day)` -- LOCAL midnight, matching
// parseSourceDate's own convention, per that function's own doc comment
// ("Both boundaries are local-midnight Date values ... so a Vansales
// posting's periodStart/periodEnd compare consistently with every other
// posting in the ledger"). A UTC-ISO-string boundary would silently
// disagree with that by this environment's own UTC+2 (Africa/Harare) TZ
// offset -- exactly the kind of mismatch worth avoiding here rather than
// asserting past.
const JAN_START = new Date(2026, 0, 1);
const JAN_END = new Date(2026, 0, 31, 23, 59, 59, 999);
const FEB_START = new Date(2026, 1, 1);
const FEB_END = new Date(2026, 1, 28, 23, 59, 59, 999);

class TestRepo extends TransportCostSourceRecordRepository {
  collection = new FakeCollection();
  async getCollection() {
    return this.collection as any;
  }
}

function contextFor(accessibleOrgUnitIds: string[] | null): TenantContext {
  return {
    organizationId: TENANT,
    organizationName: 'Olivine Group',
    accessibleOrgUnitIds,
    assignedOrgUnitIds: accessibleOrgUnitIds ?? [],
    isPlatformScope: false,
  } as unknown as TenantContext;
}

function baseRecord(overrides: Record<string, unknown> = {}) {
  return {
    orgUnitId: 'unit-harare',
    sheetFamily: 'third-party',
    importBatchId: 'batch-1',
    sourceFileName: 'JAN-26 3rd Party.xlsx',
    sourceRowNumber: 1,
    importedAt: JAN_START,
    rawRow: {},
    date: JAN_START,
    rawDate: '05.01.26',
    registration: 'AGL8230',
    registrationRaw: 'AGL8230',
    transporterNormalized: 'SIGHTSCORE',
    transporterRaw: 'SIGHTSCORE',
    amount: null,
    tonnageRaw: null,
    ...overrides,
  };
}

describe('TransportCostSourceRecordRepository.countPendingAmount', () => {
  it('defaults to third-party only, unchanged from before this widening -- the existing O4 report screen is unaffected', async () => {
    const repo = new TestRepo();
    await repo.create(baseRecord({ sheetFamily: 'third-party', amount: null }), TENANT, 'user-1');
    await repo.create(baseRecord({ sheetFamily: 'depot-sto', amount: null, sourceRowNumber: 2 }), TENANT, 'user-1');

    const count = await repo.countPendingAmount(JAN_START, JAN_END, contextFor(null));
    expect(count).toBe(1);
  });

  it('accepts an array of families and counts pending rows across all of them', async () => {
    const repo = new TestRepo();
    await repo.create(baseRecord({ sheetFamily: 'third-party', amount: null }), TENANT, 'user-1');
    await repo.create(baseRecord({ sheetFamily: 'swift', amount: null, sourceRowNumber: 2 }), TENANT, 'user-1');
    await repo.create(baseRecord({ sheetFamily: 'depot-sto', amount: null, sourceRowNumber: 3 }), TENANT, 'user-1');
    // Has an amount -- must not be counted.
    await repo.create(baseRecord({ sheetFamily: 'third-party', amount: 100, sourceRowNumber: 4 }), TENANT, 'user-1');

    const count = await repo.countPendingAmount(JAN_START, JAN_END, contextFor(null), [
      'third-party',
      'swift',
      'depot-sto',
    ]);
    expect(count).toBe(3);
  });

  it('excludes a dated-family row outside the requested period', async () => {
    const repo = new TestRepo();
    await repo.create(baseRecord({ sheetFamily: 'third-party', amount: null, date: FEB_START }), TENANT, 'user-1');

    const count = await repo.countPendingAmount(JAN_START, JAN_END, contextFor(null));
    expect(count).toBe(0);
  });

  it('counts a pending Vansales row via its declared periodMonth, not a per-row date it does not have', async () => {
    const repo = new TestRepo();
    await repo.create(
      baseRecord({
        sheetFamily: 'vansales',
        amount: null,
        date: null,
        vansales: {
          payerName: null,
          product: null,
          monthlyCostBeforeVat: null,
          weeklyAmounts: [null, null, null, null],
          total: null,
          periodMonth: '2026-01',
        },
      }),
      TENANT,
      'user-1'
    );

    const count = await repo.countPendingAmount(JAN_START, JAN_END, contextFor(null), 'vansales');
    expect(count).toBe(1);
  });

  it('excludes a pending Vansales row whose declared periodMonth falls outside the requested period', async () => {
    const repo = new TestRepo();
    await repo.create(
      baseRecord({
        sheetFamily: 'vansales',
        amount: null,
        date: null,
        vansales: {
          payerName: null,
          product: null,
          monthlyCostBeforeVat: null,
          weeklyAmounts: [null, null, null, null],
          total: null,
          periodMonth: '2026-02',
        },
      }),
      TENANT,
      'user-1'
    );

    const febCount = await repo.countPendingAmount(FEB_START, FEB_END, contextFor(null), 'vansales');
    expect(febCount).toBe(1); // sanity: requesting Feb finds the Feb row...
    const janCount = await repo.countPendingAmount(JAN_START, JAN_END, contextFor(null), 'vansales');
    expect(janCount).toBe(0); // ...but Jan must not.
  });

  it('never counts a Vansales row with an unparseable/missing periodMonth as pending-in-period', async () => {
    const repo = new TestRepo();
    await repo.create(
      baseRecord({
        sheetFamily: 'vansales',
        amount: null,
        date: null,
        vansales: {
          payerName: null,
          product: null,
          monthlyCostBeforeVat: null,
          weeklyAmounts: [null, null, null, null],
          total: null,
          periodMonth: null,
        },
      }),
      TENANT,
      'user-1'
    );

    const count = await repo.countPendingAmount(JAN_START, JAN_END, contextFor(null), 'vansales');
    expect(count).toBe(0);
  });

  it('combines dated families and Vansales correctly in one call', async () => {
    const repo = new TestRepo();
    await repo.create(baseRecord({ sheetFamily: 'third-party', amount: null }), TENANT, 'user-1');
    await repo.create(
      baseRecord({
        sheetFamily: 'vansales',
        amount: null,
        date: null,
        sourceRowNumber: 2,
        vansales: {
          payerName: null,
          product: null,
          monthlyCostBeforeVat: null,
          weeklyAmounts: [null, null, null, null],
          total: null,
          periodMonth: '2026-01',
        },
      }),
      TENANT,
      'user-1'
    );

    const count = await repo.countPendingAmount(JAN_START, JAN_END, contextFor(null), ['third-party', 'vansales']);
    expect(count).toBe(2);
  });
});

// tests/unit/transport-cost/transport-cost-source-record-load-summary.repository.spec.ts
//
// OLIVINE LIVE OPERATING MODEL, SLICE 2 (item 6/7). Pins
// TransportCostSourceRecordRepository.getLoadSummaryInScope -- the
// "TRANSPORT OPERATIONS vs TRANSPORT LINES/LOADS" counts
// TransportCostReportService.getAllocationReport's `loadSummary` field
// is built from. Same TestRepo/FakeCollection pattern as
// transport-cost-source-record.repository.spec.ts.

import { TransportCostSourceRecordRepository } from '../../../modules/transport-cost/repositories/transport-cost-source-record.repository';
import { FakeCollection } from '../../helpers/fake-collection';
import type { TenantContext } from '../../../modules/tenancy/services/tenant-context.service';

const TENANT = 'olivine-group-slice2';
const JAN_START = new Date(2026, 0, 1);
const JAN_END = new Date(2026, 0, 31, 23, 59, 59, 999);

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
    amount: 1000,
    tonnageRaw: null,
    ...overrides,
  };
}

describe('TransportCostSourceRecordRepository.getLoadSummaryInScope', () => {
  it('counts a legacy row with no `lines` field at all as exactly one operation, one line', async () => {
    const repo = new TestRepo();
    await repo.create(baseRecord(), TENANT, 'user-1'); // no `lines` -- pre-Slice-2 row

    const summary = await repo.getLoadSummaryInScope(JAN_START, JAN_END, contextFor(null));
    expect(summary).toEqual({ totalOperations: 1, totalLines: 1, multiLineOperationCount: 0 });
  });

  it('counts a single-line Slice-2 row (lines.length === 1) the same as a legacy row', async () => {
    const repo = new TestRepo();
    await repo.create(
      baseRecord({ lines: [{ lineNumber: 1, tonnageRaw: null }] }),
      TENANT,
      'user-1'
    );

    const summary = await repo.getLoadSummaryInScope(JAN_START, JAN_END, contextFor(null));
    expect(summary).toEqual({ totalOperations: 1, totalLines: 1, multiLineOperationCount: 0 });
  });

  it('a genuine multi-line operation counts as one operation but multiple lines, and is flagged in multiLineOperationCount', async () => {
    const repo = new TestRepo();
    await repo.create(
      baseRecord({
        sourceRowNumber: 1,
        lines: [
          { lineNumber: 1, customerName: 'Customer A', tonnageRaw: 2 },
          { lineNumber: 2, customerName: 'Customer B', tonnageRaw: 3 },
          { lineNumber: 3, customerName: 'Customer C', tonnageRaw: 1 },
        ],
      }),
      TENANT,
      'user-1'
    );

    const summary = await repo.getLoadSummaryInScope(JAN_START, JAN_END, contextFor(null));
    expect(summary).toEqual({ totalOperations: 1, totalLines: 3, multiLineOperationCount: 1 });
  });

  it('mixes single- and multi-line operations correctly across several rows', async () => {
    const repo = new TestRepo();
    await repo.create(baseRecord({ sourceRowNumber: 1 }), TENANT, 'u1'); // legacy, 1 line
    await repo.create(
      baseRecord({ sourceRowNumber: 2, lines: [{ lineNumber: 1 }, { lineNumber: 2 }] }),
      TENANT,
      'u1'
    ); // 2 lines
    await repo.create(
      baseRecord({ sourceRowNumber: 3, lines: [{ lineNumber: 1 }, { lineNumber: 2 }, { lineNumber: 3 }, { lineNumber: 4 }] }),
      TENANT,
      'u1'
    ); // 4 lines

    const summary = await repo.getLoadSummaryInScope(JAN_START, JAN_END, contextFor(null));
    expect(summary).toEqual({ totalOperations: 3, totalLines: 7, multiLineOperationCount: 2 });
  });

  it('excludes a row outside the requested period', async () => {
    const repo = new TestRepo();
    await repo.create(baseRecord({ date: new Date(2026, 1, 1) }), TENANT, 'u1'); // February

    const summary = await repo.getLoadSummaryInScope(JAN_START, JAN_END, contextFor(null));
    expect(summary).toEqual({ totalOperations: 0, totalLines: 0, multiLineOperationCount: 0 });
  });

  it('excludes org units outside the caller\'s scope', async () => {
    const repo = new TestRepo();
    await repo.create(baseRecord({ orgUnitId: 'unit-harare' }), TENANT, 'u1');
    await repo.create(
      baseRecord({ orgUnitId: 'unit-bulawayo', sourceRowNumber: 2, lines: [{ lineNumber: 1 }, { lineNumber: 2 }] }),
      TENANT,
      'u1'
    );

    const hararOnly = await repo.getLoadSummaryInScope(JAN_START, JAN_END, contextFor(['unit-harare']));
    expect(hararOnly).toEqual({ totalOperations: 1, totalLines: 1, multiLineOperationCount: 0 });

    const both = await repo.getLoadSummaryInScope(JAN_START, JAN_END, contextFor(['unit-harare', 'unit-bulawayo']));
    expect(both).toEqual({ totalOperations: 2, totalLines: 3, multiLineOperationCount: 1 });
  });

  it('defaults to third-party only, and widens correctly when given an explicit family array', async () => {
    const repo = new TestRepo();
    await repo.create(baseRecord({ sheetFamily: 'third-party', sourceRowNumber: 1 }), TENANT, 'u1');
    await repo.create(baseRecord({ sheetFamily: 'depot-sto', sourceRowNumber: 2 }), TENANT, 'u1');

    const defaultFamily = await repo.getLoadSummaryInScope(JAN_START, JAN_END, contextFor(null));
    expect(defaultFamily.totalOperations).toBe(1);

    const both = await repo.getLoadSummaryInScope(JAN_START, JAN_END, contextFor(null), ['third-party', 'depot-sto']);
    expect(both.totalOperations).toBe(2);
  });
});

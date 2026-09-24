// tests/unit/transport-cost/transport-cost-source-record-command-centre.repository.spec.ts
//
// OLIVINE LIVE OPERATING MODEL, SLICE 4 (Command Centre). Pins:
//   - getLoadSummaryInScope's new `filters` param (Slice A: operational
//     counts must honour the same active filters as the financial
//     cards next to them)
//   - getDataQualityBreakdown (Slice C: the trust panel's
//     Missing/Unresolved/Not-applicable counts)
//
// Same TestRepo/FakeCollection pattern as
// transport-cost-source-record-load-summary.repository.spec.ts.

import { TransportCostSourceRecordRepository } from '../../../modules/transport-cost/repositories/transport-cost-source-record.repository';
import { FakeCollection } from '../../helpers/fake-collection';
import type { TenantContext } from '../../../modules/tenancy/services/tenant-context.service';

const TENANT = 'olivine-group-cc-src';
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

describe('TransportCostSourceRecordRepository.getLoadSummaryInScope (Command Centre filters)', () => {
  it('narrows by costFacingCompany', async () => {
    const repo = new TestRepo();
    await repo.create(baseRecord({ sourceRowNumber: 1, costFacingCompany: 'hypery' }), TENANT, 'u1');
    await repo.create(baseRecord({ sourceRowNumber: 2, costFacingCompany: 'olivine' }), TENANT, 'u1');

    const summary = await repo.getLoadSummaryInScope(JAN_START, JAN_END, contextFor(null), 'third-party', {
      costFacingCompany: 'hypery',
    });
    expect(summary.totalOperations).toBe(1);
  });

  it('narrows by contractedVehicleIds, and returns zero rather than everything for an empty set', async () => {
    const repo = new TestRepo();
    await repo.create(baseRecord({ sourceRowNumber: 1, contractedVehicleId: 'veh-1' }), TENANT, 'u1');
    await repo.create(baseRecord({ sourceRowNumber: 2, contractedVehicleId: 'veh-2' }), TENANT, 'u1');

    const oneVehicle = await repo.getLoadSummaryInScope(JAN_START, JAN_END, contextFor(null), 'third-party', {
      contractedVehicleIds: ['veh-1'],
    });
    expect(oneVehicle.totalOperations).toBe(1);

    const noVehicles = await repo.getLoadSummaryInScope(JAN_START, JAN_END, contextFor(null), 'third-party', {
      contractedVehicleIds: [],
    });
    expect(noVehicles).toEqual({ totalOperations: 0, totalLines: 0, multiLineOperationCount: 0 });
  });

  it('a customerName filter matches a record whose customer is on a LINE, not just the flat field, without double-counting the operation', async () => {
    const repo = new TestRepo();
    await repo.create(
      baseRecord({
        sourceRowNumber: 1,
        customerName: 'Customer A',
        lines: [
          { lineNumber: 1, customerName: 'Customer A' },
          { lineNumber: 2, customerName: 'Customer B' },
        ],
      }),
      TENANT,
      'u1'
    );

    const forB = await repo.getLoadSummaryInScope(JAN_START, JAN_END, contextFor(null), 'third-party', {
      customerName: 'Customer B',
    });
    // Matches via line 2 even though the flat field says "Customer A" --
    // and counts as exactly ONE operation, never two just because two
    // lines could each be considered separately.
    expect(forB).toEqual({ totalOperations: 1, totalLines: 2, multiLineOperationCount: 1 });

    const forC = await repo.getLoadSummaryInScope(JAN_START, JAN_END, contextFor(null), 'third-party', {
      customerName: 'Customer C',
    });
    expect(forC.totalOperations).toBe(0);
  });

  it('a destinationTown filter is case-insensitive and trimmed', async () => {
    const repo = new TestRepo();
    await repo.create(baseRecord({ sourceRowNumber: 1, destinationTown: 'Harare' }), TENANT, 'u1');

    const summary = await repo.getLoadSummaryInScope(JAN_START, JAN_END, contextFor(null), 'third-party', {
      destinationTown: '  harare  ',
    });
    expect(summary.totalOperations).toBe(1);
  });
});

describe('TransportCostSourceRecordRepository.getDataQualityBreakdown', () => {
  it('classifies a Swift row with no registration as vehicleNotApplicable, never unresolvedVehicle', async () => {
    const repo = new TestRepo();
    await repo.create(
      baseRecord({ sheetFamily: 'swift', registration: null, registrationRaw: '', transporterRaw: '' }),
      TENANT,
      'u1'
    );

    const summary = await repo.getDataQualityBreakdown(JAN_START, JAN_END, contextFor(null));
    expect(summary.vehicleNotApplicable).toBe(1);
    expect(summary.unresolvedVehicle).toBe(0);
  });

  it('classifies a non-Swift row with a blank registration as missingRegistration, not unresolvedVehicle', async () => {
    const repo = new TestRepo();
    await repo.create(baseRecord({ sheetFamily: 'vansales', registration: null, transporterRaw: '' }), TENANT, 'u1');

    const summary = await repo.getDataQualityBreakdown(JAN_START, JAN_END, contextFor(null));
    expect(summary.missingRegistration).toBe(1);
    expect(summary.unresolvedVehicle).toBe(0);
  });

  it('classifies a row with a populated registration but no contractedVehicleId as unresolvedVehicle', async () => {
    const repo = new TestRepo();
    await repo.create(baseRecord({ registration: 'AGL8230', contractedVehicleId: undefined, transporterRaw: '' }), TENANT, 'u1');

    const summary = await repo.getDataQualityBreakdown(JAN_START, JAN_END, contextFor(null));
    expect(summary.unresolvedVehicle).toBe(1);
  });

  it('classifies a Vansales row as destinationNotApplicable, never missingDestination', async () => {
    const repo = new TestRepo();
    await repo.create(
      baseRecord({ sheetFamily: 'vansales', destinationTown: undefined, transporterRaw: '', registration: null }),
      TENANT,
      'u1'
    );

    const summary = await repo.getDataQualityBreakdown(JAN_START, JAN_END, contextFor(null));
    expect(summary.destinationNotApplicable).toBe(1);
    expect(summary.missingDestination).toBe(0);
  });

  it('classifies a non-Vansales row with no destination anywhere (flat or lines) as missingDestination', async () => {
    const repo = new TestRepo();
    await repo.create(baseRecord({ sheetFamily: 'third-party', destinationTown: undefined, transporterRaw: '' }), TENANT, 'u1');

    const summary = await repo.getDataQualityBreakdown(JAN_START, JAN_END, contextFor(null));
    expect(summary.missingDestination).toBe(1);
  });

  it('a destination present only on a line still counts as present, not missing', async () => {
    const repo = new TestRepo();
    await repo.create(
      baseRecord({
        sheetFamily: 'third-party',
        destinationTown: undefined,
        transporterRaw: '',
        lines: [{ lineNumber: 1, destinationTown: 'Mutare' }],
      }),
      TENANT,
      'u1'
    );

    const summary = await repo.getDataQualityBreakdown(JAN_START, JAN_END, contextFor(null));
    expect(summary.missingDestination).toBe(0);
  });

  it('flags missingCostFacingCompany, unresolvedTransporter, and missingTonnage independently -- one row can carry several flags at once', async () => {
    const repo = new TestRepo();
    await repo.create(
      baseRecord({
        costFacingCompany: undefined,
        transporterRaw: 'PRINORTH',
        transporterPartnerId: undefined,
        tonnageRaw: null,
      }),
      TENANT,
      'u1'
    );

    const summary = await repo.getDataQualityBreakdown(JAN_START, JAN_END, contextFor(null));
    expect(summary.missingCostFacingCompany).toBe(1);
    expect(summary.unresolvedTransporter).toBe(1);
    expect(summary.missingTonnage).toBe(1);
    expect(summary.totalRows).toBe(1);
  });

  it('a resolved, fully-populated row trips none of the flags', async () => {
    const repo = new TestRepo();
    await repo.create(
      baseRecord({
        costFacingCompany: 'olivine',
        transporterRaw: 'PRINORTH',
        transporterPartnerId: 'p-1',
        contractedVehicleId: 'veh-1',
        destinationTown: 'Harare',
        customerName: 'Customer A',
        tonnageRaw: 12,
      }),
      TENANT,
      'u1'
    );

    const summary = await repo.getDataQualityBreakdown(JAN_START, JAN_END, contextFor(null));
    expect(summary).toEqual({
      totalRows: 1,
      missingCostFacingCompany: 0,
      missingRegistration: 0,
      unresolvedVehicle: 0,
      vehicleNotApplicable: 0,
      unresolvedTransporter: 0,
      missingCustomer: 0,
      missingDestination: 0,
      destinationNotApplicable: 0,
      missingTonnage: 0,
    });
  });

  it('excludes org units outside the caller\'s scope', async () => {
    const repo = new TestRepo();
    await repo.create(baseRecord({ orgUnitId: 'unit-harare', costFacingCompany: undefined, transporterRaw: '' }), TENANT, 'u1');
    await repo.create(
      baseRecord({ orgUnitId: 'unit-bulawayo', sourceRowNumber: 2, costFacingCompany: undefined, transporterRaw: '' }),
      TENANT,
      'u1'
    );

    const hararOnly = await repo.getDataQualityBreakdown(JAN_START, JAN_END, contextFor(['unit-harare']));
    expect(hararOnly.totalRows).toBe(1);
  });
});

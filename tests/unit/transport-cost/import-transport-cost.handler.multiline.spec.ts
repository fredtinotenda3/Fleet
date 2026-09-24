// tests/unit/transport-cost/import-transport-cost.handler.multiline.spec.ts
//
// OLIVINE LIVE OPERATING MODEL, SLICE 2 (item 6/7 -- see
// OLIVINE_LIVE_OPERATING_MODEL_GAP_ANALYSIS.md Section 5 and
// TransportCostSourceRecord.lines' own doc comment for the full design
// record). Covers the multi-line/parent-child model added on top of
// Slice 1: ImportTransportCostHandler.resolveLines and its four call
// sites.
//
// Mirrors the mocking style of import-transport-cost.handler.spec.ts
// (same repo/matcher/exception-repo mocks) rather than duplicating a
// second harness.
//
// THE ONE INVARIANT EVERY TEST HERE ULTIMATELY SERVES: a transport
// operation's COST is a parent-level fact, never multiplied or
// re-derived from how many lines it has. See the "critical financial
// rule" describe block at the bottom for the tests that assert this
// directly.

import { ImportTransportCostHandler } from '../../../modules/transport-cost/commands/handlers/import-transport-cost.handler';
import { ImportTransportCostCommand, ThirdPartyImportRow, VansalesImportRow, SwiftImportRow, DepotStoImportRow } from '../../../modules/transport-cost/commands/import-transport-cost.command';
import { userWriteScope } from '../../../server/tenancy/write-scope';
import type { TenantContext } from '../../../modules/tenancy/services/tenant-context.service';

const TENANT = 'olivine-group-4f2a1c';
const USER_ID = 'user-1';

const resolveCreationOrgUnitId = jest.fn();

jest.mock('../../../server/utils/tenant-context.utils', () => ({
  resolveCreationOrgUnitId: (...args: unknown[]) => resolveCreationOrgUnitId(...args),
}));

function makeContext(overrides: Partial<TenantContext> = {}): TenantContext {
  return {
    organizationId: TENANT,
    organizationName: 'Olivine Group',
    accessibleOrgUnitIds: ['branch-harare'],
    assignedOrgUnitIds: ['branch-harare'],
    isPlatformScope: false,
    ...overrides,
  };
}

function makeRepo(overrides: Record<string, jest.Mock> = {}) {
  return {
    findLikelyDuplicate: jest.fn().mockResolvedValue(null),
    create: jest.fn().mockImplementation(async (data: Record<string, unknown>) => ({
      _id: 'new-id',
      tenantId: TENANT,
      ...data,
    })),
    update: jest.fn().mockResolvedValue(null),
    ...overrides,
  } as any;
}

function makeMatcher(overrides: Record<string, jest.Mock> = {}) {
  return {
    matchTransporter: jest.fn().mockResolvedValue({ outcome: 'no-value' }),
    matchVehicle: jest.fn().mockResolvedValue({ outcome: 'no-registration' }),
    ...overrides,
  } as any;
}

function thirdPartyRow(overrides: Partial<ThirdPartyImportRow> = {}): ThirdPartyImportRow {
  return {
    rowNumber: 2,
    date: '05.01.26',
    customerName: 'Olivine',
    transporter: 'PRINORTH',
    registration: 'AGL8230',
    amount: '1000',
    tonnage: '32',
    costFacingCompany: 'olivine',
    ...overrides,
  };
}

function vansalesRow(overrides: Partial<VansalesImportRow> = {}): VansalesImportRow {
  return {
    rowNumber: 2,
    payerName: 'Mr Gurjit',
    truck: 'SIGHTSCORE',
    registration: 'AGL8230',
    week1: '300',
    week2: '300',
    week3: '300',
    week4: '300',
    total: '1200',
    costFacingCompany: 'olivine',
    ...overrides,
  };
}

function swiftRow(overrides: Partial<SwiftImportRow> = {}): SwiftImportRow {
  return {
    rowNumber: 2,
    consDate: '2026-01-05',
    consNumber: 'CN-10234',
    receiversName: 'Olivine',
    destinationLocation: 'Bulawayo',
    actualWeight: '32',
    totalIncl: '4500',
    costFacingCompany: 'olivine',
    ...overrides,
  };
}

function depotStoRow(overrides: Partial<DepotStoImportRow> = {}): DepotStoImportRow {
  return {
    rowNumber: 2,
    date: '15.06.26',
    transporter: 'PRINORTH',
    registration: 'AGL8230',
    amount: '4500',
    costFacingCompany: 'olivine',
    ...overrides,
  };
}

beforeEach(() => {
  jest.clearAllMocks();
  resolveCreationOrgUnitId.mockReturnValue('branch-harare');
});

describe('ImportTransportCostHandler -- multi-line, backward-compat mirror (every family)', () => {
  it('a legacy third-party row with no `lines` gets exactly one line, mirroring its own scalar fields', async () => {
    const repo = makeRepo();
    const handler = new ImportTransportCostHandler(repo, makeMatcher());

    await handler.execute(
      new ImportTransportCostCommand(
        'third-party',
        [thirdPartyRow({ salesInvoiceNo: 'INV-1', destinationTown: 'Harare' })],
        TENANT,
        userWriteScope(makeContext()),
        'jan-3rd-party.xlsx',
        USER_ID
      )
    );

    const [record] = repo.create.mock.calls[0];
    expect(record.lines).toEqual([
      {
        lineNumber: 1,
        salesInvoiceNo: 'INV-1',
        customerName: 'Olivine',
        consignmentNumber: undefined,
        destinationTown: 'Harare',
        tonnageRaw: 32,
      },
    ]);
    // The flat scalar fields must be the SAME values, not a second
    // independent computation -- see TransportCostSourceRecord.lines'
    // invariant #3.
    expect(record.salesInvoiceNo).toBe('INV-1');
    expect(record.customerName).toBe('Olivine');
    expect(record.destinationTown).toBe('Harare');
    expect(record.tonnageRaw).toBe(32);
  });

  it('a Swift row gets exactly one mirrored line built from Cons. Number/Receivers Name/Destination location/Actual weight', async () => {
    const repo = makeRepo();
    const handler = new ImportTransportCostHandler(repo, makeMatcher());

    await handler.execute(
      new ImportTransportCostCommand('swift', [swiftRow()], TENANT, userWriteScope(makeContext()), 'jan-swift.xlsx', USER_ID)
    );

    const [record] = repo.create.mock.calls[0];
    expect(record.lines).toEqual([
      {
        lineNumber: 1,
        salesInvoiceNo: 'CN-10234',
        customerName: 'Olivine',
        consignmentNumber: undefined,
        destinationTown: 'Bulawayo',
        tonnageRaw: 32,
      },
    ]);
  });

  it('a Depot STO row gets exactly one mirrored line', async () => {
    const repo = makeRepo();
    const handler = new ImportTransportCostHandler(repo, makeMatcher());

    await handler.execute(
      new ImportTransportCostCommand(
        'depot-sto',
        [depotStoRow({ customerName: 'Olivine', salesInvoiceNo: 'INV-9', destinationTown: 'Chitungwiza', tonnage: '10' })],
        TENANT,
        userWriteScope(makeContext()),
        'march-deport-sto.xlsx',
        USER_ID
      )
    );

    const [record] = repo.create.mock.calls[0];
    expect(record.lines).toHaveLength(1);
    expect(record.lines[0]).toMatchObject({
      lineNumber: 1,
      salesInvoiceNo: 'INV-9',
      customerName: 'Olivine',
      destinationTown: 'Chitungwiza',
      tonnageRaw: 10,
    });
  });

  it('a Vansales row gets exactly one mirrored line carrying only tonnageRaw (Vansales has no invoice/customer/destination concept)', async () => {
    const repo = makeRepo();
    const handler = new ImportTransportCostHandler(repo, makeMatcher());

    await handler.execute(
      new ImportTransportCostCommand(
        'vansales',
        [vansalesRow({ tonnage: '8' })],
        TENANT,
        userWriteScope(makeContext()),
        'may-vansales.xlsx',
        USER_ID,
        '2026-01'
      )
    );

    const [record] = repo.create.mock.calls[0];
    expect(record.lines).toEqual([
      { lineNumber: 1, salesInvoiceNo: undefined, customerName: undefined, consignmentNumber: undefined, destinationTown: undefined, tonnageRaw: 8 },
    ]);
  });
});

describe('ImportTransportCostHandler -- explicit multi-line third-party entry', () => {
  it('accepts an explicit multi-line submission and stores every line, numbered 1..N', async () => {
    const repo = makeRepo();
    const handler = new ImportTransportCostHandler(repo, makeMatcher());

    const result = await handler.execute(
      new ImportTransportCostCommand(
        'third-party',
        [
          thirdPartyRow({
            lines: [
              { salesInvoiceNo: 'INV-A', customerName: 'Customer A', consignmentNumber: 'CONS-A', destinationTown: 'Harare', tonnage: '2' },
              { salesInvoiceNo: 'INV-B', customerName: 'Customer B', consignmentNumber: 'CONS-B', destinationTown: 'Chitungwiza', tonnage: '3' },
              { salesInvoiceNo: 'INV-C', customerName: 'Customer C', consignmentNumber: 'CONS-C', destinationTown: 'Norton', tonnage: '1' },
            ],
          }),
        ],
        TENANT,
        userWriteScope(makeContext()),
        'jan-3rd-party.xlsx',
        USER_ID
      )
    );

    expect(result.summary).toEqual({ total: 1, succeeded: 1, duplicates: 0, failed: 0 });
    const [record] = repo.create.mock.calls[0];
    expect(record.lines).toHaveLength(3);
    expect(record.lines.map((l: any) => l.lineNumber)).toEqual([1, 2, 3]);
    expect(record.lines[1]).toMatchObject({ salesInvoiceNo: 'INV-B', customerName: 'Customer B', consignmentNumber: 'CONS-B', destinationTown: 'Chitungwiza', tonnageRaw: 3 });
  });

  it('mirrors lines[0] -- not the row\'s own (unused) scalar fields -- onto the record\'s flat scalar fields', async () => {
    const repo = makeRepo();
    const handler = new ImportTransportCostHandler(repo, makeMatcher());

    await handler.execute(
      new ImportTransportCostCommand(
        'third-party',
        [
          thirdPartyRow({
            // Deliberately different from the explicit lines below, to
            // prove the scalar mirror comes from lines[0], never from
            // these ignored scalar fields, when `lines` is present.
            customerName: 'IGNORED SCALAR CUSTOMER',
            destinationTown: 'IGNORED SCALAR DESTINATION',
            lines: [{ customerName: 'Real Customer', destinationTown: 'Real Destination', tonnage: '5' }],
          }),
        ],
        TENANT,
        userWriteScope(makeContext()),
        'jan-3rd-party.xlsx',
        USER_ID
      )
    );

    const [record] = repo.create.mock.calls[0];
    expect(record.customerName).toBe('Real Customer');
    expect(record.destinationTown).toBe('Real Destination');
    expect(record.tonnageRaw).toBe(5);
  });

  it('drops a wholly-blank extra line and renumbers the survivors 1..N', async () => {
    const repo = makeRepo();
    const handler = new ImportTransportCostHandler(repo, makeMatcher());

    await handler.execute(
      new ImportTransportCostCommand(
        'third-party',
        [
          thirdPartyRow({
            lines: [
              { customerName: 'Customer A', tonnage: '2' },
              {}, // a UI artifact -- "clicked add line, typed nothing"
              { customerName: 'Customer B', tonnage: '3' },
            ],
          }),
        ],
        TENANT,
        userWriteScope(makeContext()),
        'jan-3rd-party.xlsx',
        USER_ID
      )
    );

    const [record] = repo.create.mock.calls[0];
    expect(record.lines).toHaveLength(2);
    expect(record.lines.map((l: any) => l.lineNumber)).toEqual([1, 2]);
    expect(record.lines.map((l: any) => l.customerName)).toEqual(['Customer A', 'Customer B']);
  });

  it('rejects the row when every submitted line is blank -- there is genuinely no load data', async () => {
    const repo = makeRepo();
    const handler = new ImportTransportCostHandler(repo, makeMatcher());

    const result = await handler.execute(
      new ImportTransportCostCommand(
        'third-party',
        [thirdPartyRow({ lines: [{}, {}] })],
        TENANT,
        userWriteScope(makeContext()),
        'jan-3rd-party.xlsx',
        USER_ID
      )
    );

    expect(result.summary).toEqual({ total: 1, succeeded: 0, duplicates: 0, failed: 1 });
    expect(result.results[0]).toMatchObject({ success: false, column: 'lines' });
    expect(repo.create).not.toHaveBeenCalled();
  });

  it('a line with only a consignment number (no invoice) still counts as non-blank and survives', async () => {
    const repo = makeRepo();
    const handler = new ImportTransportCostHandler(repo, makeMatcher());

    await handler.execute(
      new ImportTransportCostCommand(
        'third-party',
        [thirdPartyRow({ lines: [{ consignmentNumber: 'CONS-ONLY' }] })],
        TENANT,
        userWriteScope(makeContext()),
        'jan-3rd-party.xlsx',
        USER_ID
      )
    );

    const [record] = repo.create.mock.calls[0];
    expect(record.lines).toEqual([
      { lineNumber: 1, salesInvoiceNo: undefined, customerName: undefined, consignmentNumber: 'CONS-ONLY', destinationTown: undefined, tonnageRaw: null },
    ]);
  });

  it('an empty `lines` array (not omitted, but length 0) falls back to the scalar-field single line, same as omitting it entirely', async () => {
    const repo = makeRepo();
    const handler = new ImportTransportCostHandler(repo, makeMatcher());

    await handler.execute(
      new ImportTransportCostCommand(
        'third-party',
        [thirdPartyRow({ lines: [], customerName: 'Fallback Customer' })],
        TENANT,
        userWriteScope(makeContext()),
        'jan-3rd-party.xlsx',
        USER_ID
      )
    );

    const [record] = repo.create.mock.calls[0];
    // thirdPartyRow()'s own default `tonnage: '32'` is still in play here
    // -- the fallback reads the row's scalar fields, and this test did
    // not override tonnage.
    expect(record.lines).toEqual([
      { lineNumber: 1, salesInvoiceNo: undefined, customerName: 'Fallback Customer', consignmentNumber: undefined, destinationTown: undefined, tonnageRaw: 32 },
    ]);
  });
});

describe('ImportTransportCostHandler -- CRITICAL FINANCIAL RULE: cost is parent-level, never multiplied by line count', () => {
  it('a 3-line operation still inserts exactly ONE source record with ONE unchanged amount, not three', async () => {
    const repo = makeRepo();
    const handler = new ImportTransportCostHandler(repo, makeMatcher());

    const result = await handler.execute(
      new ImportTransportCostCommand(
        'third-party',
        [
          thirdPartyRow({
            amount: '1000',
            lines: [
              { customerName: 'Customer A', destinationTown: 'Harare', tonnage: '2' },
              { customerName: 'Customer B', destinationTown: 'Chitungwiza', tonnage: '3' },
              { customerName: 'Customer C', destinationTown: 'Norton', tonnage: '1' },
            ],
          }),
        ],
        TENANT,
        userWriteScope(makeContext()),
        'jan-3rd-party.xlsx',
        USER_ID
      )
    );

    // Exactly one row succeeded, one repo.create call -- never one per line.
    expect(result.summary).toEqual({ total: 1, succeeded: 1, duplicates: 0, failed: 0 });
    expect(repo.create).toHaveBeenCalledTimes(1);
    const [record] = repo.create.mock.calls[0];
    expect(record.amount).toBe(1000);
    expect(record.lines).toHaveLength(3);
  });

  it('amount is identical whether a row has one line or five -- line count never enters the amount computation', async () => {
    const repo = makeRepo();
    const handler = new ImportTransportCostHandler(repo, makeMatcher());

    await handler.execute(
      new ImportTransportCostCommand(
        'third-party',
        [
          thirdPartyRow({ rowNumber: 2, amount: '1000' }), // 1 (implicit) line
          thirdPartyRow({
            rowNumber: 3,
            amount: '1000',
            lines: [{ customerName: 'A' }, { customerName: 'B' }, { customerName: 'C' }, { customerName: 'D' }, { customerName: 'E' }],
          }),
        ],
        TENANT,
        userWriteScope(makeContext()),
        'jan-3rd-party.xlsx',
        USER_ID
      )
    );

    const amounts = repo.create.mock.calls.map(([record]: [any]) => record.amount);
    expect(amounts).toEqual([1000, 1000]);
  });

  it('the TransportCostLine type carries no amount/cost field at all (compile-time guarantee, asserted at runtime too)', async () => {
    const repo = makeRepo();
    const handler = new ImportTransportCostHandler(repo, makeMatcher());

    await handler.execute(
      new ImportTransportCostCommand(
        'third-party',
        [thirdPartyRow({ lines: [{ customerName: 'A', tonnage: '2' }, { customerName: 'B', tonnage: '3' }] })],
        TENANT,
        userWriteScope(makeContext()),
        'jan-3rd-party.xlsx',
        USER_ID
      )
    );

    const [record] = repo.create.mock.calls[0];
    for (const line of record.lines) {
      expect(line).not.toHaveProperty('amount');
      expect(line).not.toHaveProperty('cost');
    }
  });
});

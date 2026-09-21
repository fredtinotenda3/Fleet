// tests/unit/transport-cost/import-transport-cost.handler.spec.ts
//
// Unit tests for ImportTransportCostHandler
// (modules/transport-cost/commands/handlers/import-transport-cost.handler.ts),
// Phase O1 of the Olivine transport-cost work. Mocks
// TransportCostSourceRecordRepository and resolveCreationOrgUnitId at
// the boundaries the handler actually calls, mirroring the mocking style
// of tests/unit/vehicles/assign-vehicle-driver.handler.spec.ts.
//
// Covers every acceptance point called out in the handler's own header
// comment and the audit sections it cites:
//  - rejects a missing/unparseable date (third-party)
//  - rejects a missing registration (third-party)
//  - rejects a known-invalid transporter value ("VAT EXCL" -- Section K)
//  - never coerces a blank Amount to 0 (Section K's null-rate finding)
//  - flags a likely duplicate without inserting it (Section I)
//  - never trusts the uploaded row for orgUnitId -- it always comes from
//    resolveCreationOrgUnitId, never the row payload
//  - normalizes registration whitespace/case
//  - a Vansales row with a blank REG cell still imports successfully
//    (a known merged-cell artifact, not a rejection)

import { ImportTransportCostHandler } from '../../../modules/transport-cost/commands/handlers/import-transport-cost.handler';
import { ImportTransportCostCommand, ThirdPartyImportRow, VansalesImportRow } from '../../../modules/transport-cost/commands/import-transport-cost.command';
import { userWriteScope, systemWriteScope } from '../../../server/tenancy/write-scope';
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
    amount: '4500',
    tonnage: '32',
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
    ...overrides,
  };
}

beforeEach(() => {
  jest.clearAllMocks();
  resolveCreationOrgUnitId.mockReturnValue('branch-harare');
});

describe('ImportTransportCostHandler -- third-party validation', () => {
  it('rejects a row with a missing/unparseable date and does not insert it', async () => {
    const repo = makeRepo();
    const handler = new ImportTransportCostHandler(repo);

    const result = await handler.execute(
      new ImportTransportCostCommand(
        'third-party',
        [thirdPartyRow({ date: 'not-a-date' })],
        TENANT,
        userWriteScope(makeContext()),
        'jan-3rd-party.xlsx',
        USER_ID
      )
    );

    expect(result.summary).toEqual({ total: 1, succeeded: 0, duplicates: 0, failed: 1 });
    expect(result.results[0]).toMatchObject({ success: false, column: 'date' });
    expect(repo.create).not.toHaveBeenCalled();
  });

  it('rejects "31.02.26" specifically -- an invalid calendar date must not silently roll over to March', async () => {
    const repo = makeRepo();
    const handler = new ImportTransportCostHandler(repo);

    const result = await handler.execute(
      new ImportTransportCostCommand(
        'third-party',
        [thirdPartyRow({ date: '31.02.26' })],
        TENANT,
        userWriteScope(makeContext()),
        'jan-3rd-party.xlsx',
        USER_ID
      )
    );

    expect(result.results[0]).toMatchObject({ success: false, column: 'date' });
  });

  it('rejects a row with a missing registration', async () => {
    const repo = makeRepo();
    const handler = new ImportTransportCostHandler(repo);

    const result = await handler.execute(
      new ImportTransportCostCommand(
        'third-party',
        [thirdPartyRow({ registration: '' })],
        TENANT,
        userWriteScope(makeContext()),
        'jan-3rd-party.xlsx',
        USER_ID
      )
    );

    expect(result.results[0]).toMatchObject({ success: false, column: 'registration' });
    expect(repo.create).not.toHaveBeenCalled();
  });

  it('rejects a known-invalid transporter value ("VAT EXCL") rather than importing it as a transporter name', async () => {
    const repo = makeRepo();
    const handler = new ImportTransportCostHandler(repo);

    const result = await handler.execute(
      new ImportTransportCostCommand(
        'third-party',
        [thirdPartyRow({ transporter: 'VAT EXCL' })],
        TENANT,
        userWriteScope(makeContext()),
        'jan-3rd-party.xlsx',
        USER_ID
      )
    );

    expect(result.results[0]).toMatchObject({ success: false, column: 'transporter' });
    expect(repo.create).not.toHaveBeenCalled();
  });

  it('never coerces a blank Amount cell to 0 -- stores null and still succeeds', async () => {
    const repo = makeRepo();
    const handler = new ImportTransportCostHandler(repo);

    await handler.execute(
      new ImportTransportCostCommand(
        'third-party',
        [thirdPartyRow({ amount: undefined })],
        TENANT,
        userWriteScope(makeContext()),
        'jul-3rd-party.xlsx',
        USER_ID
      )
    );

    expect(repo.create).toHaveBeenCalledTimes(1);
    const [record] = repo.create.mock.calls[0];
    expect(record.amount).toBeNull();
    // Never a coerced 0 or a string.
    expect(record.amount).not.toBe(0);
  });

  it('normalizes registration whitespace and case (e.g. "agl 8230" -> "AGL8230")', async () => {
    const repo = makeRepo();
    const handler = new ImportTransportCostHandler(repo);

    await handler.execute(
      new ImportTransportCostCommand(
        'third-party',
        [thirdPartyRow({ registration: '  agl 8230 ' })],
        TENANT,
        userWriteScope(makeContext()),
        'jan-3rd-party.xlsx',
        USER_ID
      )
    );

    const [record] = repo.create.mock.calls[0];
    expect(record.registration).toBe('AGL8230');
    expect(record.registrationRaw).toBe('agl 8230');
  });
});

describe('ImportTransportCostHandler -- vansales validation', () => {
  it('imports a Vansales row with a blank REG cell successfully (merged-cell artifact, not a rejection)', async () => {
    const repo = makeRepo();
    const handler = new ImportTransportCostHandler(repo);

    const result = await handler.execute(
      new ImportTransportCostCommand(
        'vansales',
        [vansalesRow({ registration: undefined })],
        TENANT,
        userWriteScope(makeContext()),
        'may-vansales.xlsx',
        USER_ID
      )
    );

    expect(result.summary).toEqual({ total: 1, succeeded: 1, duplicates: 0, failed: 0 });
    const [record] = repo.create.mock.calls[0];
    expect(record.registration).toBeNull();
    expect(record.vansales.payerName).toBe('Mr Gurjit');
  });

  it('rejects a Vansales row with a missing payerName', async () => {
    const repo = makeRepo();
    const handler = new ImportTransportCostHandler(repo);

    const result = await handler.execute(
      new ImportTransportCostCommand(
        'vansales',
        [vansalesRow({ payerName: undefined })],
        TENANT,
        userWriteScope(makeContext()),
        'may-vansales.xlsx',
        USER_ID
      )
    );

    expect(result.results[0]).toMatchObject({ success: false, column: 'payerName' });
    expect(repo.create).not.toHaveBeenCalled();
  });

  it('rejects a Vansales row with a missing TRUCK (transporter) value', async () => {
    const repo = makeRepo();
    const handler = new ImportTransportCostHandler(repo);

    const result = await handler.execute(
      new ImportTransportCostCommand(
        'vansales',
        [vansalesRow({ truck: undefined })],
        TENANT,
        userWriteScope(makeContext()),
        'may-vansales.xlsx',
        USER_ID
      )
    );

    expect(result.results[0]).toMatchObject({ success: false, column: 'truck' });
  });

  it('never coerces a blank weekly amount to 0, and stores the retainer under `amount: null` rather than the total', async () => {
    const repo = makeRepo();
    const handler = new ImportTransportCostHandler(repo);

    await handler.execute(
      new ImportTransportCostCommand(
        'vansales',
        [vansalesRow({ week2: undefined, total: '1200' })],
        TENANT,
        userWriteScope(makeContext()),
        'may-vansales.xlsx',
        USER_ID
      )
    );

    const [record] = repo.create.mock.calls[0];
    expect(record.vansales.weeklyAmounts[1]).toBeNull();
    expect(record.vansales.total).toBe(1200);
    // A Vansales retainer is never written to the shared `amount` field.
    expect(record.amount).toBeNull();
  });
});

describe('ImportTransportCostHandler -- duplicate detection', () => {
  it('flags a likely duplicate and does not insert it', async () => {
    const existing = { _id: 'existing-id' };
    const repo = makeRepo({
      findLikelyDuplicate: jest.fn().mockResolvedValue(existing),
    });
    const handler = new ImportTransportCostHandler(repo);

    const result = await handler.execute(
      new ImportTransportCostCommand(
        'third-party',
        [thirdPartyRow()],
        TENANT,
        userWriteScope(makeContext()),
        'jan-3rd-party.xlsx',
        USER_ID
      )
    );

    expect(result.summary).toEqual({ total: 1, succeeded: 0, duplicates: 1, failed: 0 });
    expect(result.results[0]).toMatchObject({ success: false, duplicate: true });
    expect(repo.create).not.toHaveBeenCalled();
  });

  it('imports normally when no duplicate is found', async () => {
    const repo = makeRepo({ findLikelyDuplicate: jest.fn().mockResolvedValue(null) });
    const handler = new ImportTransportCostHandler(repo);

    const result = await handler.execute(
      new ImportTransportCostCommand(
        'third-party',
        [thirdPartyRow()],
        TENANT,
        userWriteScope(makeContext()),
        'jan-3rd-party.xlsx',
        USER_ID
      )
    );

    expect(result.summary).toEqual({ total: 1, succeeded: 1, duplicates: 0, failed: 0 });
    expect(repo.create).toHaveBeenCalledTimes(1);
  });
});

describe('ImportTransportCostHandler -- org-unit scoping', () => {
  it('resolves orgUnitId once per batch from the importing user\'s own scope, never from the uploaded row', async () => {
    const repo = makeRepo();
    const handler = new ImportTransportCostHandler(repo);
    resolveCreationOrgUnitId.mockReturnValue('branch-bulawayo');

    // The row type has no orgUnitId field at all -- if a caller smuggled
    // one in via `as any`, it must still be ignored.
    const rowWithSmuggledOrgUnitId = { ...thirdPartyRow(), orgUnitId: 'branch-attacker' } as any;

    await handler.execute(
      new ImportTransportCostCommand(
        'third-party',
        [rowWithSmuggledOrgUnitId],
        TENANT,
        userWriteScope(makeContext()),
        'jan-3rd-party.xlsx',
        USER_ID
      )
    );

    expect(resolveCreationOrgUnitId).toHaveBeenCalledTimes(1);
    const [record] = repo.create.mock.calls[0];
    expect(record.orgUnitId).toBe('branch-bulawayo');
  });

  it('resolves orgUnitId only once for a multi-row batch, not once per row', async () => {
    const repo = makeRepo();
    const handler = new ImportTransportCostHandler(repo);

    await handler.execute(
      new ImportTransportCostCommand(
        'third-party',
        [thirdPartyRow({ rowNumber: 2 }), thirdPartyRow({ rowNumber: 3, registration: 'AHC9303' })],
        TENANT,
        userWriteScope(makeContext()),
        'jan-3rd-party.xlsx',
        USER_ID
      )
    );

    expect(resolveCreationOrgUnitId).toHaveBeenCalledTimes(1);
    expect(repo.create).toHaveBeenCalledTimes(2);
  });

  it('leaves orgUnitId unresolved (undefined) for a system-scoped import with no acting user, rather than guessing', async () => {
    const repo = makeRepo();
    const handler = new ImportTransportCostHandler(repo);

    await handler.execute(
      new ImportTransportCostCommand(
        'third-party',
        [thirdPartyRow()],
        TENANT,
        systemWriteScope(TENANT, 'scheduled backfill, no acting user'),
        'jan-3rd-party.xlsx'
      )
    );

    expect(resolveCreationOrgUnitId).not.toHaveBeenCalled();
    const [record] = repo.create.mock.calls[0];
    expect(record.orgUnitId).toBeUndefined();
  });
});

describe('ImportTransportCostHandler -- provenance', () => {
  it('stamps every inserted row with the same importBatchId and the given sourceFileName', async () => {
    const repo = makeRepo();
    const handler = new ImportTransportCostHandler(repo);

    const result = await handler.execute(
      new ImportTransportCostCommand(
        'third-party',
        [thirdPartyRow({ rowNumber: 2 }), thirdPartyRow({ rowNumber: 3, registration: 'AHC9303' })],
        TENANT,
        userWriteScope(makeContext()),
        'jan-3rd-party.xlsx',
        USER_ID
      )
    );

    const batchIds = repo.create.mock.calls.map(([record]: [any]) => record.importBatchId);
    expect(new Set(batchIds).size).toBe(1);
    expect(batchIds[0]).toBe(result.importBatchId);
    for (const [record] of repo.create.mock.calls) {
      expect(record.sourceFileName).toBe('jan-3rd-party.xlsx');
    }
  });
});

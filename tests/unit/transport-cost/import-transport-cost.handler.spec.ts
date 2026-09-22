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
    update: jest.fn().mockResolvedValue(null),
    ...overrides,
  } as any;
}

/** Phase O2: a no-op matcher by default -- every call resolves 'no-value'/'no-registration' so tests that don't care about normalization see no side effects. */
function makeMatcher(overrides: Record<string, jest.Mock> = {}) {
  return {
    matchTransporter: jest.fn().mockResolvedValue({ outcome: 'no-value' }),
    matchVehicle: jest.fn().mockResolvedValue({ outcome: 'no-registration' }),
    ...overrides,
  } as any;
}

/** Item 6: the data-quality exception repository, mocked at the same boundary as the source-record repo above. */
function makeExceptionRepo(overrides: Record<string, jest.Mock> = {}) {
  return {
    log: jest.fn().mockResolvedValue({ _id: 'exc-id' }),
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
    const handler = new ImportTransportCostHandler(repo, makeMatcher());

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
    const handler = new ImportTransportCostHandler(repo, makeMatcher());

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
    const handler = new ImportTransportCostHandler(repo, makeMatcher());

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
    const handler = new ImportTransportCostHandler(repo, makeMatcher());

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
    const handler = new ImportTransportCostHandler(repo, makeMatcher());

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
    const handler = new ImportTransportCostHandler(repo, makeMatcher());

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
    const handler = new ImportTransportCostHandler(repo, makeMatcher());

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
    const handler = new ImportTransportCostHandler(repo, makeMatcher());

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
    const handler = new ImportTransportCostHandler(repo, makeMatcher());

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
    const handler = new ImportTransportCostHandler(repo, makeMatcher());

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
    const handler = new ImportTransportCostHandler(repo, makeMatcher());

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
    const handler = new ImportTransportCostHandler(repo, makeMatcher());

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

describe('ImportTransportCostHandler -- item 6 data-quality exception persistence', () => {
  it('persists a rejected exception with the column/reason and the raw row, for a row that fails validation', async () => {
    const repo = makeRepo();
    const exceptionRepo = makeExceptionRepo();
    const handler = new ImportTransportCostHandler(repo, makeMatcher(), exceptionRepo);

    const result = await handler.execute(
      new ImportTransportCostCommand(
        'third-party',
        [thirdPartyRow({ rowNumber: 7, registration: '' })],
        TENANT,
        userWriteScope(makeContext()),
        'jan-3rd-party.xlsx',
        USER_ID
      )
    );

    expect(result.summary).toEqual({ total: 1, succeeded: 0, duplicates: 0, failed: 1 });
    expect(exceptionRepo.log).toHaveBeenCalledTimes(1);
    const [logged, tenantId, userId] = exceptionRepo.log.mock.calls[0];
    expect(logged).toMatchObject({
      orgUnitId: 'branch-harare',
      importBatchId: result.importBatchId,
      sheetFamily: 'third-party',
      sourceFileName: 'jan-3rd-party.xlsx',
      sourceRowNumber: 7,
      kind: 'rejected',
      column: 'registration',
      reason: 'Truck registration number is required',
    });
    expect(logged.rawRow).toMatchObject({ rowNumber: 7, registration: '' });
    expect(tenantId).toBe(TENANT);
    expect(userId).toBe(USER_ID);
  });

  it('persists a duplicate exception with the source record\'s rawRow when a likely duplicate is flagged', async () => {
    const existing = { _id: 'existing-id' };
    const repo = makeRepo({ findLikelyDuplicate: jest.fn().mockResolvedValue(existing) });
    const exceptionRepo = makeExceptionRepo();
    const handler = new ImportTransportCostHandler(repo, makeMatcher(), exceptionRepo);

    await handler.execute(
      new ImportTransportCostCommand(
        'third-party',
        [thirdPartyRow()],
        TENANT,
        userWriteScope(makeContext()),
        'jan-3rd-party.xlsx',
        USER_ID
      )
    );

    expect(exceptionRepo.log).toHaveBeenCalledTimes(1);
    const [logged] = exceptionRepo.log.mock.calls[0];
    expect(logged.kind).toBe('duplicate');
    expect(logged.reason).toContain('duplicate');
    expect(logged.rawRow).toMatchObject({ registration: 'AGL8230' });
  });

  it('never persists an exception for a row that imports successfully', async () => {
    const repo = makeRepo();
    const exceptionRepo = makeExceptionRepo();
    const handler = new ImportTransportCostHandler(repo, makeMatcher(), exceptionRepo);

    await handler.execute(
      new ImportTransportCostCommand(
        'third-party',
        [thirdPartyRow()],
        TENANT,
        userWriteScope(makeContext()),
        'jan-3rd-party.xlsx',
        USER_ID
      )
    );

    expect(exceptionRepo.log).not.toHaveBeenCalled();
  });

  it('does not fail the import when persisting the exception itself fails (best-effort)', async () => {
    const repo = makeRepo();
    const exceptionRepo = makeExceptionRepo({ log: jest.fn().mockRejectedValue(new Error('MONGODB_URI environment variable is not defined')) });
    const handler = new ImportTransportCostHandler(repo, makeMatcher(), exceptionRepo);
    const consoleSpy = jest.spyOn(console, 'error').mockImplementation(() => {});

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

    // The row's own outcome (a validation failure, decided before the
    // exception-logging call ever runs) is unaffected by the logging
    // failure -- it is still exactly one rejected row, not a thrown error.
    expect(result.summary).toEqual({ total: 1, succeeded: 0, duplicates: 0, failed: 1 });
    expect(consoleSpy).toHaveBeenCalledWith(
      expect.stringContaining('failed to persist rejected exception'),
      expect.anything()
    );
    consoleSpy.mockRestore();
  });
});

describe('ImportTransportCostHandler -- org-unit scoping', () => {
  it('resolves orgUnitId once per batch from the importing user\'s own scope, never from the uploaded row', async () => {
    const repo = makeRepo();
    const handler = new ImportTransportCostHandler(repo, makeMatcher());
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
    const handler = new ImportTransportCostHandler(repo, makeMatcher());

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
    const handler = new ImportTransportCostHandler(repo, makeMatcher());

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
    const handler = new ImportTransportCostHandler(repo, makeMatcher());

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

describe('ImportTransportCostHandler -- Phase O2 normalization wiring', () => {
  it('runs the matcher for every successfully inserted row, with the normalized fields and the new row id', async () => {
    const repo = makeRepo();
    const matcher = makeMatcher();
    const handler = new ImportTransportCostHandler(repo, matcher);

    await handler.execute(
      new ImportTransportCostCommand(
        'third-party',
        [thirdPartyRow()],
        TENANT,
        userWriteScope(makeContext()),
        'jan-3rd-party.xlsx',
        USER_ID
      )
    );

    expect(matcher.matchTransporter).toHaveBeenCalledWith('PRINORTH', 'new-id', TENANT);
    expect(matcher.matchVehicle).toHaveBeenCalledWith('AGL8230', 'AGL8230', 'new-id', TENANT);
  });

  it('never runs the matcher for a row that failed validation or was flagged as a duplicate', async () => {
    const repo = makeRepo({ findLikelyDuplicate: jest.fn().mockResolvedValue({ _id: 'existing' }) });
    const matcher = makeMatcher();
    const handler = new ImportTransportCostHandler(repo, matcher);

    await handler.execute(
      new ImportTransportCostCommand(
        'third-party',
        [thirdPartyRow({ date: 'not-a-date' }), thirdPartyRow({ registration: 'AHC9303' })],
        TENANT,
        userWriteScope(makeContext()),
        'jan-3rd-party.xlsx',
        USER_ID
      )
    );

    expect(matcher.matchTransporter).not.toHaveBeenCalled();
    expect(matcher.matchVehicle).not.toHaveBeenCalled();
  });

  it('applies a resolved-confirmed transporter match to the newly inserted row via repo.update', async () => {
    const repo = makeRepo();
    const matcher = makeMatcher({
      matchTransporter: jest.fn().mockResolvedValue({ outcome: 'resolved-confirmed', transporterPartnerId: 'partner-1' }),
    });
    const handler = new ImportTransportCostHandler(repo, matcher);

    await handler.execute(
      new ImportTransportCostCommand(
        'third-party',
        [thirdPartyRow()],
        TENANT,
        userWriteScope(makeContext()),
        'jan-3rd-party.xlsx',
        USER_ID
      )
    );

    expect(repo.update).toHaveBeenCalledWith('new-id', { transporterPartnerId: 'partner-1' }, TENANT);
  });

  it('applies a resolved-confirmed vehicle match to the newly inserted row via repo.update', async () => {
    const repo = makeRepo();
    const matcher = makeMatcher({
      matchVehicle: jest.fn().mockResolvedValue({ outcome: 'resolved-confirmed', contractedVehicleId: 'vehicle-1' }),
    });
    const handler = new ImportTransportCostHandler(repo, matcher);

    await handler.execute(
      new ImportTransportCostCommand(
        'third-party',
        [thirdPartyRow()],
        TENANT,
        userWriteScope(makeContext()),
        'jan-3rd-party.xlsx',
        USER_ID
      )
    );

    expect(repo.update).toHaveBeenCalledWith('new-id', { contractedVehicleId: 'vehicle-1' }, TENANT);
  });

  it('never calls repo.update when both matches land in the review queue -- suggest only, never auto-merge', async () => {
    const repo = makeRepo();
    const matcher = makeMatcher({
      matchTransporter: jest.fn().mockResolvedValue({ outcome: 'pending-review', reviewItemId: 'item-1', candidateScore: 0.9 }),
      matchVehicle: jest.fn().mockResolvedValue({ outcome: 'pending-review', reviewItemId: 'item-2' }),
    });
    const handler = new ImportTransportCostHandler(repo, matcher);

    await handler.execute(
      new ImportTransportCostCommand(
        'third-party',
        [thirdPartyRow()],
        TENANT,
        userWriteScope(makeContext()),
        'jan-3rd-party.xlsx',
        USER_ID
      )
    );

    expect(repo.update).not.toHaveBeenCalled();
  });

  it('a matcher failure never turns an otherwise-successful import row into a reported failure', async () => {
    const repo = makeRepo();
    const matcher = makeMatcher({
      matchTransporter: jest.fn().mockRejectedValue(new Error('boom')),
    });
    const handler = new ImportTransportCostHandler(repo, matcher);

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
  });
});

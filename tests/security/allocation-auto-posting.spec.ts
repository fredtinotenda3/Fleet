// tests/security/allocation-auto-posting.spec.ts
//
// PHASE 6 -- auto-posting, idempotency, and fail-closed currency.
//
// THE GAPS:
//   * The allocation ledger was complete, correct, indexed, append-only
//     and TESTED -- and read an empty collection, because a repo-wide
//     grep found no caller from fuel, expenses, maintenance or work
//     orders. `getCostPerKm` divided a real distance by a total of zero
//     and returned a number that looked like an answer.
//   * The ledger models currency and FX properly, but the transactions
//     feeding it carried none, so every posting was implicitly the
//     reporting currency and a ZWL expense became a USD cost.
//
// LIMITATION, STATED: there is no MongoDB here, so the ledger is an
// in-memory double implementing the same contract. This proves the
// POSTING SERVICE's logic -- deduplication, refusal conditions, currency
// handling. It does NOT prove Mongo's unique-index atomicity under real
// concurrency, which is a property of the database and of the index
// asserted structurally at the bottom.

import * as fs from 'fs';
import * as path from 'path';

const ROOT = path.resolve(__dirname, '../..');

const mockLedger = { findByIdempotencyKey: jest.fn() };
const mockPostAllocation = jest.fn();
const mockSettings = { resolve: jest.fn() };

jest.mock('@/modules/finance/repositories/allocation-ledger.repository', () => ({
  allocationLedgerRepository: mockLedger,
}));
jest.mock('@/modules/finance/services/allocation.service', () => ({
  allocationService: { postAllocation: (...a: unknown[]) => mockPostAllocation(...a) },
}));
jest.mock('@/modules/finance/services/finance-settings.service', () => ({
  financeSettingsService: mockSettings,
}));
jest.mock('@/infrastructure/monitoring/logger', () => ({
  monitoring: { logError: jest.fn(), logWarn: jest.fn(), logInfo: jest.fn(), logDebug: jest.fn() },
}));

import {
  allocationPostingService,
  buildPostingIdempotencyKey,
  AutoPostSource,
} from '@/modules/finance/services/allocation-posting.service';
import { ValidationError } from '@/server/errors/app.errors';

const context = {
  organizationId: 'tenant-a',
  organizationName: 'Tenant A',
  accessibleOrgUnitIds: null,
  assignedOrgUnitIds: [],
  isPlatformScope: false,
} as never;

function source(over: Partial<AutoPostSource> = {}): AutoPostSource {
  return {
    sourceCollection: 'tblexpenses',
    sourceId: 'exp-1',
    vehicleId: 'vehicle-1',
    costCategory: 'other',
    occurredAt: new Date('2026-08-20T09:00:00.000Z'),
    amount: 400,
    ...over,
  };
}

beforeEach(() => {
  jest.clearAllMocks();
  mockLedger.findByIdempotencyKey.mockResolvedValue(null);
  mockSettings.resolve.mockResolvedValue({ reportingCurrency: 'USD' });
  mockPostAllocation.mockImplementation(async (_c, _u, input) => ({
    _id: 'posting-1',
    ...input,
    reportingAmount: input.amount * (input.fxRate ?? 1),
  }));
});

describe('Phase 6: transactions auto-post into the ledger', () => {
  it('posts a fuel log once', async () => {
    const outcome = await allocationPostingService.postSource(
      context,
      'system',
      source({ sourceCollection: 'tblfuellogs', sourceId: 'fuel-1', costCategory: 'fuel' })
    );

    expect(outcome.status).toBe('posted');
    expect(mockPostAllocation).toHaveBeenCalledTimes(1);
  });

  it('posts an expense once', async () => {
    const outcome = await allocationPostingService.postSource(context, 'system', source());
    expect(outcome.status).toBe('posted');
  });

  it('posts as a DIRECT allocation with periodStart === periodEnd', async () => {
    // A single dated transaction is not spread over anything -- it
    // belongs entirely to the vehicle that incurred it. Any other rule
    // would need a denominator this source does not have.
    await allocationPostingService.postSource(context, 'system', source());

    const input = mockPostAllocation.mock.calls[0][2];
    expect(input.allocationRule).toBe('direct');
    expect(input.periodStart).toEqual(input.periodEnd);
  });

  it('supplies NO orgUnitId — the ledger derives it from the vehicle', async () => {
    // The handler has no field in which to express an org unit, so a
    // buggy caller cannot misattribute a cost to another branch.
    await allocationPostingService.postSource(context, 'system', source());

    const input = mockPostAllocation.mock.calls[0][2];
    expect(input).not.toHaveProperty('orgUnitId');
    expect(input).not.toHaveProperty('tenantId');
  });
});

describe('Phase 6: idempotency under at-least-once delivery', () => {
  it('builds a DETERMINISTIC key for the same source record', () => {
    const params = {
      tenantId: 'tenant-a',
      sourceCollection: 'tblexpenses',
      sourceId: 'exp-1',
      costCategory: 'other',
    };
    expect(buildPostingIdempotencyKey(params)).toBe(buildPostingIdempotencyKey(params));
  });

  it('distinguishes cost categories on the SAME source record', () => {
    // A work order carrying both parts and labour is two costs, not one.
    // Without costCategory in the key they would collapse into each
    // other and half the money would vanish.
    const base = {
      tenantId: 'tenant-a',
      sourceCollection: 'tblreminders',
      sourceId: 'wo-1',
      costCategory: 'maintenance',
    };
    expect(buildPostingIdempotencyKey(base)).not.toBe(
      buildPostingIdempotencyKey({ ...base, costCategory: 'other' })
    );
  });

  it('distinguishes tenants', () => {
    const base = {
      tenantId: 'tenant-a',
      sourceCollection: 'tblexpenses',
      sourceId: 'exp-1',
      costCategory: 'other',
    };
    expect(buildPostingIdempotencyKey(base)).not.toBe(
      buildPostingIdempotencyKey({ ...base, tenantId: 'tenant-b' })
    );
  });

  it('cannot collide across component boundaries', () => {
    // Naive concatenation makes ('ab','c') and ('a','bc') identical,
    // silently merging two different source records into one posting.
    const a = buildPostingIdempotencyKey({
      tenantId: 't', sourceCollection: 'ab', sourceId: 'c', costCategory: 'x',
    });
    const b = buildPostingIdempotencyKey({
      tenantId: 't', sourceCollection: 'a', sourceId: 'bc', costCategory: 'x',
    });
    expect(a).not.toBe(b);
  });

  it('a REDELIVERED event writes nothing', async () => {
    // THE headline regression. The ledger is append-only, so a double
    // posting cannot be edited away -- only reversed by a human who
    // first notices a plausible-looking number.
    mockLedger.findByIdempotencyKey.mockResolvedValue({ _id: 'posting-existing' });

    const outcome = await allocationPostingService.postSource(context, 'system', source());

    expect(outcome).toEqual({ status: 'duplicate', existingPostingId: 'posting-existing' });
    expect(mockPostAllocation).not.toHaveBeenCalled();
  });

  it('resolves the unique-index RACE by reporting the winner', async () => {
    // Two handlers can both pass the read before either writes.
    mockLedger.findByIdempotencyKey
      .mockResolvedValueOnce(null)
      .mockResolvedValueOnce({ _id: 'posting-winner' });
    mockPostAllocation.mockRejectedValueOnce({ code: 11000 });

    const outcome = await allocationPostingService.postSource(context, 'system', source());

    expect(outcome).toEqual({ status: 'duplicate', existingPostingId: 'posting-winner' });
  });

  it('passes the key through to the stored posting', async () => {
    await allocationPostingService.postSource(context, 'system', source());
    expect(mockPostAllocation.mock.calls[0][2].idempotencyKey).toBeDefined();
  });
});

describe('Phase 6: currency fails closed', () => {
  it('REFUSES a foreign currency with no rate rather than assuming parity', async () => {
    // Not an approximation -- a 1:1 fallback silently asserts that 400
    // ZWL and 400 USD are the same cost, in a number an operator acts on.
    const outcome = await allocationPostingService.postSource(
      context,
      'system',
      source({ currency: 'ZWL' })
    );

    expect(outcome.status).toBe('refused');
    expect(mockPostAllocation).not.toHaveBeenCalled();
  });

  it('names the currencies in the refusal so it is actionable', async () => {
    const outcome = await allocationPostingService.postSource(
      context,
      'system',
      source({ currency: 'ZWL' })
    );

    expect(outcome.status === 'refused' && outcome.reason).toContain('ZWL');
    expect(outcome.status === 'refused' && outcome.reason).toContain('USD');
  });

  it('POSTS a foreign currency when a rate is supplied', async () => {
    const outcome = await allocationPostingService.postSource(
      context,
      'system',
      source({ currency: 'ZWL', amount: 4000, fxRate: 0.1 })
    );

    expect(outcome.status).toBe('posted');
    const input = mockPostAllocation.mock.calls[0][2];
    expect(input.currency).toBe('ZWL');
    expect(input.amount).toBe(4000);
    expect(input.fxRate).toBe(0.1);
  });

  it('treats an absent currency as the reporting currency', async () => {
    // The only safe default: it is what every pre-Phase-6 record
    // implicitly is, so assuming anything else would retroactively
    // misstate the entire history.
    const outcome = await allocationPostingService.postSource(context, 'system', source());

    expect(outcome.status).toBe('posted');
    expect(mockPostAllocation.mock.calls[0][2].currency).toBe('USD');
  });

  it('posts a same-currency transaction without needing a rate', async () => {
    const outcome = await allocationPostingService.postSource(
      context,
      'system',
      source({ currency: 'USD' })
    );
    expect(outcome.status).toBe('posted');
  });
});

describe('Phase 6: refusals are structured, not thrown', () => {
  it('refuses a zero amount as noise', async () => {
    // Moves no money and dilutes every posting count an operator reads.
    const outcome = await allocationPostingService.postSource(
      context,
      'system',
      source({ amount: 0 })
    );
    expect(outcome.status).toBe('refused');
  });

  it('refuses a non-finite amount', async () => {
    for (const amount of [NaN, Infinity]) {
      const outcome = await allocationPostingService.postSource(
        context,
        'system',
        source({ amount })
      );
      expect(outcome.status).toBe('refused');
    }
  });

  it('returns a refusal (not a throw) for a validation failure', async () => {
    // A validation failure is a property of THIS record and fails
    // identically on every retry. Throwing would send it round the
    // outbox retry loop to the dead-letter queue for a reason retrying
    // cannot fix.
    mockPostAllocation.mockRejectedValueOnce(
      new ValidationError('Vehicle is not in scope.')
    );

    const outcome = await allocationPostingService.postSource(context, 'system', source());
    expect(outcome.status).toBe('refused');
  });

  it('RETHROWS an infrastructure failure so the outbox retries it', async () => {
    // The distinction that matters: a Mongo outage must be retried, a
    // bad record must not.
    mockPostAllocation.mockRejectedValueOnce(new Error('mongo down'));

    await expect(
      allocationPostingService.postSource(context, 'system', source())
    ).rejects.toThrow('mongo down');
  });
});

describe('Phase 6: architecture guards', () => {
  const codeOf = (rel: string) =>
    fs
      .readFileSync(path.join(ROOT, rel), 'utf8')
      .replace(/\/\*[\s\S]*?\*\//g, '')
      .replace(/(^|[^:])\/\/.*$/gm, '$1');

  it('the ledger is still append-only', () => {
    // Phase 6 fills the ledger; it must not have weakened it.
    const code = codeOf('modules/finance/repositories/allocation-ledger.repository.ts');
    expect(code).toContain('async update()');
    expect(code).toContain('async softDelete()');
    expect(code).toContain('async hardDelete()');
  });

  it('the idempotency index is partial, not plain unique', () => {
    // Manual postings carry no key and are a deliberate human act that
    // may legitimately repeat. A plain unique index would collapse every
    // manual posting in a tenant into one.
    const {
      FINANCE_INDEXES,
    } = require('@/infrastructure/database/indexes.finance-addendum');

    const idx = FINANCE_INDEXES.tblallocationledger.find(
      (i: { name: string }) => i.name === 'uniq_allocationledger_tenant_idempotency'
    );

    expect(idx).toBeDefined();
    expect(idx.unique).toBe(true);
    expect(idx.partialFilterExpression).toEqual({ idempotencyKey: { $exists: true } });
  });

  it('the posting handler is registered on the bus', () => {
    const code = codeOf('server/events/bootstrap.ts');
    expect(code).toContain('allocationPostingHandler');
  });

  it('which events move money is an EXPLICIT map, not a convention', () => {
    // A naming convention would silently start posting the moment
    // somebody named a new event `SomethingCreated`.
    const code = codeOf('server/events/handlers/finance/AllocationPostingHandler.ts');
    expect(code).toContain('POSTING_EVENTS');
    expect(code).toContain('ExpenseCreated');
    expect(code).toContain('FuelLogCreated');
  });

  it('expenses carry a currency field', () => {
    const src = fs.readFileSync(path.join(ROOT, 'shared/types/expense.types.ts'), 'utf8');
    expect(src).toContain('currency?: string');
  });

  it('the FX helper still refuses to invent a rate', () => {
    // fx-conversion.utils.ts returns null rather than guessing 1. Phase
    // 6 depends on that and must not have relaxed it.
    const code = codeOf('modules/finance/utils/fx-conversion.utils.ts');
    expect(code).toContain('return null');
  });
});

// tests/security/fuel-ledger-reconciliation.spec.ts
//
// MODULE CONNECTIVITY UPGRADE (fuel/GL reconciliation gap):
// FuelQueryService.getLedgerReconciliation is the read that backs Fuel
// Detail's "Financial posting" card -- see FuelLedgerReconciliation's
// own doc comment in shared/types/fuel.types.ts for the full contract
// this pins:
//
//   - zero postings + zero-cost log -> 'not_posted', a fixed, honest
//     reason (never posted, by design -- not "something went wrong").
//   - zero postings + non-zero cost, no resolvable reporting currency
//     -> 'not_posted' with the ONE concrete, currently-checkable cause
//     this method can actually confirm (Round 3 re-verification fix:
//     see resolveNotPostedReason's own comment for why the other two
//     candidate causes stay a hedge rather than a guess).
//   - zero postings + non-zero cost + a resolvable reporting currency
//     -> the honest hedge (processing lag / historical FX availability
//     are genuinely not reconstructable from current state).
//   - postings exist, net amount matches current cost -> 'matched'.
//   - postings exist, net amount does NOT match -> 'stale', with the
//     variance signed as (current cost - net posted).
//   - volumeReconciliation is ALWAYS 'not_applicable' -- fuel always
//     posts direct, so there is structurally no ledger quantity to
//     compare against (see that field's own doc comment).
//
// Mirrors the mocking style of tests/security/allocation-auto-posting.spec.ts
// and tests/security/needs-attention-resolution.spec.ts -- mock the
// repositories/services at the boundary this service actually calls.

const mockLedger = { findBySource: jest.fn() };
const mockSettings = { resolve: jest.fn() };

jest.mock('@/modules/finance/repositories/allocation-ledger.repository', () => ({
  allocationLedgerRepository: mockLedger,
}));
jest.mock('@/modules/finance/services/finance-settings.service', () => ({
  financeSettingsService: mockSettings,
}));

import { FuelQueryService } from '@/modules/fuel/services/fuel-query.service';
import { ValidationError, NotFoundError } from '@/server/errors/app.errors';
import type { TenantContext } from '@/modules/tenancy/services/tenant-context.service';
import type { FuelLog } from '@/shared/types/fuel.types';

const context = {
  organizationId: 'tenant-a',
  organizationName: 'Tenant A',
  accessibleOrgUnitIds: null,
  assignedOrgUnitIds: [],
  isPlatformScope: false,
} as unknown as TenantContext;

function log(overrides: Partial<Pick<FuelLog, 'cost' | 'currency'>> = {}): Pick<FuelLog, 'cost' | 'currency'> {
  return { cost: 85.5, currency: 'USD', ...overrides };
}

function posting(overrides: Record<string, unknown> = {}) {
  return {
    _id: 'posting-1',
    amount: 85.5,
    currency: 'USD',
    postedAt: new Date('2026-08-20T09:00:00.000Z'),
    glAccountCode: null,
    ...overrides,
  };
}

let service: FuelQueryService;

beforeEach(() => {
  jest.clearAllMocks();
  service = new FuelQueryService();
  mockSettings.resolve.mockResolvedValue({ reportingCurrency: 'USD', costCategoryGlAccountCodes: {} });
});

describe('FuelQueryService.getLedgerReconciliation', () => {
  describe('not_posted -- zero-cost logs', () => {
    it('gives the fixed zero-cost reason, without even checking finance settings', async () => {
      mockLedger.findBySource.mockResolvedValue([]);

      const result = await service.getLedgerReconciliation('fuel-1', log({ cost: 0 }), context);

      expect(result.status).toBe('not_posted');
      expect(result.posting).toBeNull();
      expect(result.varianceFromCurrentCost).toBeNull();
      expect(result.notPostedReason).toBe('Zero-cost fuel logs are never posted to the ledger.');
      expect(result.volumeReconciliation).toBe('not_applicable');
      expect(mockSettings.resolve).not.toHaveBeenCalled();
    });
  });

  describe('not_posted -- non-zero cost, no resolvable reporting currency', () => {
    it('names the real, checkable cause instead of the three-way hedge', async () => {
      mockLedger.findBySource.mockResolvedValue([]);
      mockSettings.resolve.mockRejectedValue(
        new ValidationError('No reporting currency is configured for this organization.')
      );

      const result = await service.getLedgerReconciliation('fuel-1', log(), context);

      expect(result.status).toBe('not_posted');
      expect(result.notPostedReason).toContain('no reporting currency configured');
      // Must not fall through to the generic hedge once the specific
      // cause is confirmed -- the two messages are mutually exclusive.
      expect(result.notPostedReason).not.toContain('still processing');
    });

    it('resolves finance settings for THIS log\'s own organization, not a hardcoded tenant', async () => {
      mockLedger.findBySource.mockResolvedValue([]);
      mockSettings.resolve.mockRejectedValue(new ValidationError('no currency'));

      await service.getLedgerReconciliation('fuel-1', log(), {
        ...context,
        organizationId: 'a-different-tenant',
      } as TenantContext);

      expect(mockSettings.resolve).toHaveBeenCalledWith('a-different-tenant');
    });
  });

  describe('not_posted -- non-zero cost, reporting currency IS resolvable', () => {
    it('falls back to the honest hedge rather than asserting a cause it cannot confirm', async () => {
      mockLedger.findBySource.mockResolvedValue([]);
      mockSettings.resolve.mockResolvedValue({ reportingCurrency: 'USD', costCategoryGlAccountCodes: {} });

      const result = await service.getLedgerReconciliation('fuel-1', log(), context);

      expect(result.status).toBe('not_posted');
      expect(result.notPostedReason).toContain('still processing');
      expect(result.notPostedReason).not.toContain('no reporting currency configured');
    });

    it('does not mistake an unrelated resolution failure for the specific no-currency cause', async () => {
      mockLedger.findBySource.mockResolvedValue([]);
      // A NotFoundError (organization record missing entirely) is a
      // different, deeper failure than "no reporting currency" -- this
      // method must not conflate the two just because both throw.
      mockSettings.resolve.mockRejectedValue(new NotFoundError('Organization not found.'));

      const result = await service.getLedgerReconciliation('fuel-1', log(), context);

      expect(result.notPostedReason).toContain('still processing');
      expect(result.notPostedReason).not.toContain('no reporting currency configured');
    });
  });

  describe('matched vs stale', () => {
    it('reports matched when the net posted amount agrees with the current cost', async () => {
      mockLedger.findBySource.mockResolvedValue([posting({ amount: 85.5 })]);

      const result = await service.getLedgerReconciliation('fuel-1', log({ cost: 85.5 }), context);

      expect(result.status).toBe('matched');
      expect(result.varianceFromCurrentCost).toBeNull();
      expect(result.notPostedReason).toBeNull();
      expect(result.posting).toMatchObject({ id: 'posting-1', amount: 85.5, currency: 'USD' });
    });

    it('absorbs floating-point summation noise across several postings rather than flagging a false variance', async () => {
      // 10.10 + 10.10 + 10.10 is 30.299999999999997 in IEEE-754 double
      // arithmetic -- a real artifact of summing several postings (e.g.
      // an original entry plus adjustments), not a genuine accounting
      // disagreement. roundCurrency on the net sum is what keeps this
      // from being reported as 'stale' over a cent nobody actually owes.
      mockLedger.findBySource.mockResolvedValue([
        posting({ amount: 10.1 }),
        posting({ amount: 10.1 }),
        posting({ amount: 10.1 }),
      ]);

      const result = await service.getLedgerReconciliation('fuel-1', log({ cost: 30.3 }), context);

      expect(result.status).toBe('matched');
      expect(result.posting?.amount).toBe(30.3);
    });

    it('reports stale with a signed variance when the log was edited after posting', async () => {
      mockLedger.findBySource.mockResolvedValue([posting({ amount: 85.5 })]);

      // The log's cost was corrected upward after the original posting.
      const result = await service.getLedgerReconciliation('fuel-1', log({ cost: 100 }), context);

      expect(result.status).toBe('stale');
      expect(result.varianceFromCurrentCost).toBe(14.5);
      expect(result.notPostedReason).toBeNull();
    });

    it('nets a reversal against its original rather than double-counting or hiding either', async () => {
      mockLedger.findBySource.mockResolvedValue([
        posting({ _id: 'posting-1', amount: 85.5 }),
        posting({ _id: 'posting-2', amount: -85.5, reversalOfPostingId: 'posting-1' }),
        posting({ _id: 'posting-3', amount: 90 }),
      ]);

      const result = await service.getLedgerReconciliation('fuel-1', log({ cost: 90 }), context);

      expect(result.status).toBe('matched');
      expect(result.posting?.amount).toBe(90);
    });

    it('surfaces the GL account code from the latest posting when one was stamped', async () => {
      mockLedger.findBySource.mockResolvedValue([posting({ amount: 85.5, glAccountCode: '5100-FUEL' })]);

      const result = await service.getLedgerReconciliation('fuel-1', log({ cost: 85.5 }), context);

      expect(result.posting?.glAccountCode).toBe('5100-FUEL');
    });
  });

  describe('volumeReconciliation', () => {
    it('is always not_applicable, posted or not -- fuel has no ledger quantity to compare against', async () => {
      mockLedger.findBySource.mockResolvedValue([]);
      const notPosted = await service.getLedgerReconciliation('fuel-1', log(), context);
      expect(notPosted.volumeReconciliation).toBe('not_applicable');

      mockLedger.findBySource.mockResolvedValue([posting()]);
      const posted = await service.getLedgerReconciliation('fuel-1', log(), context);
      expect(posted.volumeReconciliation).toBe('not_applicable');
    });
  });

  describe('scoping', () => {
    it('reads the ledger for this fuel log scoped to the caller context, keyed correctly', async () => {
      mockLedger.findBySource.mockResolvedValue([]);

      await service.getLedgerReconciliation('fuel-42', log(), context);

      expect(mockLedger.findBySource).toHaveBeenCalledWith('tblfuellogs', 'fuel-42', 'fuel', context);
    });
  });
});

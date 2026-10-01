// tests/security/attention-outcome-verification.spec.ts
//
// MODULE CONNECTIVITY UPGRADE -- "Attention/Actions ↔ Outcome
// Verification" (AttentionResolutionService.verifyOutcome). Mirrors
// the mocking style of tests/security/needs-attention-resolution.spec.ts,
// which covers the sibling `resolve()` method.
//
// Properties under test:
//   - 404s when the item was never persisted, or the caller cannot see
//     it under org-unit scoping (same fail-closed discipline as
//     resolve()).
//   - 409s (ConflictError) when the item is not yet resolved -- you
//     cannot verify the outcome of an action that was never taken.
//   - requires a non-empty `note` ONLY when outcome is 'reopened'; a
//     'verified_resolved' outcome needs no note.
//   - never flips `status` back to 'open' on a 'reopened' outcome (see
//     the repository method's own header for why).
//   - surfaces (but never mutates) a warning when a value-ledger entry
//     already exists for an item being reopened.

import { AttentionResolutionService } from '../../modules/attention/services/attention-resolution.service';
import { attentionItemRepository } from '../../modules/attention/repositories/attention-item.repository';
import { valueLedgerRepository } from '../../modules/attention/repositories/value-ledger.repository';
import { NotFoundError, ConflictError, ValidationError } from '../../server/errors/app.errors';
import type { TenantContext } from '../../modules/tenancy/services/tenant-context.service';
import type { AttentionItem } from '../../modules/attention/types/attention-item.types';
import type { VerifyAttentionOutcomeInput } from '../../shared/validations/attention.schema';
import '../../modules/attention/types/attention-outcome-addendum';

jest.mock('../../modules/attention/repositories/attention-item.repository', () => ({
  attentionItemRepository: {
    findByItemKey: jest.fn(),
    recordOutcomeVerification: jest.fn(),
  },
}));
jest.mock('../../modules/attention/repositories/value-ledger.repository', () => ({
  valueLedgerRepository: {
    findByAttentionItemKeyInScope: jest.fn(),
  },
}));

const mockedFindByItemKey = attentionItemRepository.findByItemKey as jest.Mock;
const mockedRecordOutcome = attentionItemRepository.recordOutcomeVerification as jest.Mock;
const mockedFindLedgerByItemKey = valueLedgerRepository.findByAttentionItemKeyInScope as jest.Mock;

const TENANT = 'willsgrove-farm-enterprises-9e80ed';
const HARARE_BRANCH = 'branch-harare';
const BULAWAYO_BRANCH = 'branch-bulawayo';

function makeContext(accessibleOrgUnitIds: string[] | null): TenantContext {
  return {
    organizationId: TENANT,
    organizationName: 'Willsgrove Farm Enterprises',
    accessibleOrgUnitIds,
    isPlatformScope: false,
  } as TenantContext;
}

function makeAttentionItem(overrides: Partial<AttentionItem> = {}): AttentionItem {
  return {
    _id: 'attention-item-1',
    tenantId: TENANT,
    orgUnitId: HARARE_BRANCH,
    itemKey: 'maintenance:reminder-1',
    source: 'maintenance',
    severity: 'high',
    urgency: 'overdue',
    title: 'Service overdue: ABC123',
    description: '5,000km service interval exceeded',
    cost: 0,
    priorityScore: 80,
    firstSeenAt: new Date('2026-07-30T08:00:00.000Z'),
    lastSeenAt: new Date('2026-08-01T08:00:00.000Z'),
    status: 'resolved',
    resolvedAt: new Date('2026-08-02T09:00:00.000Z'),
    resolvedBy: 'user-0',
    ...overrides,
  } as AttentionItem;
}

function makeInput(overrides: Partial<VerifyAttentionOutcomeInput> = {}): VerifyAttentionOutcomeInput {
  return {
    outcome: 'verified_resolved',
    ...overrides,
  };
}

let service: AttentionResolutionService;

beforeEach(() => {
  jest.clearAllMocks();
  mockedFindLedgerByItemKey.mockResolvedValue([]);
  service = new AttentionResolutionService();
});

describe('AttentionResolutionService.verifyOutcome', () => {
  describe('existence and ownership', () => {
    it('throws NotFoundError when the item was never persisted', async () => {
      mockedFindByItemKey.mockResolvedValue(null);

      await expect(
        service.verifyOutcome(TENANT, 'maintenance:reminder-1', 'user-1', makeContext(null), makeInput())
      ).rejects.toThrow(NotFoundError);

      expect(mockedRecordOutcome).not.toHaveBeenCalled();
    });

    it('throws NotFoundError when the caller is org-unit scoped and the item belongs to a different org unit', async () => {
      mockedFindByItemKey.mockResolvedValue(makeAttentionItem({ orgUnitId: BULAWAYO_BRANCH }));

      await expect(
        service.verifyOutcome(
          TENANT,
          'maintenance:reminder-1',
          'user-1',
          makeContext([HARARE_BRANCH]),
          makeInput()
        )
      ).rejects.toThrow(NotFoundError);

      expect(mockedRecordOutcome).not.toHaveBeenCalled();
    });
  });

  describe('resolution precondition', () => {
    it('throws ConflictError when the item is still open (never resolved)', async () => {
      mockedFindByItemKey.mockResolvedValue(makeAttentionItem({ status: 'open', resolvedAt: undefined, resolvedBy: undefined }));

      await expect(
        service.verifyOutcome(TENANT, 'maintenance:reminder-1', 'user-1', makeContext(null), makeInput())
      ).rejects.toThrow(ConflictError);

      expect(mockedRecordOutcome).not.toHaveBeenCalled();
    });
  });

  describe('conditional note requirement', () => {
    it('throws ValidationError for outcome "reopened" with no note', async () => {
      mockedFindByItemKey.mockResolvedValue(makeAttentionItem());

      await expect(
        service.verifyOutcome(
          TENANT,
          'maintenance:reminder-1',
          'user-1',
          makeContext(null),
          makeInput({ outcome: 'reopened', note: undefined })
        )
      ).rejects.toThrow(ValidationError);

      expect(mockedRecordOutcome).not.toHaveBeenCalled();
    });

    it('throws ValidationError for outcome "reopened" with a whitespace-only note', async () => {
      mockedFindByItemKey.mockResolvedValue(makeAttentionItem());

      await expect(
        service.verifyOutcome(
          TENANT,
          'maintenance:reminder-1',
          'user-1',
          makeContext(null),
          makeInput({ outcome: 'reopened', note: '   ' })
        )
      ).rejects.toThrow(ValidationError);
    });

    it('does NOT require a note for outcome "verified_resolved"', async () => {
      mockedFindByItemKey.mockResolvedValue(makeAttentionItem());
      mockedRecordOutcome.mockResolvedValue(
        makeAttentionItem({ outcomeStatus: 'verified_resolved', outcomeVerifiedBy: 'user-1' })
      );

      await expect(
        service.verifyOutcome(
          TENANT,
          'maintenance:reminder-1',
          'user-1',
          makeContext(null),
          makeInput({ outcome: 'verified_resolved', note: undefined })
        )
      ).resolves.toBeDefined();
    });
  });

  describe('status is never silently flipped back to open', () => {
    it('records a "reopened" outcome without asking the repository to change `status`', async () => {
      mockedFindByItemKey.mockResolvedValue(makeAttentionItem());
      mockedRecordOutcome.mockResolvedValue(
        makeAttentionItem({ outcomeStatus: 'reopened', outcomeNote: 'Still smoking on cold start.' })
      );

      await service.verifyOutcome(
        TENANT,
        'maintenance:reminder-1',
        'user-1',
        makeContext(null),
        makeInput({ outcome: 'reopened', note: 'Still smoking on cold start.' })
      );

      expect(mockedRecordOutcome).toHaveBeenCalledWith(TENANT, 'maintenance:reminder-1', {
        status: 'reopened',
        verifiedBy: 'user-1',
        note: 'Still smoking on cold start.',
      });
      // The repository mock controls what `status` ends up as; the
      // service itself must never ask for `status` to change -- the
      // call above asserts exactly which fields it requests.
    });
  });

  describe('value-ledger warning, never a mutation', () => {
    it('returns no warning when reopening an item with no ledger postings', async () => {
      mockedFindByItemKey.mockResolvedValue(makeAttentionItem({ source: 'maintenance' }));
      mockedRecordOutcome.mockResolvedValue(makeAttentionItem({ outcomeStatus: 'reopened' }));
      mockedFindLedgerByItemKey.mockResolvedValue([]);

      const result = await service.verifyOutcome(
        TENANT,
        'maintenance:reminder-1',
        'user-1',
        makeContext(null),
        makeInput({ outcome: 'reopened', note: 'Not actually fixed.' })
      );

      expect(result.ledgerEntryWarning).toBeNull();
    });

    it('warns, but does not touch the ledger, when reopening an item that already posted a value-ledger entry', async () => {
      mockedFindByItemKey.mockResolvedValue(makeAttentionItem({ source: 'fuel_fraud' }));
      mockedRecordOutcome.mockResolvedValue(makeAttentionItem({ source: 'fuel_fraud', outcomeStatus: 'reopened' }));
      mockedFindLedgerByItemKey.mockResolvedValue([{ _id: 'ledger-1' }]);

      const result = await service.verifyOutcome(
        TENANT,
        'maintenance:reminder-1',
        'user-1',
        makeContext(null),
        makeInput({ outcome: 'reopened', note: 'Fraud pattern recurred next month.' })
      );

      expect(result.ledgerEntryWarning).toMatch(/1 value-ledger entry/);
      expect(result.ledgerEntryWarning).toMatch(/does NOT reverse/);
    });

    it('never checks the ledger at all for a "verified_resolved" outcome', async () => {
      mockedFindByItemKey.mockResolvedValue(makeAttentionItem({ source: 'fuel_fraud' }));
      mockedRecordOutcome.mockResolvedValue(
        makeAttentionItem({ source: 'fuel_fraud', outcomeStatus: 'verified_resolved' })
      );

      const result = await service.verifyOutcome(
        TENANT,
        'maintenance:reminder-1',
        'user-1',
        makeContext(null),
        makeInput({ outcome: 'verified_resolved' })
      );

      expect(mockedFindLedgerByItemKey).not.toHaveBeenCalled();
      expect(result.ledgerEntryWarning).toBeNull();
    });
  });

  it('throws NotFoundError if recordOutcomeVerification races to null (item deleted concurrently)', async () => {
    mockedFindByItemKey.mockResolvedValue(makeAttentionItem());
    mockedRecordOutcome.mockResolvedValue(null);

    await expect(
      service.verifyOutcome(TENANT, 'maintenance:reminder-1', 'user-1', makeContext(null), makeInput())
    ).rejects.toThrow(NotFoundError);
  });
});

// tests/security/needs-attention-resolution.spec.ts
//
// Proves the property STEP 2 of the attention-queue backlog item exists
// for: AttentionResolutionService.resolve() --
//
//   - 404s when the item hasn't been persisted (or the caller can't see
//     it under org-unit scoping), rather than exposing existence to a
//     caller who shouldn't see the row (mirrors the pattern used
//     elsewhere in this codebase, e.g. anomalyController.updateStatus()).
//   - 409s on an item that's already resolved.
//   - requires baselineTier + evidenceRefs ONLY for the two ledger-
//     eligible sources (fuel_fraud, expense_anomaly) -- every other
//     source resolves with neither.
//   - writes exactly one value_ledger posting, with the right fields,
//     for an eligible source; writes none for an ineligible one.
//   - realisedAmount falls back to the item's modelled cost when the
//     resolver didn't supply one.
//
// Mirrors the mocking style of tests/security/expense-anomaly-scope.spec.ts
// -- mock the repositories at the boundary this service actually calls,
// rather than standing up a real Mongo connection.

import { AttentionResolutionService } from '../../modules/attention/services/attention-resolution.service';
import { attentionItemRepository } from '../../modules/attention/repositories/attention-item.repository';
import { valueLedgerRepository } from '../../modules/attention/repositories/value-ledger.repository';
import { NotFoundError, ConflictError, ValidationError } from '../../server/errors/app.errors';
import type { TenantContext } from '../../modules/tenancy/services/tenant-context.service';
import type { AttentionItem } from '../../modules/attention/types/attention-item.types';
import type { ResolveAttentionItemInput } from '../../shared/validations/attention.schema';

jest.mock('../../modules/attention/repositories/attention-item.repository', () => ({
  attentionItemRepository: {
    findByItemKey: jest.fn(),
    resolveByItemKey: jest.fn(),
  },
}));
jest.mock('../../modules/attention/repositories/value-ledger.repository', () => ({
  valueLedgerRepository: {
    append: jest.fn(),
  },
}));

const mockedFindByItemKey = attentionItemRepository.findByItemKey as jest.Mock;
const mockedResolveByItemKey = attentionItemRepository.resolveByItemKey as jest.Mock;
const mockedAppend = valueLedgerRepository.append as jest.Mock;

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
    itemKey: 'fuel_fraud:alert-1',
    source: 'fuel_fraud',
    severity: 'high',
    urgency: 'soon',
    title: 'Possible fuel fraud: HRE1234',
    description: 'Unusual cost deviation on last fill-up',
    cost: 250,
    priorityScore: 100,
    firstSeenAt: new Date('2026-07-30T08:00:00.000Z'),
    lastSeenAt: new Date('2026-08-01T08:00:00.000Z'),
    status: 'open',
    ...overrides,
  } as AttentionItem;
}

function makeInput(overrides: Partial<ResolveAttentionItemInput> = {}): ResolveAttentionItemInput {
  return {
    baselineTier: 'T2',
    evidenceRefs: ['receipt-9981'],
    ...overrides,
  };
}

let service: AttentionResolutionService;

beforeEach(() => {
  jest.clearAllMocks();
  service = new AttentionResolutionService();
});

describe('AttentionResolutionService.resolve', () => {
  describe('existence and ownership', () => {
    it('throws NotFoundError when the item was never persisted', async () => {
      mockedFindByItemKey.mockResolvedValue(null);

      await expect(
        service.resolve(TENANT, 'fuel_fraud:alert-1', 'user-1', makeContext(null), makeInput())
      ).rejects.toThrow(NotFoundError);

      expect(mockedResolveByItemKey).not.toHaveBeenCalled();
      expect(mockedAppend).not.toHaveBeenCalled();
    });

    it('throws NotFoundError when the caller is org-unit scoped and the item belongs to a different org unit', async () => {
      mockedFindByItemKey.mockResolvedValue(makeAttentionItem({ orgUnitId: BULAWAYO_BRANCH }));

      await expect(
        service.resolve(
          TENANT,
          'fuel_fraud:alert-1',
          'user-1',
          makeContext([HARARE_BRANCH]),
          makeInput()
        )
      ).rejects.toThrow(NotFoundError);

      expect(mockedResolveByItemKey).not.toHaveBeenCalled();
    });

    it('throws NotFoundError when the caller is org-unit scoped and the item has no resolvable orgUnitId (fail-closed)', async () => {
      mockedFindByItemKey.mockResolvedValue(makeAttentionItem({ orgUnitId: undefined }));

      await expect(
        service.resolve(
          TENANT,
          'fuel_fraud:alert-1',
          'user-1',
          makeContext([HARARE_BRANCH]),
          makeInput()
        )
      ).rejects.toThrow(NotFoundError);
    });

    it('allows resolution when the caller is org-unit scoped and the item is within their accessible units', async () => {
      mockedFindByItemKey.mockResolvedValue(makeAttentionItem({ orgUnitId: HARARE_BRANCH }));
      mockedResolveByItemKey.mockResolvedValue(
        makeAttentionItem({ orgUnitId: HARARE_BRANCH, status: 'resolved', resolvedBy: 'user-1' })
      );
      mockedAppend.mockResolvedValue({ _id: 'ledger-1' });

      await expect(
        service.resolve(
          TENANT,
          'fuel_fraud:alert-1',
          'user-1',
          makeContext([HARARE_BRANCH]),
          makeInput()
        )
      ).resolves.toBeDefined();
    });

    it('allows resolution regardless of orgUnitId when the caller has org-wide access (accessibleOrgUnitIds === null)', async () => {
      mockedFindByItemKey.mockResolvedValue(makeAttentionItem({ orgUnitId: undefined }));
      mockedResolveByItemKey.mockResolvedValue(
        makeAttentionItem({ orgUnitId: undefined, status: 'resolved', resolvedBy: 'user-1' })
      );
      mockedAppend.mockResolvedValue({ _id: 'ledger-1' });

      await expect(
        service.resolve(TENANT, 'fuel_fraud:alert-1', 'user-1', makeContext(null), makeInput())
      ).resolves.toBeDefined();
    });
  });

  describe('already-resolved conflict', () => {
    it('throws ConflictError (with the prior resolution details) when the item is already resolved', async () => {
      const resolvedAt = new Date('2026-07-31T09:00:00.000Z');
      mockedFindByItemKey.mockResolvedValue(
        makeAttentionItem({ status: 'resolved', resolvedAt, resolvedBy: 'user-0' })
      );

      let caught: unknown;
      try {
        await service.resolve(TENANT, 'fuel_fraud:alert-1', 'user-1', makeContext(null), makeInput());
      } catch (err) {
        caught = err;
      }

      expect(caught).toBeInstanceOf(ConflictError);
      expect((caught as ConflictError).details).toMatchObject({
        resolvedAt,
        resolvedBy: 'user-0',
      });
      expect(mockedResolveByItemKey).not.toHaveBeenCalled();
      expect(mockedAppend).not.toHaveBeenCalled();
    });
  });

  describe('conditional validation for ledger-eligible sources', () => {
    it.each(['fuel_fraud', 'expense_anomaly'] as const)(
      'throws ValidationError for a %s item when baselineTier is missing',
      async (source) => {
        mockedFindByItemKey.mockResolvedValue(makeAttentionItem({ source }));

        await expect(
          service.resolve(
            TENANT,
            'fuel_fraud:alert-1',
            'user-1',
            makeContext(null),
            makeInput({ baselineTier: undefined })
          )
        ).rejects.toThrow(ValidationError);

        expect(mockedResolveByItemKey).not.toHaveBeenCalled();
      }
    );

    it.each(['fuel_fraud', 'expense_anomaly'] as const)(
      'throws ValidationError for a %s item when evidenceRefs is missing',
      async (source) => {
        mockedFindByItemKey.mockResolvedValue(makeAttentionItem({ source }));

        await expect(
          service.resolve(
            TENANT,
            'fuel_fraud:alert-1',
            'user-1',
            makeContext(null),
            makeInput({ evidenceRefs: undefined })
          )
        ).rejects.toThrow(ValidationError);
      }
    );

    it('throws ValidationError for a ledger-eligible item when evidenceRefs is an empty array', async () => {
      mockedFindByItemKey.mockResolvedValue(makeAttentionItem({ source: 'fuel_fraud' }));

      await expect(
        service.resolve(
          TENANT,
          'fuel_fraud:alert-1',
          'user-1',
          makeContext(null),
          makeInput({ evidenceRefs: [] })
        )
      ).rejects.toThrow(ValidationError);
    });

    /**
     * PHASE 6: 'maintenance' was removed from this list because it is
     * now LEDGER-ELIGIBLE.
     *
     * A maintenance item can dispatch a work order (Phase 6's
     * attention-to-action loop), and a completed work order carries a
     * real, sourced cost -- which is a monetary outcome and belongs in
     * the ledger.
     *
     * The three that remain are still excluded for the reasons recorded
     * in value-ledger.types.ts: fleet_health has no single owning entity
     * or attributable amount; driver_risk cannot be honestly priced; and
     * compliance is a counterfactual (a fine avoided), not a
     * measurement. The rule underneath all three is the same one this
     * test protects -- never fabricate a zero.
     */
    it.each(['driver_risk', 'compliance', 'fleet_health'] as const)(
      'does NOT require baselineTier or evidenceRefs for a non-eligible source (%s)',
      async (source) => {
        mockedFindByItemKey.mockResolvedValue(makeAttentionItem({ source, itemKey: `${source}:x-1` }));
        mockedResolveByItemKey.mockResolvedValue(
          makeAttentionItem({ source, itemKey: `${source}:x-1`, status: 'resolved', resolvedBy: 'user-1' })
        );

        const result = await service.resolve(
          TENANT,
          `${source}:x-1`,
          'user-1',
          makeContext(null),
          { baselineTier: undefined, evidenceRefs: undefined }
        );

        expect(result.ledgerEntry).toBeNull();
        expect(mockedAppend).not.toHaveBeenCalled();
      }
    );
  });

  describe('conditional ledger posting', () => {
    it('marks the item resolved and does not write a ledger entry for a non-eligible source', async () => {
      mockedFindByItemKey.mockResolvedValue(makeAttentionItem({ source: 'driver_risk', itemKey: 'driver_risk:d-9' }));
      const resolvedItem = makeAttentionItem({
        source: 'driver_risk',
        itemKey: 'driver_risk:d-9',
        status: 'resolved',
        resolvedBy: 'user-1',
      });
      mockedResolveByItemKey.mockResolvedValue(resolvedItem);

      const result = await service.resolve(
        TENANT,
        'driver_risk:d-9',
        'user-1',
        makeContext(null),
        makeInput({ baselineTier: undefined, evidenceRefs: undefined })
      );

      expect(mockedResolveByItemKey).toHaveBeenCalledWith(TENANT, 'driver_risk:d-9', 'user-1');
      expect(result.item).toBe(resolvedItem);
      expect(result.ledgerEntry).toBeNull();
      expect(mockedAppend).not.toHaveBeenCalled();
    });

    it('writes exactly one value_ledger posting for a ledger-eligible source, with fields sourced from the item and the resolver input', async () => {
      const existing = makeAttentionItem({
        source: 'fuel_fraud',
        orgUnitId: HARARE_BRANCH,
        cost: 250,
      });
      mockedFindByItemKey.mockResolvedValue(existing);

      const resolvedAt = new Date('2026-08-02T12:00:00.000Z');
      const resolvedItem = makeAttentionItem({
        source: 'fuel_fraud',
        orgUnitId: HARARE_BRANCH,
        status: 'resolved',
        resolvedAt,
        resolvedBy: 'user-1',
      });
      mockedResolveByItemKey.mockResolvedValue(resolvedItem);
      mockedAppend.mockResolvedValue({ _id: 'ledger-1' });

      const input = makeInput({
        baselineTier: 'T1',
        evidenceRefs: ['receipt-9981', 'ticket-42'],
        realisedAmount: 300,
        notes: 'Confirmed via fuel receipt.',
      });

      const result = await service.resolve(TENANT, 'fuel_fraud:alert-1', 'user-1', makeContext(null), input);

      expect(mockedAppend).toHaveBeenCalledTimes(1);
      expect(mockedAppend).toHaveBeenCalledWith(
        {
          orgUnitId: HARARE_BRANCH,
          attentionItemKey: 'fuel_fraud:alert-1',
          source: 'fuel_fraud',
          baselineTier: 'T1',
          modelledAmount: 250,
          realisedAmount: 300,
          evidenceRefs: ['receipt-9981', 'ticket-42'],
          notes: 'Confirmed via fuel receipt.',
          resolvedBy: 'user-1',
          resolvedAt,
        },
        TENANT,
        'user-1'
      );
      expect(result.ledgerEntry).toEqual({ _id: 'ledger-1' });
    });

    it('falls back realisedAmount to the item modelled cost when the resolver did not supply one', async () => {
      const existing = makeAttentionItem({ source: 'expense_anomaly', cost: 80 });
      mockedFindByItemKey.mockResolvedValue(existing);
      mockedResolveByItemKey.mockResolvedValue(
        makeAttentionItem({ source: 'expense_anomaly', status: 'resolved', resolvedAt: new Date() })
      );
      mockedAppend.mockResolvedValue({ _id: 'ledger-2' });

      await service.resolve(
        TENANT,
        'fuel_fraud:alert-1',
        'user-1',
        makeContext(null),
        makeInput({ realisedAmount: undefined })
      );

      expect(mockedAppend).toHaveBeenCalledWith(
        expect.objectContaining({ modelledAmount: 80, realisedAmount: 80 }),
        TENANT,
        'user-1'
      );
    });

    it('throws NotFoundError if resolveByItemKey races to null (item deleted between the existence check and the write)', async () => {
      mockedFindByItemKey.mockResolvedValue(makeAttentionItem());
      mockedResolveByItemKey.mockResolvedValue(null);

      await expect(
        service.resolve(TENANT, 'fuel_fraud:alert-1', 'user-1', makeContext(null), makeInput())
      ).rejects.toThrow(NotFoundError);

      expect(mockedAppend).not.toHaveBeenCalled();
    });
  });
});

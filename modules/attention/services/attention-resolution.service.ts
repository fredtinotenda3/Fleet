// modules/attention/services/attention-resolution.service.ts
//
// Business logic behind POST /api/ai/needs-attention/:id/resolve.
// Kept out of the controller (which stays request-parsing-only, per
// this codebase's convention -- see anomaly.controller.ts) and out of
// needsAttentionService (which owns computing/persisting the live feed,
// not mutating a single persisted row).

import { AttentionItem } from '../types/attention-item.types';
import { ValueLedgerEntry, LedgerEligibleSource } from '../types/value-ledger.types';
import { attentionItemRepository } from '../repositories/attention-item.repository';
import { valueLedgerRepository } from '../repositories/value-ledger.repository';
import { TenantContext } from '@/modules/tenancy/services/tenant-context.service';
import { ResolveAttentionItemInput } from '@/shared/validations/attention.schema';
import { NotFoundError, ConflictError, ValidationError } from '@/server/errors/app.errors';

/**
 * PHASE 6: widened to include the maintenance sources, because an
 * action dispatched from one of those items completes with a REAL,
 * sourced cost -- see value-ledger.types.ts for why fleet_health,
 * driver_risk and compliance remain excluded.
 *
 * The guard below is unchanged and still load-bearing: an ineligible
 * source resolves the item and writes NO ledger entry, rather than
 * writing one with a fabricated zero.
 */
const LEDGER_ELIGIBLE_SOURCES: ReadonlySet<string> = new Set<LedgerEligibleSource>([
  'fuel_fraud',
  'expense_anomaly',
  'maintenance',
  'predictive_maintenance',
]);

function isLedgerEligible(source: string): source is LedgerEligibleSource {
  return LEDGER_ELIGIBLE_SOURCES.has(source);
}

export interface ResolveResult {
  item: AttentionItem;
  ledgerEntry: ValueLedgerEntry | null;
}

export class AttentionResolutionService {
  /**
   * Resolves one persisted attention item and, for fuel-fraud/
   * expense-anomaly items, writes the accompanying value_ledger
   * posting in the same call.
   *
   * Deliberately two separate writes (resolveByItemKey, then
   * valueLedgerRepository.append) rather than one transaction --
   * this codebase's repositories aren't wired for multi-document
   * transactions elsewhere, and the ledger's own unique index on
   * {tenantId, attentionItemKey} means a failure between the two
   * writes is recoverable: re-calling resolve on an item stuck in
   * 'resolved' with no ledger entry would hit "already resolved"
   * below, which is a gap worth flagging rather than silently
   * accepting -- see the KNOWN GAP note in the returned changelog.
   */
  async resolve(
    tenantId: string,
    itemKey: string,
    resolvedBy: string,
    context: TenantContext,
    input: ResolveAttentionItemInput
  ): Promise<ResolveResult> {
    const existing = await attentionItemRepository.findByItemKey(tenantId, itemKey);
    if (!existing) {
      throw new NotFoundError(
        'Attention item not found. It may not have been persisted yet -- ' +
          'GET /api/ai/needs-attention at least once to refresh the feed, then retry.'
      );
    }

    // Same org-unit ownership check anomalyController.updateStatus()
    // applies before a mutation: a null accessibleOrgUnitIds means an
    // organization-wide role, otherwise the item's orgUnitId must be
    // in the caller's accessible set. NOTE: because Step 1's orgUnitId
    // resolution is coarse (see the 'attention' entry in
    // module-scope.registry.ts), a scope-narrowed caller may see a
    // 404 here for an item that legitimately appeared in their own
    // feed but was persisted without a resolvable orgUnitId. That is
    // the same known gap flagged in Step 1, not a new one.
    if (
      context.accessibleOrgUnitIds !== null &&
      (!existing.orgUnitId || !context.accessibleOrgUnitIds.includes(existing.orgUnitId))
    ) {
      throw new NotFoundError('Attention item not found.');
    }

    if (existing.status === 'resolved') {
      throw new ConflictError('This attention item has already been resolved.', {
        resolvedAt: existing.resolvedAt,
        resolvedBy: existing.resolvedBy,
      });
    }

    const eligible = isLedgerEligible(existing.source);

    if (eligible && !input.baselineTier) {
      throw new ValidationError(
        `baselineTier is required to resolve a ${existing.source} item (it produces a value_ledger posting).`
      );
    }
    if (eligible && (!input.evidenceRefs || input.evidenceRefs.length === 0)) {
      throw new ValidationError(
        `evidenceRefs is required to resolve a ${existing.source} item (it produces a value_ledger posting).`
      );
    }

    const resolved = await attentionItemRepository.resolveByItemKey(tenantId, itemKey, resolvedBy);
    if (!resolved) {
      // Item existed a moment ago (findByItemKey above) but is gone
      // now -- a concurrent delete, not something the caller can fix
      // by retrying with different input.
      throw new NotFoundError('Attention item not found.');
    }

    if (!eligible) {
      return { item: resolved, ledgerEntry: null };
    }

    const resolvedAt = resolved.resolvedAt ?? new Date();
    const ledgerEntry = await valueLedgerRepository.append(
      {
        orgUnitId: existing.orgUnitId,
        attentionItemKey: itemKey,
        source: existing.source as LedgerEligibleSource,
        baselineTier: input.baselineTier!,
        modelledAmount: existing.cost,
        realisedAmount: input.realisedAmount ?? existing.cost,
        evidenceRefs: input.evidenceRefs!,
        notes: input.notes,
        resolvedBy,
        resolvedAt,
      },
      tenantId,
      resolvedBy
    );

    return { item: resolved, ledgerEntry };
  }
}

export const attentionResolutionService = new AttentionResolutionService();
// modules/attention/types/value-ledger.types.ts
//
// A value_ledger posting is the durable, append-only record of what
// resolving a fuel-fraud or expense-anomaly attention item was actually
// worth -- the gap between what the AI model predicted (modelledAmount)
// and what a human confirmed actually happened (realisedAmount), tagged
// with how confident the underlying baseline was (baselineTier).
//
// WHY THESE TWO SOURCES ONLY
// predictive_maintenance/fleet_health/driver_risk/compliance/maintenance
// items don't have a well-defined monetary "amount avoided" the way a
// fraud alert or an expense anomaly does -- resolving a maintenance
// reminder means the work got scheduled, not that a dollar figure was
// confirmed. Step 2 only writes a posting for the two sources the spec
// names; see attention-resolution.service.ts for where that's enforced.
//
// APPEND-ONLY
// This collection has no update or delete path. See
// value-ledger.repository.ts, which overrides BaseRepository's
// update/softDelete/hardDelete to throw rather than silently permit a
// write that would undermine the "immutable" guarantee.

import type { OrgUnitScopedEntity } from '@/server/repositories/tenant-scoped.repository';

/**
 * How well-evidenced the baseline (the "this is what would have
 * happened without intervention" estimate) is, as judged by the human
 * resolving the item:
 *   T1 -- verified against a hard source (meter reading, receipt, an
 *         independently corroborated record).
 *   T2 -- inferred from correlated internal data (comparable vehicles/
 *         trips/periods) but not independently verified.
 *   T3 -- model estimate only, no corroborating evidence beyond the
 *         anomaly detector's own output.
 */
export type BaselineTier = 'T1' | 'T2' | 'T3';

/** The two NeedsAttentionSource values that produce a ledger posting on resolve. */
/**
 * Sources whose resolution can produce a monetary value-ledger entry.
 *
 * PHASE 6 -- widened from {fuel_fraud, expense_anomaly} to include the
 * two maintenance sources, and ONLY those.
 *
 * The original restriction was correct and its reasoning still holds:
 * an entry needs a defensible monetary amount, and most attention
 * sources do not have one. What changed is that Phase 6 lets an item
 * dispatch an operational ACTION -- a work order, a scheduled
 * maintenance task -- and a completed work order carries a real, sourced
 * cost. That is a monetary outcome, so it belongs in the ledger.
 *
 * STILL DELIBERATELY EXCLUDED:
 *
 *   fleet_health   Multi-vehicle recommendations with no single owning
 *                  entity and no attributable amount. The Phase 0
 *                  ownership resolver returns null for these for the
 *                  same reason.
 *   driver_risk    A risk score about a person. There is no honest way
 *                  to price "this driver became less risky", and
 *                  inventing one would put a fabricated number into the
 *                  one collection whose credibility depends on every
 *                  figure being confirmed by a human.
 *   compliance     Avoiding a fine is a counterfactual, not a
 *                  measurement. The ledger records what happened, not
 *                  what was averted.
 *
 * The rule that governs all of it: NEVER FABRICATE A ZERO. A source
 * with no determinable amount produces no entry at all, rather than an
 * entry claiming savings of nothing -- which would be indistinguishable
 * from a genuine break-even in every aggregate downstream.
 */
export type LedgerEligibleSource =
  | 'fuel_fraud'
  | 'expense_anomaly'
  | 'maintenance'
  | 'predictive_maintenance';

export interface ValueLedgerEntry extends OrgUnitScopedEntity {
  /** Declared explicitly for the module-scope conformance suite; see attention-item.types.ts for the same note. */
  orgUnitId?: string;
  /** The attention_items.itemKey this posting evidences. Not unique alone -- see the repository for the uniqueness key. */
  attentionItemKey: string;
  source: LedgerEligibleSource;
  baselineTier: BaselineTier;
  /** What the AI service estimated (AttentionItem.cost at the time of resolution). */
  modelledAmount: number;
  /** What the resolver confirmed actually happened. Defaults to modelledAmount when not supplied -- see the resolve schema. */
  realisedAmount: number;
  /** Free-form references to whatever the resolver checked -- receipt ids, ticket numbers, entity ids, document refs. Never empty. */
  evidenceRefs: string[];
  /** Free-text context from the resolver, optional. */
  notes?: string;
  resolvedBy: string;
  resolvedAt: Date;
}
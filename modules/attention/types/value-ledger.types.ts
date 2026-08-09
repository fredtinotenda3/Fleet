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
export type LedgerEligibleSource = 'fuel_fraud' | 'expense_anomaly';

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
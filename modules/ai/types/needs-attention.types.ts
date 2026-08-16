// modules/ai/types/needs-attention.types.ts
//
// Types backing the unified "Needs Attention" feed -- a single,
// priority-ranked list combining all five AI services plus compliance
// and maintenance. See needs-attention.service.ts for the aggregation
// and scoring logic.

import type { AISeverity } from './ai.types';
import type { AttentionOwnerTarget } from '@/modules/attention/services/attention-ownership.resolver';
// NOTE: this is the ai module (a source of intelligence) depending on
// the attention module (its persistence layer) for a TYPE ONLY. That
// is backwards from the usual "AI produces, attention persists"
// direction, so this import must remain `import type` -- it is erased
// at compile time and creates no runtime dependency or module-init
// ordering issue between the two modules.

/**
 * Every upstream feed the aggregator reads from. Kept in sync with
 * SOURCE_ICON in frontend/shared/dashboards/widgets/NeedsAttentionWidget.tsx
 * -- add a case there whenever a new source is added here.
 */
export type NeedsAttentionSource =
  | 'predictive_maintenance'
  | 'fleet_health'
  | 'driver_risk'
  | 'fuel_fraud'
  | 'expense_anomaly'
  | 'compliance'
  | 'maintenance';

/** How soon the item needs action, independent of its severity. */
export type NeedsAttentionUrgency = 'overdue' | 'immediate' | 'soon' | 'planned' | 'monitor';

export interface NeedsAttentionItem {
  /** Stable, source-prefixed id (e.g. `maintenance:reminder-1`) so items never collide across sources. */
  id: string;
  source: NeedsAttentionSource;
  severity: AISeverity;
  urgency: NeedsAttentionUrgency;
  title: string;
  description: string;
  /** Estimated cost of the underlying issue, when known. Drives part of the priority score. */
  cost: number;
  /** Higher ranks first. See needs-attention.service.ts for the formula. */
  priorityScore: number;
  dueDate?: Date;
  /** License plate / vehicle or driver identifier the item is about, when applicable. */
  entityId?: string;
  entityLabel?: string;
  /** Deep link into the module that owns this item, if the frontend has one. */
  href?: string;
  /**
   * PHASE 0: what entity (if any) this item is "about", for
   * AttentionOwnershipResolver to resolve into the item's TRUE owning
   * orgUnitId at persist time -- see attention-ownership.resolver.ts.
   * Not part of this item's identity or display; never sent to the
   * frontend, only consumed by needsAttentionService.persistFeed().
   * Omitted (undefined) is treated exactly like `{ kind: 'none' }`.
   */
  ownerTarget?: AttentionOwnerTarget;
}

export interface NeedsAttentionFeed {
  items: NeedsAttentionItem[];
  /** Count of matching items BEFORE the `limit` truncation is applied. */
  total: number;
  bySource: Record<NeedsAttentionSource, number>;
  bySeverity: Record<AISeverity, number>;
  /**
   * Sources that threw while building this feed. Their contribution is
   * omitted (counted as 0 everywhere) rather than failing the whole
   * feed -- see needs-attention.service.ts's failure-isolation note.
   */
  unavailableSources: NeedsAttentionSource[];
  generatedAt: Date;
}

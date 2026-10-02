// frontend/modules/attention/types/index.ts
//
// Frontend-only types for Step 4 (Command Centre UI). Re-exports the
// backend response shapes it consumes as-is (NeedsAttentionFeed already
// lives in frontend/modules/dashboard/types; LedgerExportData is new to
// the frontend here) plus the couple of local view-state types the page
// needs for client-side filtering.

import type { NeedsAttentionSource } from '@/modules/ai/types/needs-attention.types';
import type { AISeverity } from '@/modules/ai/types/ai.types';
import type { LedgerExportData, LedgerSummaryData } from '@/modules/attention/types/ledger-export.types';
import type { AttentionItem } from '@/modules/attention/types/attention-item.types';
// Module augmentation for outcomeStatus/outcomeVerifiedAt/outcomeVerifiedBy/
// outcomeNote on AttentionItem -- side-effect import only, same convention
// the backend service files that touch these fields already use.
import '@/modules/attention/types/attention-outcome-addendum';
export type { AttentionOutcomeStatus } from '@/modules/attention/types/attention-outcome-addendum';

export type { NeedsAttentionFeed, NeedsAttentionItem } from '@/frontend/modules/dashboard/types';
export type { LedgerExportData, LedgerSummaryData };
export type { AttentionItem };

/**
 * MODULE CONNECTIVITY UPGRADE -- "Attention/Actions ↔ Outcome
 * Verification". Response shape of GET /api/ai/needs-attention/resolved
 * (aiController.getResolvedAttentionItems). Deliberately the persisted
 * AttentionItem shape, not NeedsAttentionItem -- a resolved item is a
 * durable row with resolvedAt/resolvedBy/outcomeStatus fields the live
 * feed's recomputed-on-every-call items never carry, so reusing
 * NeedsAttentionItem here would either drop those fields or require
 * widening a type that fifteen other call sites already depend on
 * staying exactly what the live feed returns.
 */
export interface ResolvedAttentionFeed {
  items: AttentionItem[];
  total: number;
}

/**
 * What the SavingsStrip actually reads off either the full export
 * (Permission.ANALYTICS_EXPORT, GET /api/attention/ledger/export) or the
 * lighter summary (Permission.FINANCE_VIEW, GET /api/attention/ledger/
 * summary) -- both LedgerExportData and LedgerSummaryData satisfy this
 * structurally, so the strip doesn't need to know which one it got.
 */
export type SavingsStripData = Pick<LedgerExportData, 'summary' | 'truncated'>;

/** Client-side severity filter for the full-screen queue. 'all' = no filter. */
export type SeverityFilterValue = AISeverity | 'all';

/** Client-side source filter for the full-screen queue. 'all' = no filter. */
export type SourceFilterValue = NeedsAttentionSource | 'all';

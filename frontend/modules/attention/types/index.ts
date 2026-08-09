// frontend/modules/attention/types/index.ts
//
// Frontend-only types for Step 4 (Command Centre UI). Re-exports the
// backend response shapes it consumes as-is (NeedsAttentionFeed already
// lives in frontend/modules/dashboard/types; LedgerExportData is new to
// the frontend here) plus the couple of local view-state types the page
// needs for client-side filtering.

import type { NeedsAttentionSource } from '@/modules/ai/types/needs-attention.types';
import type { AISeverity } from '@/modules/ai/types/ai.types';
import type { LedgerExportData } from '@/modules/attention/types/ledger-export.types';

export type { NeedsAttentionFeed, NeedsAttentionItem } from '@/frontend/modules/dashboard/types';
export type { LedgerExportData };

/** Client-side severity filter for the full-screen queue. 'all' = no filter. */
export type SeverityFilterValue = AISeverity | 'all';

/** Client-side source filter for the full-screen queue. 'all' = no filter. */
export type SourceFilterValue = NeedsAttentionSource | 'all';

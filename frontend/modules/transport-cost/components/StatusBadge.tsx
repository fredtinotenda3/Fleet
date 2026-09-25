// frontend/modules/transport-cost/components/StatusBadge.tsx
//
// OLIVINE LIVE OPERATING MODEL, SLICE 5. One badge per lifecycle state
// from OperationalStatus -- see OLIVINE_LIVE_OPERATING_MODEL_GAP_
// ANALYSIS.md Section 8.1 for the state table this renders. The
// five-state union is exhaustively switched (no `default` fallthrough)
// so a future sixth state fails to compile here rather than silently
// rendering as a generic badge.

'use client';

import { Badge } from '@/frontend/shared/ui/data-display/badge';
import type { OperationalStatus } from '../types';

const LABELS: Record<OperationalStatus, string> = {
  'needs-review': 'Needs review',
  'ready-to-post': 'Ready to post',
  posted: 'Posted',
  reversed: 'Reversed',
  cancelled: 'Cancelled',
};

const TITLES: Record<OperationalStatus, string> = {
  'needs-review': 'A transporter or vehicle identity on this record is still awaiting a human decision in the review queue.',
  'ready-to-post': 'Every identity this record needs is resolved; it has not been posted to the finance ledger yet.',
  posted: 'This record has a live posting in the finance ledger.',
  reversed: 'This record was posted and later cancelled/reversed -- its ledger entry was reversed and nothing was reposted.',
  cancelled: 'This record was cancelled before it was ever posted -- it has no ledger history at all.',
};

export function StatusBadge({ status }: { status: OperationalStatus }) {
  switch (status) {
    case 'needs-review':
      return (
        <Badge variant="outline" className="border-amber-500 text-amber-700 dark:text-amber-400" title={TITLES[status]}>
          {LABELS[status]}
        </Badge>
      );
    case 'ready-to-post':
      return (
        <Badge variant="secondary" title={TITLES[status]}>
          {LABELS[status]}
        </Badge>
      );
    case 'posted':
      return (
        <Badge variant="outline" className="border-emerald-600 text-emerald-700 dark:text-emerald-400" title={TITLES[status]}>
          {LABELS[status]}
        </Badge>
      );
    case 'reversed':
      return (
        <Badge variant="outline" className="border-orange-500 text-orange-700 dark:text-orange-400" title={TITLES[status]}>
          {LABELS[status]}
        </Badge>
      );
    case 'cancelled':
      return (
        <Badge variant="outline" className="border-dashed text-muted-foreground" title={TITLES[status]}>
          {LABELS[status]}
        </Badge>
      );
  }
}

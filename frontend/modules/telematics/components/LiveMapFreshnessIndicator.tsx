// frontend/modules/telematics/components/LiveMapFreshnessIndicator.tsx
//
// Surfaces `dataStale` / `refreshRequested` from GET /api/telematics/live-map
// (see LiveMapPayload in modules/telematics/types/live-map.types.ts).
//
// Deliberately a small badge, not a blocking overlay: per that type's doc
// comment, stale data is still real data and the read path no longer
// blocks the response to make it fresh, so the UI shouldn't block either.
//
// Three states, matching the three things the payload can say:
//   - stale + refresh queued     -> "may be delayed" badge, spinning icon
//   - stale + refresh NOT queued -> "may be delayed" badge, no spinner
//     (queue was unreachable -- nothing is coming, so no spinner lies
//     about that)
//   - fresh                      -> nothing rendered, same as the
//     Eagle Track / demo-mode badges elsewhere on this toolbar row, which
//     only appear when there's something to say.

'use client';

import { RefreshCw, WifiOff } from 'lucide-react';
import { Badge } from '@/frontend/shared/ui/data-display/badge';

interface LiveMapFreshnessIndicatorProps {
  /** True when the stored data is older than the staleness threshold. */
  dataStale?: boolean;
  /** True when a background refresh was successfully queued for the stale data. */
  refreshRequested?: boolean;
}

export function LiveMapFreshnessIndicator({ dataStale, refreshRequested }: LiveMapFreshnessIndicatorProps) {
  if (!dataStale) {
    return null;
  }

  return (
    <Badge
      variant="outline"
      // Warning tokens instead of six hand-written amber shades: --warning-bg
      // and --warning-border are already redefined under .dark, so the stale-data
      // badge now themes itself and matches every other warning in the product.
      className="gap-1 border-warning-border bg-warning-bg text-warning"
      title={
        refreshRequested
          ? 'Showing the last data we have while a refresh is in progress.'
          : 'Showing the last data we have. A refresh could not be queued.'
      }
    >
      <WifiOff className="h-3 w-3" aria-hidden="true" />
      Live data may be delayed
      {refreshRequested && <RefreshCw className="h-3 w-3 animate-spin" aria-hidden="true" />}
    </Badge>
  );
}

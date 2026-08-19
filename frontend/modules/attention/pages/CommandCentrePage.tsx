// frontend/modules/attention/pages/CommandCentrePage.tsx
//
// Step 4 -- Command Centre UI. Full-screen, priority-ranked attention
// queue (GET /api/ai/needs-attention) with a month-to-date
// realised-vs-modelled savings strip pinned to the bottom (GET
// /api/attention/ledger/summary for FINANCE_VIEW callers, or the full
// GET /api/attention/ledger/export?format=json for ANALYTICS_EXPORT
// callers without FINANCE_VIEW -- see useSavingsStripAccess). Both
// endpoints already scope their results to the caller's tenant/org-unit
// server-side (resolveTenantContext / TenantContextService) -- a
// branch-scoped user simply never receives another branch's items or
// postings, so this page does no scoping of its own, the same way
// NeedsAttentionWidget and every other dashboard widget don't.

'use client';

import { useMemo, useState } from 'react';
import { AlertOctagon, RefreshCw } from 'lucide-react';
import { PageHeader } from '@/frontend/shared/layouts/PageHeader';
import { LoadingState } from '@/shared/ui/feedback/LoadingState';
import { Badge } from '@/frontend/shared/ui/data-display/badge';
import { Button } from '@/frontend/shared/ui/primitives/button';
import { cn } from '@/lib/utils';
import { useAttentionQueue, useMonthToDateSavings, useMonthToDateAllocationTotal, useSavingsStripAccess } from '../hooks/useAttentionQueue';
import { SeverityFilterBar } from '../components/SeverityFilterBar';
import { AttentionQueueList } from '../components/AttentionQueueList';
import { SavingsStrip } from '../components/SavingsStrip';
import type { SeverityFilterValue, SourceFilterValue } from '../types';

interface CommandCentrePageProps {
  /** Compact mode drops the page-level breadcrumb/heading -- used when embedded as the Dashboard's primary tab, which already has its own page chrome. */
  embedded?: boolean;
}

export function CommandCentrePage({ embedded = false }: CommandCentrePageProps) {
  const [severity, setSeverity] = useState<SeverityFilterValue>('all');
  const [source, setSource] = useState<SourceFilterValue>('all');

  const { mode: savingsStripMode } = useSavingsStripAccess();
  const { data: feed, isLoading, isError, refetch } = useAttentionQueue(200);
  const { data: savings, isLoading: isSavingsLoading, isError: isSavingsError, refetch: refetchSavings } =
    useMonthToDateSavings();
  const {
    data: allocationReport,
    isLoading: isAllocationLoading,
    isError: isAllocationError,
  } = useMonthToDateAllocationTotal();

  const filteredItems = useMemo(() => {
    const items = feed?.items ?? [];
    return items.filter((item) => {
      if (severity !== 'all' && item.severity !== severity) return false;
      if (source !== 'all' && item.source !== source) return false;
      return true;
    });
  }, [feed, severity, source]);

  const criticalCount = feed?.bySeverity?.critical ?? 0;

  const header = (
    <PageHeader
      title="Command Centre"
      description="Every AI insight, compliance flag, and maintenance reminder that needs a decision, ranked in one queue."
      breadcrumbs={embedded ? undefined : [{ label: 'Command Centre' }]}
      actions={
        <div className="flex items-center gap-2">
          {criticalCount > 0 && (
            <Badge variant="destructive" className="shrink-0">
              {criticalCount} critical
            </Badge>
          )}
          <Button variant="outline" size="sm" onClick={() => refetch()} disabled={isLoading}>
            <RefreshCw className={cn('h-3.5 w-3.5', isLoading && 'animate-spin')} aria-hidden="true" />
            Refresh
          </Button>
        </div>
      }
    />
  );

  return (
    <div className="flex flex-col gap-6">
      {header}

      {isLoading ? (
        <LoadingState type="table" count={8} />
      ) : isError ? (
        <div className="flex flex-col items-center justify-center gap-2 py-12 text-center">
          <AlertOctagon className="w-6 h-6 text-danger" aria-hidden="true" />
          <p className="text-body-sm text-muted-foreground">Couldn&apos;t load the needs-attention feed right now.</p>
        </div>
      ) : (
        <>
          <SeverityFilterBar
            severity={severity}
            onSeverityChange={setSeverity}
            source={source}
            onSourceChange={setSource}
            feed={feed}
          />
          <AttentionQueueList items={filteredItems} />
        </>
      )}

      {savingsStripMode !== 'none' && (
        <SavingsStrip
          data={savings}
          isLoading={isSavingsLoading}
          isError={isSavingsError}
          onRefresh={() => refetchSavings()}
          allocationReport={allocationReport}
          isAllocationLoading={isAllocationLoading}
          isAllocationError={isAllocationError}
        />
      )}
    </div>
  );
}

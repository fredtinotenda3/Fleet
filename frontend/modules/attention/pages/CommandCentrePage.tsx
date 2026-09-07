// frontend/modules/attention/pages/CommandCentrePage.tsx
//
// The Command Centre: every AI insight, compliance flag and maintenance
// reminder that needs a decision, ranked in one queue, WITH the actions to
// deal with it.
//
// Scoping note (unchanged): GET /api/ai/needs-attention and both ledger
// endpoints scope to the caller's tenant and org unit server-side
// (resolveTenantContext / TenantContextService). A branch-scoped user never
// receives another branch's items, so this page does no scoping of its own —
// the same way every dashboard widget doesn't.
//
// UI/UX OVERHAUL — what changed here and why:
//   * Resolve and Dispatch are wired. Both endpoints shipped permission-gated
//     and tested, and nothing in the frontend called either, so the platform
//     could show you a problem but offered no way to act on it or any record
//     that anyone had. See hooks/useAttentionActions.ts.
//   * The error branch has a Retry. It previously had none, so a failed feed
//     left the operator with a dead screen and a Refresh button in the header
//     they had no reason to associate with the failure.
//   * Empty-because-healthy and empty-because-filtered are now different
//     messages. They were the same one.
//   * A severity summary sits above the queue, so "how bad is it right now"
//     is answerable without reading the list.

'use client';

import { useCallback, useMemo, useState } from 'react';
import { AlertOctagon, CircleDot, RefreshCw, ShieldAlert, TriangleAlert } from 'lucide-react';
import { PageHeader, PageHeaderMeta } from '@/frontend/shared/layouts/PageHeader';
import { LoadingState } from '@/shared/ui/feedback/LoadingState';
import { Button } from '@/frontend/shared/ui/primitives/button';
import { ErrorState, MetricCard, MetricCardGrid, describeQueryError } from '@/frontend/shared/ui/patterns';
import { formatCurrency } from '@/shared/utils/currency.utils';
import { cn } from '@/lib/utils';
import {
  useAttentionQueue,
  useMonthToDateSavings,
  useMonthToDateAllocationTotal,
  useSavingsStripAccess,
} from '../hooks/useAttentionQueue';
import {
  useAttentionPermissions,
  useDispatchAttentionItem,
  useResolveAttentionItem,
  type ResolveAttentionInput,
} from '../hooks/useAttentionActions';
import { SeverityFilterBar } from '../components/SeverityFilterBar';
import { AttentionQueueList } from '../components/AttentionQueueList';
import { ResolveAttentionDialog } from '../components/ResolveAttentionDialog';
import { SavingsStrip } from '../components/SavingsStrip';
import type { NeedsAttentionItem, SeverityFilterValue, SourceFilterValue } from '../types';

interface CommandCentrePageProps {
  /** Drops the breadcrumb when embedded as the Dashboard's primary tab, which has its own page chrome. */
  embedded?: boolean;
}

export function CommandCentrePage({ embedded = false }: CommandCentrePageProps) {
  const [severity, setSeverity] = useState<SeverityFilterValue>('all');
  const [source, setSource] = useState<SourceFilterValue>('all');
  const [resolveTarget, setResolveTarget] = useState<NeedsAttentionItem | null>(null);

  const { mode: savingsStripMode } = useSavingsStripAccess();
  const { data: feed, isLoading, isError, error, refetch, isFetching } = useAttentionQueue(200);
  const {
    data: savings,
    isLoading: isSavingsLoading,
    isError: isSavingsError,
    refetch: refetchSavings,
  } = useMonthToDateSavings();
  const {
    data: allocationReport,
    isLoading: isAllocationLoading,
    isError: isAllocationError,
  } = useMonthToDateAllocationTotal();

  const { canResolve, canDispatch } = useAttentionPermissions();
  const resolveMutation = useResolveAttentionItem();
  const dispatchMutation = useDispatchAttentionItem();

  const items = useMemo(() => feed?.items ?? [], [feed]);

  const filteredItems = useMemo(
    () =>
      items.filter((item) => {
        if (severity !== 'all' && item.severity !== severity) return false;
        if (source !== 'all' && item.source !== source) return false;
        return true;
      }),
    [items, severity, source]
  );

  const clearFilters = useCallback(() => {
    setSeverity('all');
    setSource('all');
  }, []);

  const handleDispatch = useCallback(
    (item: NeedsAttentionItem) => dispatchMutation.mutate(item.id),
    [dispatchMutation]
  );

  const handleResolveConfirm = useCallback(
    (input: ResolveAttentionInput) => {
      if (!resolveTarget) return;
      resolveMutation.mutate(
        { itemKey: resolveTarget.id, input },
        { onSuccess: () => setResolveTarget(null) }
      );
    },
    [resolveMutation, resolveTarget]
  );

  const critical = feed?.bySeverity?.critical ?? 0;
  const high = feed?.bySeverity?.high ?? 0;
  const total = feed?.total ?? 0;

  // Money at stake is summed over the items actually returned. When the feed
  // was truncated by `limit`, that is a floor rather than the true total, and
  // the hint says so instead of presenting a partial sum as complete.
  const costAtStake = useMemo(() => items.reduce((sum, item) => sum + (item.cost || 0), 0), [items]);
  const truncated = total > items.length;

  // Sources that threw while the feed was assembled. Their contribution is
  // omitted and counted as zero everywhere, so a queue that looks calm may
  // simply be missing a whole category — the operator has to be told.
  const unavailableSources = feed?.unavailableSources ?? [];

  return (
    <div className="flex flex-col gap-5">
      <PageHeader
        title="Command Centre"
        description="Everything that needs a decision, ranked by severity, cost at stake and how soon it is due."
        breadcrumbs={embedded ? undefined : [{ label: 'Command Centre' }]}
        hideBreadcrumbs={embedded}
        meta={
          feed?.generatedAt ? (
            <PageHeaderMeta
              label="Updated"
              value={new Date(feed.generatedAt).toLocaleTimeString()}
              icon={<CircleDot aria-hidden="true" />}
            />
          ) : undefined
        }
        actions={
          <Button variant="outline" size="sm" onClick={() => refetch()} disabled={isFetching}>
            <RefreshCw className={cn('size-3.5', isFetching && 'animate-spin')} aria-hidden="true" />
            Refresh
          </Button>
        }
      />

      {isLoading ? (
        <LoadingState type="table" count={8} />
      ) : isError ? (
        <ErrorState
          title="The attention feed didn't load"
          description="This queue aggregates seven intelligence sources, so a single slow source can time the whole request out. Retrying usually works."
          detail={describeQueryError(error)}
          onRetry={() => refetch()}
          size="page"
        />
      ) : (
        <>
          {/* How bad is it, right now — answerable without reading the list. */}
          <MetricCardGrid columns={4}>
            <MetricCard
              label="Needs attention"
              value={total.toLocaleString()}
              hint={truncated ? `Showing the top ${items.length}` : undefined}
              icon={<AlertOctagon aria-hidden="true" />}
            />
            <MetricCard
              label="Critical"
              value={critical.toLocaleString()}
              tone={critical > 0 ? 'critical' : 'positive'}
              hint={critical > 0 ? 'Act today' : 'Nothing critical'}
              icon={<ShieldAlert aria-hidden="true" />}
            />
            <MetricCard
              label="High"
              value={high.toLocaleString()}
              tone={high > 0 ? 'attention' : 'neutral'}
              icon={<TriangleAlert aria-hidden="true" />}
            />
            <MetricCard
              label="Cost at stake"
              value={costAtStake > 0 ? formatCurrency(costAtStake) : null}
              emptyValue="None quantified"
              hint={
                truncated
                  ? 'At least this much — the queue is truncated'
                  : 'Across every item in the queue'
              }
            />
          </MetricCardGrid>

          {unavailableSources.length > 0 && (
            <ErrorState
              size="inline"
              title={`${unavailableSources.length} intelligence ${
                unavailableSources.length === 1 ? 'source is' : 'sources are'
              } unavailable`}
              detail={`Findings from ${unavailableSources
                .map((name) => name.replace(/_/g, ' '))
                .join(', ')} are missing from this queue and are counted as zero.`}
              onRetry={() => refetch()}
            />
          )}

          <SeverityFilterBar
            severity={severity}
            onSeverityChange={setSeverity}
            source={source}
            onSourceChange={setSource}
            feed={feed}
          />

          <AttentionQueueList
            items={filteredItems}
            totalBeforeFilters={items.length}
            onClearFilters={clearFilters}
            canResolve={canResolve}
            canDispatch={canDispatch}
            onResolve={setResolveTarget}
            onDispatch={handleDispatch}
            resolvingId={resolveMutation.isPending ? resolveTarget?.id : null}
            dispatchingId={dispatchMutation.isPending ? dispatchMutation.variables : null}
          />
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

      <ResolveAttentionDialog
        item={resolveTarget}
        open={resolveTarget !== null}
        onOpenChange={(open) => {
          if (!open) setResolveTarget(null);
        }}
        onConfirm={handleResolveConfirm}
        isSubmitting={resolveMutation.isPending}
      />
    </div>
  );
}

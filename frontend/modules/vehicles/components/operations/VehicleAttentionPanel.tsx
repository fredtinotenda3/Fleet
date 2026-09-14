// frontend/modules/vehicles/components/operations/VehicleAttentionPanel.tsx
//
// WAVE 1 PART 2, item 7: this vehicle's slice of the Needs-Attention feed,
// rendered directly on the Vehicle Detail page's Overview tab.
//
// Reuses the SAME building blocks as the Command Centre (AttentionItemCard,
// useAttentionPermissions, useResolveAttentionItem, useDispatchAttentionItem,
// ResolveAttentionDialog) rather than a second, parallel set -- resolving or
// dispatching an item from here hits the exact same
// POST /api/ai/needs-attention/{itemKey}/(resolve|dispatch) endpoints, so
// there is one code path for "what can I do with a finding", not two that
// could drift.
//
// The data source is the one genuinely NEW piece: useVehicleNeedsAttention,
// which calls the dedicated `?vehicleId=` branch of GET /api/ai/needs-
// attention (see that hook's header comment for why this is not the
// fleet-wide feed filtered client-side).

'use client';

import { useCallback, useMemo, useState } from 'react';
import { CheckCircle2, RefreshCw } from 'lucide-react';
import { Button } from '@/frontend/shared/ui/primitives/button';
import { LoadingState } from '@/shared/ui/feedback/LoadingState';
import { EmptyState } from '@/shared/ui/feedback/EmptyState';
import { ErrorState, describeQueryError } from '@/frontend/shared/ui/patterns';
import { cn } from '@/lib/utils';
import { useVehicleNeedsAttention } from '../../hooks/useVehicleAttention';
import { AttentionItemCard } from '@/frontend/modules/attention/components/AttentionItemCard';
import { ResolveAttentionDialog } from '@/frontend/modules/attention/components/ResolveAttentionDialog';
import {
  useAttentionPermissions,
  useDispatchAttentionItem,
  useResolveAttentionItem,
  type ResolveAttentionInput,
} from '@/frontend/modules/attention/hooks/useAttentionActions';
import type { NeedsAttentionItem } from '@/frontend/modules/attention/types';

interface VehicleAttentionPanelProps {
  vehicleId: string;
}

export function VehicleAttentionPanel({ vehicleId }: VehicleAttentionPanelProps) {
  const [resolveTarget, setResolveTarget] = useState<NeedsAttentionItem | null>(null);

  const { data: feed, isLoading, isError, error, refetch, isFetching } = useVehicleNeedsAttention(vehicleId);
  const { canResolve, canDispatch } = useAttentionPermissions();
  const resolveMutation = useResolveAttentionItem();
  const dispatchMutation = useDispatchAttentionItem();

  const items = useMemo(() => feed?.items ?? [], [feed]);

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

  if (isLoading) {
    return <LoadingState type="card" count={2} />;
  }

  if (isError) {
    return (
      <ErrorState
        size="inline"
        title="This vehicle's attention items didn't load"
        description="Predicted failures, fuel anomalies, compliance and maintenance are checked in parallel, so a single slow check can time the request out. Retrying usually works."
        detail={describeQueryError(error)}
        onRetry={() => refetch()}
      />
    );
  }

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-end">
        <Button variant="ghost" size="xs" onClick={() => refetch()} disabled={isFetching}>
          <RefreshCw className={cn('size-3.5', isFetching && 'animate-spin')} aria-hidden="true" />
          Refresh
        </Button>
      </div>

      {items.length === 0 ? (
        <EmptyState
          tone="positive"
          size="sm"
          icon={<CheckCircle2 aria-hidden="true" />}
          title="Nothing needs attention"
          description="No predicted failures, fuel anomalies, compliance or maintenance items are pending for this vehicle."
        />
      ) : (
        <ol className="space-y-2">
          {items.map((item, index) => (
            <AttentionItemCard
              key={item.id}
              item={item}
              rank={index + 1}
              canResolve={canResolve}
              canDispatch={canDispatch}
              onResolve={setResolveTarget}
              onDispatch={handleDispatch}
              isResolving={resolveMutation.isPending && resolveTarget?.id === item.id}
              isDispatching={dispatchMutation.isPending && dispatchMutation.variables === item.id}
            />
          ))}
        </ol>
      )}

      {/*
        unavailableSources: unlike the Command Centre (a dedicated screen
        with room for its own ErrorState block), this panel sits inside an
        already-busy Overview tab -- so a partial-source failure is folded
        into the empty/list copy above rather than given its own block,
        EXCEPT it must not be silently dropped. Surfacing it here, compactly,
        keeps "some sources failed" from reading as "nothing pending".
      */}
      {feed && feed.unavailableSources.length > 0 && (
        <p className="text-caption text-muted-foreground">
          {feed.unavailableSources.length === 1 ? 'One check' : `${feed.unavailableSources.length} checks`}{' '}
          could not be completed just now ({feed.unavailableSources.map((s) => s.replace(/_/g, ' ')).join(', ')}) and{' '}
          {feed.unavailableSources.length === 1 ? 'is' : 'are'} not reflected above.
        </p>
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

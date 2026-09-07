// frontend/modules/attention/hooks/useAttentionActions.ts
//
// The half of the Command Centre that was never wired up.
//
// Two endpoints have shipped, are permission-gated and are covered by
// backend tests, and until now NOTHING in the frontend called either:
//
//   POST /api/ai/needs-attention/{itemKey}/resolve   (ANALYTICS_VIEW)
//   POST /api/ai/needs-attention/{itemKey}/dispatch  (WORKORDER_CREATE
//                                                     or MAINTENANCE_CREATE)
//
// Without them the Command Centre is a list of problems with no way to act
// on one and no record that anyone did — which is precisely the "what should
// be done / what happened afterward" half of the product's own stated loop.
// Wiring them is frontend-only work against contracts that already exist.

'use client';

import { useMutation, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { apiClient } from '@/shared/utils/api-client.utils';
import { Permission, permissionService } from '@/server/permissions/roles';
import { useSessionStore } from '@/frontend/shared/store/session.store';

/**
 * Mirrors `DispatchTriggerOutcome`
 * (modules/attention/services/attention-dispatch.trigger.ts).
 *
 * Every one of these arrives as HTTP 200, deliberately: the backend's own
 * comment records that mapping 'duplicate' / 'no_action' / 'refused' /
 * 'action_failed' onto HTTP errors would lose the reason, and the reason is
 * what the operator needs. The UI therefore must not treat a 200 as success —
 * it has to read `status`.
 */
export type DispatchStatus = 'dispatched' | 'duplicate' | 'no_action' | 'refused' | 'action_failed';

export interface DispatchOutcome {
  status: DispatchStatus;
  actionType?: string;
  idempotencyKey?: string;
  reason?: string;
}

export interface ResolveAttentionInput {
  /** What the resolver confirmed actually happened. Falls back server-side to the item's modelled cost. */
  realisedAmount?: number;
  evidenceRefs?: string[];
  notes?: string;
}

/**
 * Item ids are source-prefixed (`maintenance:reminder-1`), so the colon MUST
 * be percent-encoded. The controller calls decodeURIComponent on the segment,
 * so an un-encoded id would resolve to a different key or a 404.
 */
function itemPath(itemKey: string, action: 'resolve' | 'dispatch'): string {
  return `/api/ai/needs-attention/${encodeURIComponent(itemKey)}/${action}`;
}

/** Which actions this user may take. Mirrors each route's own gate exactly. */
export function useAttentionPermissions() {
  const user = useSessionStore((state) => state.user);
  const roles = user?.roles ?? [];

  return {
    canResolve: permissionService.hasPermission(roles, Permission.ANALYTICS_VIEW),
    canDispatch: permissionService.hasAnyPermission(roles, [
      Permission.WORKORDER_CREATE,
      Permission.MAINTENANCE_CREATE,
    ]),
  };
}

/**
 * Everything that reads the attention feed, so an action refreshes all of it.
 *
 * The feed is requested at several limits (the dashboard widget's 6, the
 * queue's 200) and each limit is its own cache entry. Invalidating by prefix
 * catches every one; invalidating a single exact key would leave the widget
 * showing an item the user has just resolved on the full page.
 */
function invalidateAttention(queryClient: ReturnType<typeof useQueryClient>) {
  queryClient.invalidateQueries({ queryKey: ['attention', 'needs-attention'] });
  queryClient.invalidateQueries({ queryKey: ['dashboard', 'needs-attention'] });
  // Resolving an item posts to the value ledger, which is what the savings
  // strip reads.
  queryClient.invalidateQueries({ queryKey: ['attention', 'ledger'] });
}

export function useResolveAttentionItem() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({ itemKey, input }: { itemKey: string; input: ResolveAttentionInput }) =>
      apiClient.post<unknown>(itemPath(itemKey, 'resolve'), input),
    onSuccess: () => {
      invalidateAttention(queryClient);
      toast.success('Item resolved', {
        description: 'Recorded against the value ledger for this month.',
      });
    },
    onError: (error: unknown) => {
      toast.error('Could not resolve this item', {
        description: error instanceof Error ? error.message : undefined,
      });
    },
  });
}

/**
 * Human-readable outcome of a dispatch, per status.
 *
 * `dispatched` is the only success. The rest are answers, not failures, and
 * are shown as information rather than as errors — except `action_failed`,
 * which means the dispatch WAS recorded and the downstream write then broke,
 * and an operator must know that the two halves disagree.
 */
export function describeDispatchOutcome(outcome: DispatchOutcome): {
  tone: 'success' | 'info' | 'error';
  title: string;
  description?: string;
} {
  switch (outcome.status) {
    case 'dispatched':
      return {
        tone: 'success',
        title: 'Work created',
        description: outcome.actionType
          ? `Raised as ${outcome.actionType.replace(/_/g, ' ')}.`
          : 'The action was created.',
      };
    case 'duplicate':
      return {
        tone: 'info',
        title: 'Already dispatched',
        description: 'Work was already created for this finding, so nothing new was raised.',
      };
    case 'no_action':
      return {
        tone: 'info',
        title: 'Nothing to dispatch',
        description: outcome.reason,
      };
    case 'refused':
      return {
        tone: 'info',
        title: 'Dispatch refused',
        description: outcome.reason,
      };
    case 'action_failed':
      return {
        tone: 'error',
        title: 'Dispatch recorded, but the action failed',
        description: outcome.reason ?? 'The dispatch was logged but the downstream work was not created.',
      };
    default:
      return { tone: 'info', title: 'Dispatch complete' };
  }
}

export function useDispatchAttentionItem() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (itemKey: string) => apiClient.post<DispatchOutcome>(itemPath(itemKey, 'dispatch'), {}),
    onSuccess: (outcome) => {
      // A 200 is not necessarily a success — see the note on DispatchOutcome.
      const described = describeDispatchOutcome(outcome);

      if (described.tone === 'success') {
        // Only a real dispatch changes downstream state.
        invalidateAttention(queryClient);
        queryClient.invalidateQueries({ queryKey: ['workorders'] });
        queryClient.invalidateQueries({ queryKey: ['maintenance'] });
        toast.success(described.title, { description: described.description });
        return;
      }

      if (described.tone === 'error') {
        toast.error(described.title, { description: described.description });
        return;
      }

      toast.info(described.title, { description: described.description });
    },
    onError: (error: unknown) => {
      toast.error('Could not dispatch this item', {
        description: error instanceof Error ? error.message : undefined,
      });
    },
  });
}

// frontend/modules/attention/hooks/useAttentionActions.ts
//
// The half of the Command Centre that was never wired up.
//
// Two endpoints have shipped, are permission-gated and are covered by
// backend tests, and until now NOTHING in the frontend called either:
//
//   POST /api/ai/needs-attention/{itemKey}/resolve   (ANALYTICS_MANAGE)
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
import type { NeedsAttentionSource } from '@/modules/ai/types/needs-attention.types';

/**
 * ROUND 5 FIX -- a whitelist mirroring `actionForSource` in
 * modules/attention/services/attention-dispatch.service.ts, which cannot
 * be imported here (it pulls in `crypto` and server-only registries).
 *
 * Before this, the Dispatch button was shown for EVERY source whenever
 * the caller held the permission, including `fleet_health`/`driver_risk`
 * (deliberately actionless) and, until this same round's backend fix,
 * `compliance`/`fuel_fraud`/`expense_anomaly` (which always failed --
 * see that service's own comment). Clicking it was always safe -- the
 * backend never crashes or fabricates -- but it round-tripped to learn
 * "nothing to dispatch" for a button that could have said so up front.
 *
 * A WHITELIST, not a blacklist: a newly added source with no executor
 * yet defaults to hidden, the safe direction, rather than defaulting to
 * shown and failing until someone notices.
 */
const SOURCES_WITH_DISPATCH_ACTION: ReadonlySet<NeedsAttentionSource> = new Set([
  'predictive_maintenance',
  'maintenance',
]);

/** Whether this specific item's source has a real dispatchable action today. */
export function sourceHasDispatchAction(source: NeedsAttentionSource): boolean {
  return SOURCES_WITH_DISPATCH_ACTION.has(source);
}

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
function itemPath(itemKey: string, action: 'resolve' | 'dispatch' | 'verify-outcome'): string {
  return `/api/ai/needs-attention/${encodeURIComponent(itemKey)}/${action}`;
}

/**
 * MODULE CONNECTIVITY UPGRADE -- "Attention/Actions ↔ Outcome
 * Verification". Mirrors ResolveAttentionInput/useResolveAttentionItem
 * exactly; see attention-resolution.service.ts#verifyOutcome for why
 * `note` is required only when `outcome` is 'reopened'.
 */
export interface VerifyAttentionOutcomeInput {
  outcome: 'verified_resolved' | 'reopened';
  evidenceRefs?: string[];
  note?: string;
}

export interface VerifyOutcomeResult {
  item: { itemKey: string; outcomeStatus: 'verified_resolved' | 'reopened' };
  ledgerEntryWarning: string | null;
}

/** Which actions this user may take. Mirrors each route's own gate exactly. */
export function useAttentionPermissions() {
  const user = useSessionStore((state) => state.user);
  const roles = user?.roles ?? [];

  return {
    /**
     * ROUND 5 FIX -- was Permission.ANALYTICS_VIEW, which let VIEWER
     * and AUDITOR see this button even though the backend route no
     * longer lets either role's request through (see
     * Permission.ANALYTICS_MANAGE's doc comment in
     * server/permissions/roles.ts). Without this change those two
     * roles would see a Resolve button that always 403s.
     */
    canResolve: permissionService.hasPermission(roles, Permission.ANALYTICS_MANAGE),
    canDispatch: permissionService.hasAnyPermission(roles, [
      Permission.WORKORDER_CREATE,
      Permission.MAINTENANCE_CREATE,
    ]),
    /**
     * MODULE CONNECTIVITY UPGRADE -- "Attention/Actions ↔ Outcome
     * Verification". Mirrors canResolve exactly: the verify-outcome route
     * is gated on the same Permission.ANALYTICS_MANAGE as resolve (see
     * app/api/ai/needs-attention/[id]/verify-outcome/route.ts) -- a
     * separate flag rather than reusing canResolve under the Resolved
     * tab so a future change to either route's permission doesn't have
     * to remember the two are currently the same.
     */
    canVerifyOutcome: permissionService.hasPermission(roles, Permission.ANALYTICS_MANAGE),
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
 * MODULE CONNECTIVITY UPGRADE -- "Attention/Actions ↔ Outcome
 * Verification". Only callable against an item the caller already
 * knows the itemKey of -- today, via the Value Ledger export/summary,
 * or the Command Centre's own "Resolved" tab (CommandCentrePage.tsx),
 * which lists resolved items by itemKey and wires VerifyOutcomeDialog
 * directly to this hook.
 */
export function useVerifyAttentionOutcome() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({ itemKey, input }: { itemKey: string; input: VerifyAttentionOutcomeInput }) =>
      apiClient.post<VerifyOutcomeResult>(itemPath(itemKey, 'verify-outcome'), input),
    onSuccess: (result) => {
      invalidateAttention(queryClient);
      if (result.item.outcomeStatus === 'verified_resolved') {
        toast.success('Outcome verified', { description: 'Confirmed the underlying issue is resolved.' });
      } else {
        toast.info('Marked as reopened', {
          description: result.ledgerEntryWarning ?? 'The underlying issue is still present.',
        });
      }
    },
    onError: (error: unknown) => {
      toast.error('Could not record this outcome check', {
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

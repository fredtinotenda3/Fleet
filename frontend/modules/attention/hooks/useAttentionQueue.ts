// frontend/modules/attention/hooks/useAttentionQueue.ts

import { useQuery } from '@tanstack/react-query';
import { dashboardApi } from '@/frontend/modules/dashboard/services/dashboard.api';
import { attentionApi } from '../services/attention.api';
import { financeApi, startOfMonth as financeStartOfMonth } from '@/frontend/modules/finance/services/finance.api';
import { useSessionStore } from '@/frontend/shared/store/session.store';
import { Permission, permissionService } from '@/server/permissions/roles';
import { ApiError } from '@/shared/utils/api-client.utils';

const attentionKeys = {
  queue: (limit: number) => ['attention', 'needs-attention', limit] as const,
  monthToDateLedger: (mode: 'export' | 'summary') => ['attention', 'ledger', 'month-to-date', mode] as const,
  monthToDateAllocationTotal: ['attention', 'allocation-ledger', 'month-to-date'] as const,
};

/** Don't burn a retry on a permission failure -- the caller's roles aren't going to change mid-request. */
function isNotForbidden(error: unknown): boolean {
  return !(error instanceof ApiError && error.statusCode === 403);
}

/**
 * Full-screen ranked attention queue. Same GET /api/ai/needs-attention
 * the Dashboard widget calls (via dashboardApi.getNeedsAttention), just
 * requested with a page-sized limit instead of the widget's top-6. The
 * API already returns the list priority-ranked, and already scopes
 * results to the caller's org unit -- this hook does no re-sorting or
 * re-scoping, only the client-side severity/source filtering the page
 * applies on top (see useFilteredAttentionItems).
 */
export function useAttentionQueue(limit = 200) {
  return useQuery({
    queryKey: attentionKeys.queue(limit),
    queryFn: () => dashboardApi.getNeedsAttention(limit),
    staleTime: 2 * 60_000,
    retry: 1,
  });
}

/**
 * Which of the two ledger reads the current user can make, and whether
 * the SavingsStrip should render at all. Prefers the lighter
 * FINANCE_VIEW-gated summary whenever it's sufficient (the strip only
 * ever reads `summary`/`truncated`); falls back to the full
 * ANALYTICS_EXPORT-gated export for roles that hold export access but
 * not FINANCE_VIEW (e.g. auditor). A caller with neither permission
 * gets 'none' -- the strip is hidden rather than issuing a request that
 * can only 403.
 */
export function useSavingsStripAccess(): { mode: 'summary' | 'export' | 'none' } {
  const { user } = useSessionStore();
  const roles = user?.roles ?? [];
  if (permissionService.hasPermission(roles, Permission.FINANCE_VIEW)) return { mode: 'summary' };
  if (permissionService.hasPermission(roles, Permission.ANALYTICS_EXPORT)) return { mode: 'export' };
  return { mode: 'none' };
}

/**
 * Month-to-date realised-vs-modelled savings strip. Backed by
 * GET /api/attention/ledger/summary (Permission.FINANCE_VIEW) when the
 * caller has it -- scoped to the current calendar month and the
 * caller's tenant/org-unit -- falling back to the full
 * GET /api/attention/ledger/export?format=json (Permission.
 * ANALYTICS_EXPORT) for callers who have export access but not
 * FINANCE_VIEW. Disabled entirely (no request, no 403) when the caller
 * has neither -- see useSavingsStripAccess.
 */
export function useMonthToDateSavings() {
  const { mode } = useSavingsStripAccess();

  return useQuery({
    queryKey: attentionKeys.monthToDateLedger(mode === 'export' ? 'export' : 'summary'),
    queryFn: () =>
      mode === 'export' ? attentionApi.getMonthToDateLedgerExport() : attentionApi.getMonthToDateLedgerSummary(),
    enabled: mode !== 'none',
    staleTime: 5 * 60_000,
    retry: (failureCount, error) => failureCount < 1 && isNotForbidden(error),
  });
}

/**
 * Month-to-date allocation-ledger total (the finance module's actual
 * posted cost, org-wide) for the SavingsStrip's second figure.
 *
 * Backed by GET /api/finance/gl/reconciliation, which is the one finance
 * endpoint that returns an org-wide total without a vehicleId -- every
 * other allocation read (getAllocations, getCostPerKm) requires one by
 * design (see allocation.controller.ts's DoS-surface comment), and
 * getReconciliationReport's totalPlatform figure is already a
 * server-computed aggregate rather than a per-row read, so it doesn't
 * reopen that concern.
 *
 * Gated on FINANCE_VIEW server-side, a different permission than the
 * value-ledger export this sits next to -- a caller who can see resolved
 * savings but lacks finance access simply gets isError here, which the
 * strip treats as "omit this figure", not a hard failure of the whole
 * component.
 */
export function useMonthToDateAllocationTotal() {
  const now = new Date();
  const from = financeStartOfMonth(now);
  return useQuery({
    queryKey: attentionKeys.monthToDateAllocationTotal,
    queryFn: () => financeApi.getReconciliationReport(from, now),
    staleTime: 5 * 60_000,
    retry: 1,
  });
}

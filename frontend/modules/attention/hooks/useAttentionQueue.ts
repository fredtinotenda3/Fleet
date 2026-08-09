// frontend/modules/attention/hooks/useAttentionQueue.ts

import { useQuery } from '@tanstack/react-query';
import { dashboardApi } from '@/frontend/modules/dashboard/services/dashboard.api';
import { attentionApi } from '../services/attention.api';
import { financeApi, startOfMonth as financeStartOfMonth } from '@/frontend/modules/finance/services/finance.api';

const attentionKeys = {
  queue: (limit: number) => ['attention', 'needs-attention', limit] as const,
  monthToDateLedger: ['attention', 'ledger', 'month-to-date'] as const,
  monthToDateAllocationTotal: ['attention', 'allocation-ledger', 'month-to-date'] as const,
};

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
 * Month-to-date realised-vs-modelled savings strip. Backed by
 * GET /api/attention/ledger/export?format=json, scoped to the current
 * calendar month and the caller's tenant/org-unit.
 */
export function useMonthToDateSavings() {
  return useQuery({
    queryKey: attentionKeys.monthToDateLedger,
    queryFn: () => attentionApi.getMonthToDateLedgerExport(),
    staleTime: 5 * 60_000,
    retry: 1,
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

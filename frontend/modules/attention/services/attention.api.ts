// frontend/modules/attention/services/attention.api.ts
//
// The attention queue itself is already fetched via
// frontend/modules/dashboard/services/dashboard.api.ts's getNeedsAttention
// (same GET /api/ai/needs-attention the dashboard widget uses) -- reused
// as-is by useAttentionQueue rather than duplicated here. This file only
// adds the one endpoint the dashboard module doesn't already call: the
// value-ledger export that backs the month-to-date savings strip.

import { apiClient } from '@/shared/utils/api-client.utils';
import { toISODate } from '@/shared/utils/date.utils';
import type { LedgerExportData, LedgerSummaryData, ResolvedAttentionFeed } from '../types';

/** First calendar day of the month containing `date`, at local midnight. */
export function startOfMonth(date: Date = new Date()): Date {
  return new Date(date.getFullYear(), date.getMonth(), 1);
}

export const attentionApi = {
  /**
   * Powers the Command Centre's realised-vs-modelled savings strip.
   * Calls GET /api/attention/ledger/export?format=json, scoped
   * server-side to the caller's tenant/org-unit (resolveTenantContext) --
   * this never accepts or sends a caller-supplied org id.
   */
  async getLedgerExport(from?: Date, to?: Date): Promise<LedgerExportData> {
    return apiClient.get<LedgerExportData>('/api/attention/ledger/export', {
      params: {
        format: 'json',
        from: from ? toISODate(from) : undefined,
        to: to ? toISODate(to) : undefined,
      },
    });
  },

  /** Convenience wrapper: the ledger export filtered to the current month so far. */
  async getMonthToDateLedgerExport(): Promise<LedgerExportData> {
    return attentionApi.getLedgerExport(startOfMonth(), new Date());
  },

  /**
   * Lighter counterpart to getLedgerExport() for callers without
   * Permission.ANALYTICS_EXPORT: calls GET /api/attention/ledger/summary
   * (Permission.FINANCE_VIEW), same scoping, same `summary`/`truncated`
   * shape, no row-level `entries`.
   */
  async getLedgerSummary(from?: Date, to?: Date): Promise<LedgerSummaryData> {
    return apiClient.get<LedgerSummaryData>('/api/attention/ledger/summary', {
      params: {
        from: from ? toISODate(from) : undefined,
        to: to ? toISODate(to) : undefined,
      },
    });
  },

  /** Convenience wrapper: the ledger summary filtered to the current month so far. */
  async getMonthToDateLedgerSummary(): Promise<LedgerSummaryData> {
    return attentionApi.getLedgerSummary(startOfMonth(), new Date());
  },

  /**
   * MODULE CONNECTIVITY UPGRADE -- "Attention/Actions ↔ Outcome
   * Verification". GET /api/ai/needs-attention/resolved
   * (Permission.ANALYTICS_VIEW) -- the read path the Command Centre's
   * "Resolved" tab needs to browse to an item and verify its outcome.
   * A dedicated route rather than a query param on GET
   * /api/ai/needs-attention: that route's entire contract is "live
   * recomputation of the open feed" (see needs-attention.service.ts),
   * and resolved items are a plain scoped read of already-durable rows,
   * not a recomputation -- folding them in would make one route do two
   * structurally different things.
   */
  async getResolvedItems(limit = 50): Promise<ResolvedAttentionFeed> {
    return apiClient.get<ResolvedAttentionFeed>('/api/ai/needs-attention/resolved', { params: { limit } });
  },
};

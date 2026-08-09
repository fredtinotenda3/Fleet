// frontend/modules/finance/services/finance.api.ts
//
// Client for the finance module's endpoints. Every one of them resolves
// the caller's tenant and org-unit server-side via resolveTenantContext,
// so nothing here sends an organization or org-unit id -- the same
// discipline attention.api.ts documents.
//
// NOTE ON vehicleId: the finance endpoints take a vehicle's MongoDB _id,
// NOT a license plate. The rest of this codebase references vehicles by
// license_plate, so this is the one place that differs. Passing a plate
// returns an empty cost report rather than an error (see the contract
// block in modules/finance/services/allocation.service.ts), which is why
// every caller in this module passes `vehicle._id`.

import { apiClient } from '@/shared/utils/api-client.utils';
import { toISODate } from '@/shared/utils/date.utils';
import type {
  AllocationPosting,
  CostPerKmResponse,
  FinanceSettingsResponse,
  GLReconciliationReport,
  GLSubmission,
  OrganizationFinanceSettings,
} from '../types';

/** First calendar day of the month containing `date`, at local midnight. */
export function startOfMonth(date: Date = new Date()): Date {
  return new Date(date.getFullYear(), date.getMonth(), 1);
}

/** Last moment of the month containing `date`. */
export function endOfMonth(date: Date = new Date()): Date {
  return new Date(date.getFullYear(), date.getMonth() + 1, 0, 23, 59, 59, 999);
}

/** The calendar month immediately before the one containing `date`. */
export function previousMonthRange(date: Date = new Date()): { from: Date; to: Date } {
  const anchor = new Date(date.getFullYear(), date.getMonth() - 1, 1);
  return { from: startOfMonth(anchor), to: endOfMonth(anchor) };
}

export const financeApi = {
  /** GET /api/finance/cost-per-km — one vehicle, one period. */
  async getCostPerKm(vehicleId: string, from: Date, to: Date): Promise<CostPerKmResponse> {
    return apiClient.get<CostPerKmResponse>('/api/finance/cost-per-km', {
      params: { vehicleId, periodStart: toISODate(from), periodEnd: toISODate(to) },
    });
  },

  /** GET /api/finance/allocations — the posting list backing a cost figure's drill-down. */
  async getAllocations(vehicleId: string, from?: Date, to?: Date): Promise<AllocationPosting[]> {
    return apiClient.get<AllocationPosting[]>('/api/finance/allocations', {
      params: {
        vehicleId,
        periodStart: from ? toISODate(from) : undefined,
        periodEnd: to ? toISODate(to) : undefined,
      },
    });
  },

  /** GET /api/finance/gl/reconciliation — platform vs GL totals with named variance. */
  async getReconciliationReport(from: Date, to: Date): Promise<GLReconciliationReport> {
    return apiClient.get<GLReconciliationReport>('/api/finance/gl/reconciliation', {
      params: { periodStart: toISODate(from), periodEnd: toISODate(to) },
    });
  },

  /**
   * GET /api/finance/gl/submissions — every submission in a period,
   * newest first (a restated figure appears as a second row).
   */
  async getSubmissions(from: Date, to: Date): Promise<GLSubmission[]> {
    return apiClient.get<GLSubmission[]>('/api/finance/gl/submissions', {
      params: { periodStart: toISODate(from), periodEnd: toISODate(to) },
    });
  },

  // NO PDF METHOD, DELIBERATELY.
  //
  // The brief asked for PDF + CSV export on the reconciliation page.
  // CSV is done client-side (see reconciliationCsvColumns in
  // ../utils/reconciliation-export.utils.ts) because the report is a
  // small, bounded, already-loaded table -- not a paginated dataset, so
  // the "send filters, not rows" rule behind triggerExport() does not
  // apply here.
  //
  // Server-side PDF is NOT available and cannot be added without
  // touching the backend, which this pass excludes:
  //   - GET /api/finance/gl/reconciliation returns JSON only (it has no
  //     `format` parameter at all, unlike the value-ledger export).
  //   - `pdfkit` -- what modules/attention/generators/ledger-pdf.
  //     generator.ts uses -- is a Node library and cannot run in the
  //     browser, and no client-side PDF library is installed.
  // Calling a `format=pdf` param that the route ignores would silently
  // download a JSON body named ".pdf", so it is not offered. The page
  // exposes browser print-to-PDF instead. See the changelog.

  /** GET /api/finance/settings */
  async getSettings(): Promise<FinanceSettingsResponse> {
    return apiClient.get<FinanceSettingsResponse>('/api/finance/settings');
  },

  /** PUT /api/finance/settings */
  async updateSettings(
    data: OrganizationFinanceSettings
  ): Promise<{ settings: OrganizationFinanceSettings }> {
    return apiClient.put<{ settings: OrganizationFinanceSettings }>('/api/finance/settings', data);
  },
};
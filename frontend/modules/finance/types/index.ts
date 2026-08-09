// frontend/modules/finance/types/index.ts
//
// Frontend types for the cost-per-km engine UI. Re-exports the backend
// response shapes as-is rather than restating them -- the same technique
// frontend/modules/attention/types/index.ts uses. Restating a financial
// response shape client-side is how a field silently drifts from what the
// API actually returns, and here that would mean a cost figure rendering
// as `undefined` rather than failing a typecheck.

import type {
  AllocationPosting,
  AllocationCategoryTotal,
  AllocationCostCategory,
  CostPerKmResult,
} from '@/modules/finance/types/allocation.types';
import type {
  GLReconciliationReport,
  GLVarianceLine,
  GLSubmission,
} from '@/modules/finance/types/gl-reconciliation.types';
import type {
  OrganizationFinanceSettings,
  FxPolicy,
} from '@/modules/finance/types/finance-settings.types';
import type { DepreciationMethod } from '@/modules/finance/types/depreciation.types';

export type {
  AllocationPosting,
  AllocationCategoryTotal,
  AllocationCostCategory,
  CostPerKmResult,
  GLReconciliationReport,
  GLVarianceLine,
  GLSubmission,
  OrganizationFinanceSettings,
  FxPolicy,
  DepreciationMethod,
};

/**
 * GET /api/finance/cost-per-km response.
 *
 * `mixedReportingCurrencies` is present only when the requested period
 * spans a reporting-currency change. When it is set, `totalNetCost` is 0
 * and `costPerKm` is null by design -- the backend refuses to sum
 * incomparable currencies rather than producing a meaningless figure, so
 * every UI that renders this must branch on it instead of showing a zero.
 */
export interface CostPerKmResponse extends CostPerKmResult {
  mixedReportingCurrencies?: string[];
}

/** GET /api/finance/settings response: what was saved, plus what is actually in force. */
export interface FinanceSettingsResponse {
  saved: OrganizationFinanceSettings | null;
  resolved: {
    reportingCurrency: string;
    fxPolicy: FxPolicy;
    glToleranceAmount: number;
    depreciationDefaults?: {
      method: DepreciationMethod;
      usefulLifeMonths?: number;
      salvageValuePercent?: number;
      decliningBalanceRate?: number;
    };
    /** True when nothing has ever been saved, so every resolved value came from a default. */
    usingDefaults: boolean;
  };
}

/**
 * A month-over-month cost-per-km comparison, assembled client-side from
 * two cost-per-km calls. There is no backend trend endpoint; the delta is
 * derived rather than fetched, so `direction` is explicitly 'unknown'
 * when either side is null (a period with no distance has an undefined
 * cost-per-km, not a zero one -- see the backend's null-not-zero rule).
 */
export interface CostPerKmTrend {
  current: number | null;
  previous: number | null;
  deltaPct: number | null;
  direction: 'up' | 'down' | 'flat' | 'unknown';
}

/** Human labels for allocation cost categories, used by the breakdown table and chart legend. */
export const COST_CATEGORY_LABELS: Record<AllocationCostCategory, string> = {
  fuel: 'Fuel',
  maintenance: 'Maintenance',
  expense: 'Expenses',
  depreciation: 'Depreciation',
  insurance: 'Insurance',
  other: 'Other',
};

export const FX_POLICY_LABELS: Record<FxPolicy, string> = {
  'transaction-date': 'Transaction-date rate',
  'period-average': 'Period-average rate',
};

export const DEPRECIATION_METHOD_LABELS: Record<DepreciationMethod, string> = {
  'straight-line': 'Straight line',
  'declining-balance': 'Declining balance',
  'units-of-production': 'Units of production',
};
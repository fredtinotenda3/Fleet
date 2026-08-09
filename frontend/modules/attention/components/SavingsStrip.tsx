// frontend/modules/attention/components/SavingsStrip.tsx
//
// Month-to-date realised-vs-modelled savings strip. Reads the value
// ledger's own summary (LedgerExportData.summary) rather than
// recomputing totals client-side from `entries` -- entries can be
// truncated (see `truncated`/`exportCap`) but the summary is always
// computed over the full matched set server-side.

'use client';

import { TrendingUp, TrendingDown, Minus, AlertTriangle, RefreshCw } from 'lucide-react';
import { Spinner } from '@/frontend/shared/ui/feedback/spinner';
import { Button } from '@/frontend/shared/ui/primitives/button';
import { formatCurrency } from '@/shared/utils/currency.utils';
import { formatMoney } from '@/frontend/modules/finance/utils/money.utils';
import { cn } from '@/lib/utils';
import type { LedgerExportData } from '../types';
import type { GLReconciliationReport } from '@/frontend/modules/finance/types';

interface SavingsStripProps {
  data: LedgerExportData | undefined;
  isLoading: boolean;
  isError: boolean;
  onRefresh: () => void;
  /**
   * Month-to-date allocation-ledger total (finance's actual posted
   * cost, org-wide). Optional and rendered separately from the
   * modelled/realised savings figures above -- a caller without
   * FINANCE_VIEW gets isAllocationError and simply doesn't see this
   * figure, the rest of the strip is unaffected.
   */
  allocationReport?: GLReconciliationReport;
  isAllocationLoading?: boolean;
  isAllocationError?: boolean;
}

function VarianceIndicator({ variance }: { variance: number }) {
  if (variance > 0) {
    return (
      <span className="inline-flex items-center gap-1 text-success">
        <TrendingUp className="h-4 w-4" aria-hidden="true" />
        {formatCurrency(variance)} ahead of model
      </span>
    );
  }
  if (variance < 0) {
    return (
      <span className="inline-flex items-center gap-1 text-danger">
        <TrendingDown className="h-4 w-4" aria-hidden="true" />
        {formatCurrency(Math.abs(variance))} behind model
      </span>
    );
  }
  return (
    <span className="inline-flex items-center gap-1 text-muted-foreground">
      <Minus className="h-4 w-4" aria-hidden="true" />
      On model
    </span>
  );
}

export function SavingsStrip({
  data,
  isLoading,
  isError,
  onRefresh,
  allocationReport,
  isAllocationLoading,
  isAllocationError,
}: SavingsStripProps) {
  const showAllocation = !isAllocationLoading && !isAllocationError && allocationReport;
  return (
    <div className="flex flex-col gap-3 px-4 py-3 border rounded-lg surface-card sm:flex-row sm:items-center sm:justify-between">
      <div className="flex items-center gap-2 shrink-0">
        <h3 className="text-body-sm font-semibold text-foreground">Month-to-date value</h3>
        <button
          type="button"
          onClick={onRefresh}
          aria-label="Refresh month-to-date value"
          disabled={isLoading}
          className="flex items-center justify-center w-6 h-6 transition-colors rounded-sm text-muted-foreground hover:bg-muted hover:text-foreground disabled:opacity-50"
        >
          <RefreshCw className={cn('h-3.5 w-3.5', isLoading && 'animate-spin')} aria-hidden="true" />
        </button>
      </div>

      <div className="flex flex-wrap items-center gap-x-6 gap-y-2 text-body-sm">
        {isError ? (
          <div className="flex items-center gap-2 text-muted-foreground">
            <AlertTriangle className="w-4 h-4 text-danger" aria-hidden="true" />
            Couldn&apos;t load month-to-date savings.
            <Button size="sm" variant="outline" onClick={onRefresh}>
              Retry
            </Button>
          </div>
        ) : isLoading ? (
          <div className="flex items-center gap-2 py-1">
            <Spinner className="w-4 h-4" />
          </div>
        ) : !data || data.summary.totalPostings === 0 ? (
          <p className="text-muted-foreground">
            No resolved fuel-fraud or expense-anomaly items posted to the ledger this month yet.
          </p>
        ) : (
          <>
            <div>
              <span className="text-muted-foreground">Modelled&nbsp;</span>
              <span className="font-semibold text-foreground">
                {formatCurrency(data.summary.totalModelledAmount)}
              </span>
            </div>
            <div>
              <span className="text-muted-foreground">Realised&nbsp;</span>
              <span className="font-semibold text-foreground">
                {formatCurrency(data.summary.totalRealisedAmount)}
              </span>
            </div>
            <div className="font-medium">
              <VarianceIndicator variance={data.summary.totalVariance} />
            </div>
            <div className="text-muted-foreground">
              {data.summary.totalPostings} posting{data.summary.totalPostings === 1 ? '' : 's'}
              {data.truncated && ' (capped)'}
            </div>
          </>
        )}

        {showAllocation && (
          <div className="border-l border-border pl-6">
            <span className="text-muted-foreground">Allocated&nbsp;</span>
            <span className="font-semibold text-foreground">
              {formatMoney(allocationReport.totalPlatform, allocationReport.reportingCurrency)}
            </span>
            <span className="ml-1 text-caption text-muted-foreground">from the GL ledger</span>
          </div>
        )}
      </div>
    </div>
  );
}

// frontend/modules/finance/pages/GLReconciliationPage.tsx
//
// /reports/gl-reconciliation -- platform totals from the allocation
// ledger against the customer's own general-ledger figures, per account,
// with the gap named.
//
// This page is deliberately unflattering. An account with no GL
// submission renders as "Not submitted" with an empty GL cell, never as a
// zero-variance match, because "we agree" and "we never checked" must not
// look the same -- the backend already models that distinction
// (glTotal: null vs a submitted 0) and the UI's job is not to smooth it
// over.

'use client';

import { useMemo, useState } from 'react';
import { Download, Printer, CheckCircle2, AlertTriangle, CircleDashed } from 'lucide-react';
import { LoadingState } from '@/shared/ui/feedback/LoadingState';
import { EmptyState } from '@/shared/ui/feedback/EmptyState';
import { Button } from '@/frontend/shared/ui/primitives/button';
import { Badge } from '@/frontend/shared/ui/data-display/badge';
import { formatMoney } from '../utils/money.utils';
import { formatDate } from '@/shared/utils/date.utils';
import { cn } from '@/lib/utils';
import { useGLReconciliation } from '../hooks/useFinance';
import { exportReconciliationCsv } from '../utils/reconciliation-export.utils';
import type { GLVarianceLine } from '../types';

/** First day of the month `monthsAgo` months back, and its last moment. */
function monthRange(monthsAgo: number): { from: Date; to: Date } {
  const now = new Date();
  const anchor = new Date(now.getFullYear(), now.getMonth() - monthsAgo, 1);
  return {
    from: new Date(anchor.getFullYear(), anchor.getMonth(), 1),
    to: new Date(anchor.getFullYear(), anchor.getMonth() + 1, 0, 23, 59, 59, 999),
  };
}

const PERIOD_OPTIONS = [
  { value: '0', label: 'This month' },
  { value: '1', label: 'Last month' },
  { value: '2', label: '2 months ago' },
  { value: '3', label: '3 months ago' },
] as const;

function StatusCell({ line }: { line: GLVarianceLine }) {
  if (line.glTotal == null) {
    return (
      <span className="inline-flex items-center gap-1.5 text-muted-foreground">
        <CircleDashed className="h-3.5 w-3.5" aria-hidden="true" />
        Not submitted
      </span>
    );
  }
  if (line.matched) {
    return (
      <span className="inline-flex items-center gap-1.5 text-success">
        <CheckCircle2 className="h-3.5 w-3.5" aria-hidden="true" />
        Matched
      </span>
    );
  }
  return (
    <span className="inline-flex items-center gap-1.5 text-warning">
      <AlertTriangle className="h-3.5 w-3.5" aria-hidden="true" />
      Variance
    </span>
  );
}

export default function GLReconciliationPage() {
  const [monthsAgo, setMonthsAgo] = useState<string>('0');
  const { from, to } = useMemo(() => monthRange(Number(monthsAgo)), [monthsAgo]);

  const { data: report, isLoading, isError } = useGLReconciliation(from, to);

  const currency = report?.reportingCurrency;
  const money = (value: number) => formatMoney(value, currency);

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">GL Reconciliation</h1>
          <p className="text-sm text-muted-foreground">
            Allocation-ledger totals against your general ledger, per account, with the variance named.
          </p>
        </div>

        <div className="flex flex-wrap items-end gap-3">
          <div>
            <label htmlFor="gl-period" className="block mb-1 text-sm font-medium">
              Period
            </label>
            <select
              id="gl-period"
              className="input-base"
              value={monthsAgo}
              onChange={(event) => setMonthsAgo(event.target.value)}
            >
              {PERIOD_OPTIONS.map((option) => (
                <option key={option.value} value={option.value}>
                  {option.label}
                </option>
              ))}
            </select>
          </div>

          <Button
            variant="outline"
            size="sm"
            disabled={!report || report.lines.length === 0}
            onClick={() => report && exportReconciliationCsv(report)}
          >
            <Download className="h-3.5 w-3.5" />
            CSV
          </Button>

          {/*
            Print-to-PDF rather than a server-rendered PDF. The backend
            route GET /api/finance/gl/reconciliation returns JSON only (no
            `format` parameter), and `pdfkit` -- what the value-ledger
            export uses -- is server-side, so a real PDF needs a small
            backend generator. Offering a fake `format=pdf` link would
            download a JSON body named ".pdf". See the changelog.
          */}
          <Button variant="outline" size="sm" disabled={!report} onClick={() => window.print()}>
            <Printer className="h-3.5 w-3.5" />
            Print / PDF
          </Button>
        </div>
      </div>

      {isLoading ? (
        <LoadingState type="table" count={6} />
      ) : isError ? (
        <EmptyState
          title="Couldn't load the reconciliation report"
          description="You may not have finance access, or the period contains no data."
        />
      ) : !report || report.lines.length === 0 ? (
        <EmptyState
          title="Nothing to reconcile for this period"
          description="No allocation postings carry a GL account code, and no GL figures have been submitted."
        />
      ) : (
        <>
          <section className="grid grid-cols-1 gap-4 sm:grid-cols-3">
            <div className="p-4 border rounded-lg surface-card">
              <p className="text-caption text-muted-foreground">Platform total</p>
              <p className="text-h3 font-semibold text-foreground">{money(report.totalPlatform)}</p>
            </div>
            <div className="p-4 border rounded-lg surface-card">
              <p className="text-caption text-muted-foreground">General ledger total</p>
              <p className="text-h3 font-semibold text-foreground">{money(report.totalGL)}</p>
            </div>
            <div className="p-4 border rounded-lg surface-card">
              <p className="text-caption text-muted-foreground">Variance</p>
              <p
                className={cn(
                  'text-h3 font-semibold',
                  Math.abs(report.totalVariance) <= report.toleranceAmount ? 'text-success' : 'text-warning'
                )}
              >
                {money(report.totalVariance)}
              </p>
              {/*
                totalVariance is totalPlatform - totalGL, which INCLUDES
                accounts with no GL submission. It is deliberately not the
                sum of the per-line variances (those are null for
                unsubmitted accounts and contribute nothing), so this
                figure can legitimately exceed what the line column adds
                up to. Saying so here prevents that looking like a bug.
              */}
              <p className="mt-1 text-caption text-muted-foreground">
                Platform minus GL, including {report.unmatchedAccountCodes.length} unreconciled account
                {report.unmatchedAccountCodes.length === 1 ? '' : 's'}
              </p>
            </div>
          </section>

          <section className="p-4 border rounded-lg sm:p-6">
            <div className="flex flex-wrap items-center justify-between gap-2 mb-4">
              <h2 className="text-sm font-medium">
                {formatDate(report.periodStart)} – {formatDate(report.periodEnd)}
              </h2>
              <div className="flex items-center gap-2">
                <Badge variant="outline">Tolerance {money(report.toleranceAmount)}</Badge>
                {report.unmatchedAccountCodes.length > 0 && (
                  <Badge variant="destructive">{report.unmatchedAccountCodes.length} unmatched</Badge>
                )}
              </div>
            </div>

            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-border text-left text-caption text-muted-foreground">
                    <th className="pb-2 pr-3 font-medium">GL account</th>
                    <th className="pb-2 pr-3 text-right font-medium">Platform</th>
                    <th className="pb-2 pr-3 text-right font-medium">General ledger</th>
                    <th className="pb-2 pr-3 text-right font-medium">Variance</th>
                    <th className="pb-2 pr-3 text-right font-medium">%</th>
                    <th className="pb-2 pl-3 font-medium">Status</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-border">
                  {report.lines.map((line) => (
                    <tr key={line.glAccountCode}>
                      <td className="py-2 pr-3 font-mono">{line.glAccountCode}</td>
                      <td className="py-2 pr-3 text-right">{money(line.platformTotal)}</td>
                      <td className="py-2 pr-3 text-right">
                        {line.glTotal == null ? (
                          <span className="text-muted-foreground">—</span>
                        ) : (
                          money(line.glTotal)
                        )}
                      </td>
                      <td
                        className={cn(
                          'py-2 pr-3 text-right font-medium',
                          line.variance != null && !line.matched && 'text-warning'
                        )}
                      >
                        {line.variance == null ? (
                          <span className="font-normal text-muted-foreground">—</span>
                        ) : (
                          money(line.variance)
                        )}
                      </td>
                      <td className="py-2 pr-3 text-right">
                        {/* null rather than Infinity when the GL figure is zero. */}
                        {line.variancePct == null ? (
                          <span className="text-muted-foreground">—</span>
                        ) : (
                          `${line.variancePct}%`
                        )}
                      </td>
                      <td className="py-2 pl-3">
                        <StatusCell line={line} />
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            <p className="mt-4 text-caption text-muted-foreground">
              Generated {formatDate(report.generatedAt, 'MMM dd, yyyy HH:mm')}. Only postings carrying a GL account
              code appear here; unmapped costs are absent from both columns.
            </p>
          </section>
        </>
      )}
    </div>
  );
}
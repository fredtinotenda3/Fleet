'use client';

import { AlertTriangle } from 'lucide-react';

/**
 * The inline "this chart could not load" body.
 *
 * ---------------------------------------------------------------------
 * WHY IT EXISTS
 * ---------------------------------------------------------------------
 * Thirty-eight chart components across seven modules shared one guard
 * shape:
 *
 *     if (error || !data || data.length === 0) return <>No data available</>
 *
 * so a failed request and a genuinely empty range rendered the same
 * sentence. "No data available" over a 500 is not merely unhelpful — it
 * is a claim about the customer's data made on the strength of a failed
 * request. An operator reads "no trips in this range", concludes the
 * telematics feed is broken, and goes looking in the wrong place; worse,
 * an empty chart in a review meeting is taken as a finding.
 *
 * The two states now render differently everywhere, and this is the
 * error half. It is deliberately a BODY, not a card: every call site
 * already has its own container (a `Card` with the chart's title, or a
 * `ChartContainer`), and replacing those would have changed 38 layouts
 * to fix a copy defect.
 *
 * `role="status"` rather than `role="alert"`: a chart that failed to
 * load is not an interruption, and several of these can appear on one
 * screen. It is announced when the user reaches it, not shouted over
 * whatever they were reading (WCAG 2.2 §4.1.3 — status messages).
 */
export function ChartLoadError({ label = 'chart' }: { label?: string }) {
  return (
    <div
      role="status"
      className="flex flex-col items-center justify-center gap-1.5 py-8 text-center"
    >
      <AlertTriangle className="w-4 h-4 text-warning" aria-hidden="true" />
      <p className="text-body-sm text-foreground">Couldn&apos;t load this {label}</p>
      <p className="text-caption text-muted-foreground">
        The request failed, so this is not a report that there is no data.
      </p>
    </div>
  );
}

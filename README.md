# Monthly Fuel & Fleet Intelligence Report -- Excel Workbook

The platform now generates a 9-sheet, professionally formatted Excel
workbook directly from live application data (no separate export
step, no manual assembly). This document explains what it is, how to
get it, and what's on each sheet. For the offline/Colab equivalent
(same structure, generated from an exported CSV instead of the live
database), see `../python-reporting/README.md`.

## How to get it

```
GET /api/fuel/monthly-intelligence-report?month=YYYY-MM&format=excel
```

Requires the `ANALYTICS_EXPORT` permission (the same permission
already used for the platform's ESG export, for consistency). Returns
the workbook as a file download (`Content-Disposition: attachment`),
scoped to your authenticated tenant/org-unit context -- you only ever
see data you're permitted to see, exactly like every other export in
the platform.

`format=json` returns the same underlying report data as JSON (useful
for building a custom view), and `format=pdf` returns the narrative
PDF report (see below). Omit `month` for the current calendar month,
or pass e.g. `month=2026-09` for a specific past month.

## Sheet-by-sheet

1. **01 Executive Summary** -- headline figures for the period: total
   fuel cost, total litres, average cost per litre, log count,
   vehicles active, overall data quality, and count of findings
   requiring attention.
2. **02 Fleet Position & MoM** -- each headline metric compared
   against the prior period: current value, prior value, change,
   change %, direction, and (where the data supports it) a possible
   explanation corroborated by other metrics in the same report --
   never an invented cause.
3. **03 Cost Drivers by Vehicle** -- every vehicle active this period,
   classified `normal` / `high_cost` (top-ranked by cost this period)
   / `abnormal_cost` (a sharp increase vs. its own prior-period
   baseline -- takes precedence when both apply). Color-coded rows.
   Includes the cost-concentration figure (what share of total cost
   the top vehicles account for).
4. **04 Driver Fuel Intelligence** -- cost and litres per driver, as
   recorded on each fuel log at the time of fuelling (see the
   transaction-time attribution note on the sheet itself). Includes
   an "Unassigned / Unknown" row rather than inventing a driver for
   logs with none recorded.
5. **05 Fuel Type Mix** -- litres and cost by normalized fuel type
   (the PART 1 fix: "Diesel"/"diesel"/"DIESEL" are now one bucket,
   not three).
6. **06 Abnormal & Exceptions** -- individual fill-ups whose volume is
   abnormal relative to that specific vehicle's own historical
   average (not a fleet-wide average).
7. **07 Financial Reconciliation** -- operational fuel total (sum of
   fuel logs) vs. the Allocation Ledger's fuel-category total for the
   period, with the variance and whether it's within the configured
   materiality threshold.
8. **08 Data Quality** -- completeness/consistency checks (missing
   driver, missing fuel type, missing odometer, suspected duplicate
   entries), each with an affected count, percentage, and severity.
9. **09 Findings & Actions** -- every finding the report generated,
   each answering What / Why / Impact / Action / How / Prevention /
   Owner (only if identifiable) / Monitor, severity-coded.

Every sheet has a frozen header row, autofilter enabled across the
full data range, and no meaningless columns.

## Every figure is labeled

Cells never show a fabricated number for something that couldn't be
computed -- they show `Unavailable — <reason>` instead. This applies
identically to the Excel workbook, the PDF, the JSON response, and the
Python toolkit's output; see `modules/fuel/reporting/
fuel-intelligence.types.ts`'s header comment for the full rationale.

## New dependency

Generating properly styled, frozen, filtered Excel workbooks required
adding `exceljs` (`^4.4.0`) as a new dependency -- the platform's
existing `xlsx` (SheetJS) dependency's free tier does not support
cell styling, frozen panes, or autofilter, all of which this
deliverable required. This is flagged here explicitly per the
project's standing instruction to disclose consequential technical
decisions rather than silently degrading output quality or silently
adding dependencies. `xlsx` itself was not removed -- it's still used
elsewhere in the platform and this change doesn't affect those call
sites.

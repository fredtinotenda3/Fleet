# Monthly Fuel & Fleet Reporting -- Operating Guide

This is the exact monthly procedure for producing the Fuel & Fleet
Intelligence report for the Director, using either of the two ways
this engagement built to produce it. Both produce the same kind of
analysis from the same kind of underlying data; use whichever fits
your workflow.

## Two ways to get the report

**Option A -- straight from the platform (recommended, fastest,
always current).** The platform now generates the report on demand
from live data. No export/import step, no Python, no Colab.

**Option B -- Python/Colab toolkit.** Useful if you want to work
offline, archive month-by-month exports outside the platform, or
prefer working in Excel/Colab. Requires exporting fuel logs from the
platform first. See `python-reporting/README.md` for full setup.

Both are described below as complete monthly procedures.

---

## Option A: In-platform report (monthly procedure)

1. Log in to the platform with an account that has the
   `ANALYTICS_EXPORT` permission.
2. Request the report for the month you're reporting on:
   - Excel workbook: `GET /api/fuel/monthly-intelligence-report?month=YYYY-MM&format=excel`
   - PDF report: `GET /api/fuel/monthly-intelligence-report?month=YYYY-MM&format=pdf`
   - (If your team has a UI page wired to this endpoint, use that
     instead of calling the API directly -- ask your platform admin
     if you're not sure.)
3. **Review before sending** (see the checklist below).
4. Send the Director the PDF (primary) and, if they want to explore
   the numbers themselves, the Excel workbook.

---

## Option B: Python/Colab toolkit (monthly procedure)

1. **Export from the platform.** Fuel module -> Export. Export the
   reporting month AND the prior month (needed for month-over-month
   comparison). Optionally also export your Allocation Ledger's fuel
   category totals for the period, to enable financial reconciliation.
2. **Open Colab.** Open `python-reporting/colab_monthly_report.ipynb`
   in Google Colab.
3. **Upload.** Follow the notebook's cells: install dependencies once,
   upload the toolkit's `src/` files once (or mount Drive -- see
   `python-reporting/README.md`), then upload your exported file(s)
   from step 1.
4. **Select the month.** Edit the `REPORT_MONTH` cell (e.g.
   `"2026-10"`) -- this is the only thing that changes every month.
5. **Run.** Run the "Generate report" cell.
6. **Review the findings inline** in the notebook (charts + findings
   list) before generating the final files -- catch anything that
   looks wrong (a data quality issue, an unexpected spike) before it
   reaches the Director.
7. **Generate/download** the Excel workbook and PDF via the notebook's
   final cells.
8. **Review the downloaded files** (see the checklist below).
9. **Give the Director** the PDF (primary) and, if useful, the Excel
   workbook.

---

## Review checklist (both options -- do this before sending anything)

- [ ] Check **Data Quality** (Excel sheet 08, or the PDF's Data
      Quality page). If it's "poor," consider noting that to the
      Director alongside the numbers, since it affects how much
      weight to put on the findings.
- [ ] Check **Findings & Actions** (Excel sheet 09, or the PDF's
      Recommended Actions page) for anything urgent that needs
      follow-up before the report goes out, not just after.
- [ ] Check **Financial Reconciliation** -- if it shows a material,
      unreconciled variance, decide whether to investigate before
      sending or flag it explicitly as an open item in your covering
      note to the Director.
- [ ] Skim for any `Unavailable` figures in the Executive Summary --
      these are honest gaps in the data (not report bugs), but the
      Director should know what wasn't measurable this period and
      why, not just see a blank.
- [ ] Confirm the reporting period in the report header matches what
      you intended (e.g. you didn't accidentally generate last
      month's report).

## Director-facing vs. internal files

**Director-facing** (send these):
- `fuel-intelligence-report-<month>.pdf` -- the narrative report. This
  is the primary deliverable -- it tells the story (what happened,
  why, what's driving it, what needs attention, recommended actions,
  prevention, what to monitor next month).
- `fuel-intelligence-report-<month>.xlsx` -- the full data workbook,
  for a Director who wants to explore the underlying numbers
  themselves, sort/filter vehicles or drivers, or hand a sheet to
  someone else for follow-up.

**Internal / supporting** (keep for your own records, don't need to
send unless specifically asked):
- `charts/*.png` -- individual chart images, useful if you're building
  a slide deck or a different document.
- `csv/*.csv` -- raw supporting data for further analysis in a
  spreadsheet tool.
- Your `data/` exports -- keep as your own audit trail of what went
  into a given month's report, but these are raw exports, not a
  finished deliverable.

## What this report will (and won't) tell you

The report distinguishes **FACT** (directly recorded), **CALCULATED**
(derived from recorded data), **ESTIMATED**, **UNAVAILABLE**
(explicitly, with a reason), and **DATA QUALITY ISSUE** throughout.
It will never invent a number, a cause, or a trend to fill a gap --
where the data doesn't support a conclusion, the report says so
explicitly rather than guessing. This is deliberate: a wrong "the fuel
cost increase is due to X" is worse for decision-making than an
honest "cost increased; the available data doesn't tell us why," and
the report is built to never cross that line.

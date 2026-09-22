# Decision: how a Vansales row is periodized when posted

**Status: SHIPPED — Option A, `TOTAL` as the posted amount.** Authorized in the "OLIVINE GROUP — CONTINUATION FROM PHASE O2/O3/O4" brief ("Vansales: cost category = transport-retainer. Choose the most standard, least-invasive periodization rule... Do not block implementation waiting for Olivine"), which explicitly reversed the earlier escalation and authorized an autonomous choice. `TransportCostPostingService` now posts Vansales rows under `transport-retainer`; see `PHASE_O2_O3_O4_SUMMARY.md`'s Vansales-posting section for the file list, test results, and the January 2026 reconciliation run.

## Real-data finding from the January 2026 reconciliation (read this before assuming Vansales is "live" for Olivine)

Running the shipped implementation against the real `TRANSPORT_COST_JANUARY_2026.xlsx` posted **$0.00** for January — not a bug, a fact about the source data. Of the sheet's 46 Vansales rows, only **one** has a `TOTAL` cell populated (row 47, `55,600`), and that one row is otherwise blank (no payer, no truck) so it fails import validation for an unrelated reason and never reaches posting. Meanwhile **42 of the 46 rows have `MONTHLY COST BEFORE VAT` populated**, and 44 have at least one `WEEK1`–`WEEK4` cell populated — real retainer figures sitting in the sheet that Option A, by design, never posts, because `TOTAL` specifically was decided as the only authoritative figure (see the Decision above and Section I of the original audit).

This is not a reason to silently start posting `MONTHLY COST BEFORE VAT` instead — that would reopen and reverse the already-made "TOTAL is authoritative" decision unilaterally, exactly what this document exists to avoid. It IS a reason to flag, explicitly: as implemented, Vansales posting will report ~$0 for every month whose `TOTAL` column is this sparse, which may not be the useful outcome Olivine expects from "post the retainer cost." Two honest paths forward, neither implemented here:
- Confirm with Olivine that `TOTAL` should in fact be populated going forward (a source-data fix, not a code fix) — the sheet's own column layout suggests `TOTAL` is meant to be a formula/rollup that simply wasn't filled in for most of January's rows.
- Or revisit this decision entirely (a new Decision/Reason/Assumption/Reversibility entry, not a silent code change) if Olivine confirms `MONTHLY COST BEFORE VAT` is in practice the more reliable column.

Either way, the plumbing is fully verified and correct — see the reconciliation run below, which explains 100% of the workbook's Vansales TOTAL sum with zero unexplained residual. The $0 posted result is `pending-amount`/`rejected`, faithfully reported, never a fabricated number.

**Decision:** one `AllocationPosting` per Vansales row per calendar month, with the month supplied explicitly at import time (a required `periodMonth` field, e.g. `'2026-01'` — never inferred from the sheet-tab's free-text name), `amount` = the row's own `TOTAL` column (not `MONTHLY COST BEFORE VAT`, not a re-summed `WEEK1`–`WEEK4`, since those weekly cells are a known merged-cell artifact per the original audit).
**Reason:** matches how a retainer is actually paid — a monthly commitment, not a per-shipment charge (the audit's own Section B framing) — reuses the existing posting machinery with no new `AllocationRule` or schema change, and never fabricates a period the way a calendar-week decomposition would have to.
**Assumption:** the person running a Vansales import batch knows and states which month it covers, at the same trust level `sourceFileName` already carries. If this assumption turns out wrong in practice (batches spanning partial months, say), it is the next thing to revisit.
**Reversibility:** a posting made against the wrong `periodMonth` reverses and re-posts through the existing `allocationService.reversePosting()` path, identical to any other correction in this ledger — no schema-breaking change, no historical mutation.

## Why this needs a decision at all

Every other posting in this system is anchored to a real, per-row transaction date (a 3rd Party delivery's own Date cell). A Vansales row has no such date — it represents a fixed weekly/monthly retainer for a truck, and the source sheet carries the amount (`WEEK1`–`WEEK4`, `MONTHLY COST BEFORE VAT`, `TOTAL`) but no date column at all. `AllocationPosting.periodStart`/`periodEnd` are required fields; posting a Vansales row means deciding what period it covers, and the only signal available today is the sheet's own name/tab label (e.g. "JAN-26 Vansales"), which is free text, not structured data, and is exactly the kind of thing the hard "never fabricate" constraint says not to silently parse and trust.

## Options

**Option A — one posting per row per month, with an explicitly supplied period.**
The importer states which calendar month a Vansales batch covers (a required field on the import, e.g. `periodMonth: '2026-01'`) rather than the system inferring it from the sheet-tab text. `amount` = the row's own `total` (Section I of the audit already recommends treating `TOTAL` as authoritative over re-summing `WEEK1`–`WEEK4`, since blank weekly cells are a known merged-cell artifact). One `AllocationPosting` per row, `allocationRule: 'direct'`, `periodStart`/`periodEnd` spanning the whole stated month — structurally identical to how a 3rd Party row posts today, just with a human-declared period instead of a row-supplied date.
*Trade-off:* requires a small, one-time addition to the import command/handler/UI (a period picker on the Vansales import screen) and a human to get the month right — but it never guesses, and it fits the existing posting machinery with no new concepts.

**Option B — four weekly sub-postings per row, one per `WEEK1`–`WEEK4`.**
Each week's amount posts separately, with `periodStart`/`periodEnd` set to an assumed 7-day window within the stated month (e.g. week 1 = days 1–7).
*Trade-off:* finer-grained, but requires INVENTING calendar week boundaries the source data never states (is "week 1" the 1st–7th, or the first Monday–Sunday, or the first partial week of the month?), and the audit already flags that blank `WEEK1`–`WEEK4` cells are a known merged-cell artifact — a decomposition this fragile risks silently misdating or under-posting real cost, for a category that gains nothing from the extra granularity since cost-per-km/cost-per-tonne is already excluded from this entire cost category regardless of periodization choice.

**Option C — do not post Vansales at all; keep it as source evidence only, indefinitely.**
Leaves things exactly as they are today: Vansales rows import cleanly (Phase O1) and are visible via `GET /api/transport-cost/source-records`, but never post to the ledger.
*Trade-off:* zero risk of fabrication, but the retainer cost never appears in any ledger-sourced total or the O4 report — a real cost Olivine is paying stays permanently invisible to the platform.

## Why Option A over B or C

Option A was the recommendation before this was escalated, and is what's now decided. Option B (four weekly sub-postings) was rejected because it requires INVENTING calendar week boundaries the source data never states, on top of the already-known merged-cell artifact in the `WEEK1`–`WEEK4` cells — a decomposition fragile enough to risk silently misdating or under-posting real cost, for no reporting benefit (cost-per-km/cost-per-tonne is excluded from this category regardless of periodization granularity). Option C (evidence-only, never post) remains the safe fallback if this decision is ever revisited, but leaves a real cost Olivine is paying permanently invisible to the ledger and the O4 report — Option A gets the same safety without that cost.

## Implementation notes for the next slice

This is a small, independently reviewable slice on top of the existing `TransportCostPostingService` — no other part of O2/O3/O4 depends on it. It needs: a required `periodMonth` field on the Vansales import path (command/handler/UI), posting logic in `TransportCostPostingService` for the `transport-retainer` category structurally parallel to the existing 3rd Party posting path (not a copy — see that service's header for how it documents each divergence), and a January 2026 Vansales reconciliation against the workbook's own Vansales total, the same discipline used for 3rd Party in `DATA_QUALITY_REPORT_JANUARY_2026.md`.

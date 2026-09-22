# Decision needed: how should a Vansales row be periodized when posted?

**Status: escalated, not decided.** This is a product/business decision about how Olivine's own data should be represented in the ledger, not an engineering implementation detail — it is not implemented here, and no periodization logic has been written. `TransportCostPostingService` currently refuses every Vansales row with `status: 'skipped', reason: 'unsupported-sheet-family'` (see that service's header) rather than guessing.

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

## Recommendation

**Option A.** It matches how a retainer is actually paid (a monthly commitment, not a per-shipment charge — the audit's own Section B framing), reuses the existing posting machinery with no new `AllocationRule` or schema change, and — critically — never fabricates a period the way Option B's calendar-week guess would. It costs one small addition: a required "which month does this batch cover" input at Vansales import time, shown to and confirmed by the person doing the import, the same way `sourceFileName` already is. Option C is the safe fallback if Olivine would rather leave Vansales as evidence-only for now; it requires no further engineering work either way.

## What we need from you

Pick A, B, or C (or propose a variant) — and if A, confirm that `TOTAL` (not `MONTHLY COST BEFORE VAT` or a re-summed `WEEK1`–`WEEK4`) is the figure that should post as `amount`. Once decided, this is a small, independently reviewable slice on top of the existing `TransportCostPostingService` — no other part of O2/O3/O4 depends on it.

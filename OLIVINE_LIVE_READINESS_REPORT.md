# Olivine live readiness & October 1, 2026 cutover — final report

## 1. What was changed

Six real production defects fixed, plus a demo dataset and cutover
tooling prepared. Full file list in the ZIP's `MANIFEST.md`. Summary:

1. Transporter/Truck registration "+ Add New" was permanently absent on
   every manual-entry form (search-only, `onCreateNew` never wired) —
   now consistently shown, review-gated.
2. The primary "Transport Cost" nav link pointed at the old, superseded
   O4 report page instead of the Command Centre.
3. `reset-business-data.ts` did not know about the transport-cost
   module's 8 collections, so it would refuse to run against any
   database containing transport-cost data.
4. `VANSALES_PERIODIZATION_DECISION.md`'s status line incorrectly said
   Vansales posting was unimplemented (it is implemented).
5. A synthetic demo dataset (64 rows across 4 families) was built,
   validated against the real importer, and documented.
6. A step-by-step cutover/reset procedure was documented, reusing
   (rather than duplicating) existing, tested platform tooling.

## 2. What was already working

- Slice 1 (companies as structured data), Slice 2 (multi-load, manual
  entry only, by design), the Slice 3 search-pagination fix from the
  prior pass, Slice 4's Command Centre analytics (no fabricated metrics
  found), Slice 5's operational records/detail/audit/actions, and the
  Review Queue — all re-verified this pass, no regressions found.
- VanSale: manual entry, master-data search, import, validation, review,
  posting (`transport-retainer` category, `TOTAL` as the posted amount,
  Option A periodization), and Command Centre visibility all confirmed
  working end-to-end.

## 3. Fixes made — how Transporter/Truck Add New now works

Root cause: `TRANSPORTER_SEARCH_SELECT`/`VEHICLE_SEARCH_SELECT` (the
column configs used by every manual-entry form) never set `onCreateNew`.
`SearchCreateSelect`'s own "+ Add New" button is gated on
`Boolean(onCreateNew)` — with it always `undefined`, the button was
never rendered for these two fields, on any form, while Customer/
Destination (which do set `onCreateNew`) showed it on the very same
forms. Not a bug that appeared "inconsistently" — it was consistently
absent; the inconsistency the client observed was Customer/Destination
having it and Transporter/Truck not.

Fix (`frontend/modules/transport-cost/utils/transporter-vehicle-search-select.utils.ts`):
- **Transporter**: `onCreateNew` now calls the existing
  `transportCostApi.requestNewTransporter(name)` — the same
  review-gated flow (`reviewStatus: 'needs-review'`) `EditRecordDialog`
  already used. Never a synchronous confirmed create.
- **Truck registration**: because `ContractedVehicle.transporterPartnerId`
  is required server-side (a vehicle cannot exist without a transporter),
  "+ Add New Truck" always renders (parity with the client's own
  mockup), but resolving it calls `requestNewVehicle` with the
  **just-resolved transporter's id** — captured via a new
  `onResultSelected` hook fired whenever an existing or newly-created
  transporter is committed. If no transporter has been resolved yet,
  clicking "+ Add New Truck" fails with a clear, inline message ("Pick
  or add a transporter above first") rather than silently linking the
  new truck to the wrong transporter or to none. The resolved
  transporter is invalidated the instant the operator types something
  different into the Transporter field, so a stale id can never survive
  an edit. Each of the three families (3rd Party, Vansales, Depot STO)
  gets its own isolated closure — resolving a transporter in one
  family's modal never leaks into another's.

## 4. VanSale

Confirmed fully enabled end-to-end: open → enter manually → search/
Add New master data → import Excel → validate → review errors → post
(`transport-retainer` category) → see in Command Centre. The one
pre-existing, deliberate scope decision: Vansales was excluded from the
**old** standalone O4 report page (superseded by the Command Centre,
which does include it) — moot now that the primary nav link goes
straight to the Command Centre.

## 5. Transporter lookup

Unchanged from the prior verification pass: server-side search,
`hasMore` truncation signal, tenant-scoped, confirmed-only. This pass
adds the "+ Add New" affordance on top of that existing, working search.

## 6. Vehicle lookup

Same as above, plus: vehicle search now narrows to the resolved
transporter's own fleet once one is known (a search-quality
improvement; search itself was never blocked on having a transporter
first — only creation is).

## 7. Add New

- Customer/Destination: unchanged — synchronous, confirmed create.
- Transporter/Vehicle: now available on every manual-entry form (see
  §3), review-gated, never bypassing the O2 normalization queue. Vehicle
  creation requires a resolved transporter, by hard backend contract
  (not a new restriction this pass introduced — `RequestNewVehicleCommand`
  already required it; this pass is what makes the manual-entry form
  able to satisfy it).
- Driver (Depot STO): **not** wired to any master-data system. This
  field has no controlled Driver entity anywhere in the codebase — it is
  plain provenance text on the Depot STO row, by pre-existing design.
  Per the client's own "Driver where the existing model supports it,"
  the existing model does not, so nothing was invented here.

## 8. Security

No tenant/org-unit isolation, authentication, or permission logic was
touched. The new request-new-transporter/vehicle calls from manual-entry
forms use the exact same `transportCostApi.requestNewTransporter`/
`requestNewVehicle` client methods and `TRANSPORT_COST_NORMALIZE`-gated
server routes `EditRecordDialog` already used — no new attack surface.
`tests/security/reset-business-data-classification.spec.ts` (62 tests,
8 new) guards the reset script's classification against ever clearing
master data or preserving operational data by mistake.

## 9. Tests — exact numbers

- `npm run type-check` (`tsc --noEmit`): **clean, 0 errors.**
- `npm test`: **197 suites, 3443 tests, all passed.**
- `npm run test:security`: **107 suites, 1796 tests, all passed.**
- `npm run test:e2e`: **14/14 passed.**
- `npm run test:performance`: **13/13 passed.**
- `npm run test:integration`: **21 skipped** — no live MongoDB reachable
  from this sandbox (`fastdl.mongodb.org` blocked at the network proxy).
  Stated honestly, not worked around.
- `npm run lint` (files this pass touched): **0 errors.** One
  pre-existing, unrelated warning remains
  (`scripts/reset-business-data.ts`'s unused `eslint-disable no-console`
  directive) — not introduced by this pass, left as-is since it carries
  no risk and touching it is outside this pass's scope.
- `npm run build`: **succeeds**, full route manifest present including
  `/transport-cost/command-centre`, `/transport-cost/import`,
  `/transport-cost/report` (now a 1.07 kB redirect), `/transport-cost/review`,
  `/transport-cost/operations/[id]`. Required a temporary, backed-up,
  byte-identical-reverted Google Fonts substitution to build in this
  network-restricted sandbox — confirmed via `md5sum` and `diff` after
  reverting, not part of the delivered fix.
- New test coverage added this pass: 8 tests
  (`transporter-vehicle-search-select.utils.spec.ts`), 6 tests
  (`demo-data-import-validation.spec.ts` — runs every demo-data row
  through the real import validation code), 8 assertions added to the
  reset-classification suite.

## 10. Production verification

**VERIFIED LOCALLY/STATICALLY**: every fix, via code reading, a clean
type-check, a clean production build with the correct route manifest,
and tests running the real business logic (including the demo data
literally passing through the real `ImportTransportCostHandler`
validation methods).

**NOT verified in production**: an actual browser click-through against
Olivine's live database — this sandbox cannot reach it. Before the
demo, manually walk the path in `OLIVINE_DEMO_DATA_README.md` once in
the real environment.

## 11. Remaining gaps / deliberate non-changes

- **Depot STO "Driver" has no master-data lookup** — no such system
  exists in this codebase; inventing one would be new architecture,
  not a fix. Flagged, not built.
- **Multi-load demonstration cannot go through bulk Excel import** — the
  real importer has no reliable signal to group rows into one operation.
  This is pre-existing, documented (`OLIVINE_LIVE_OPERATING_MODEL_GAP_ANALYSIS.md`),
  and unchanged; the demo walkthrough uses "Enter Manually" for this
  instead, exactly as the architecture requires.
- **The old O4 report page/route were redirected, not deleted** — for
  reversibility. `TransportCostReportService`, `VehicleDrillDownDialog`,
  and their API routes remain in place (shared with, or independently
  used by, other working code) and were not touched.
- No fabricated analytics were added anywhere — confirmed clean, as in
  the prior pass.

## 12. Which analytics/charts the demo data populates

Real, computed-from-data charts the 72-row demo dataset will populate:
cost trend (daily/weekly/monthly), cost by company (all three), cost by
category (all four families), cost by transporter, cost by vehicle, cost
by destination, cost by customer, cost per operation. Deliberately
**not** populated (no reliable supporting data, by design):
cost-per-km, distance, ROI, savings, margin, productivity/utilization —
the app shows "Unavailable" for these, and the demo data does not try to
manufacture a value.

**Revised 2026-09-28**: the dataset's dates were re-anchored to
1 Aug – 28 Sep 2026 (today), with explicit today/yesterday anchor rows, so
every one of these charts renders real data under the Command Centre's
*default* filters (Today/Yesterday/This Week/This Month/Previous Month) —
not only under a manually-set Custom Range. See
`OLIVINE_DEMO_DATA_README.md`'s revision note for why the original
October-dated version needed this correction.

## 13. Exact steps before Olivine arrives

1. Read `OLIVINE_CUTOVER_PROCEDURE.md` §1–3 (dry run first) if a reset
   of historical/dev data is wanted before the demo.
2. Upload the four `demo-data/olivine_demo_*.xlsx` files (Transport Cost
   → Import Data), post them. For Vansales, set the period-month picker
   to `2026-09`.
3. Walk `OLIVINE_DEMO_DATA_README.md`'s "Demo walkthrough" once, live, in
   the real environment, before Olivine arrives.

## 14. Exact steps for replacing demo data with real live data

`OLIVINE_CUTOVER_PROCEDURE.md` §5: re-run the same dry-run-then-`--confirm`
reset against Olivine's tenant to clear the demo rows (master data
created/confirmed during the demo is preserved, correctly — see that
section for why), then import Olivine's real live operating data through
the same pipeline.

## ZIP output

Attached separately: `olivine-live-readiness-oct1-cutover.zip` — 21
changed/new files (17 source/test files + 4 documentation files),
preserving original directory structure, plus a `MANIFEST.md`. No full
project export, no `node_modules`, `.next`, `.git`, or `coverage`. The
5 demo-data `.xlsx` files are included in the same ZIP under
`demo-data/`.

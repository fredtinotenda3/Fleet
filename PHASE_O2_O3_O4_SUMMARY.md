# Phase O2 / O3 / O4 — delivery summary

Built against the Phase O2 Spec and Phase O3 Spec tabs on the audit doc, and the confirmed decisions from the brief: currency handling seeded as a flagged provisional USD default, org-unit attribution left on O1's existing interim rule (not re-decided), fuzzy-match suggest-only, no hard joins across 3rd Party / Swift / PODs, no fuel or cost-per-km anywhere, `TransportCostPostingService` kept parallel to `AllocationService` rather than retrofitting `AllocationPosting`.

## What shipped

**Phase O2 — normalization review.** `ContractedVehicle` and `TransportPartner` master data, a shared `tblnormalizationreviewitems` review queue, and `NormalizationMatcherService` / `ConfirmReviewNewHandler` / `ConfirmReviewMatchHandler` / `RejectReviewItemHandler`. Every distinct transporter name and vehicle registration seen in an import is either matched against an existing confirmed identity or filed for a human to confirm as new or merge — the matcher never auto-merges a fuzzy candidate itself, only scores and suggests one.

**Phase O3 — posting to the Allocation Ledger.** `TransportCostVatConfigService` resolves currency and VAT basis per import batch or sheet family (batch-scoped confirmed → family-wide confirmed → provisional DEFAULT), and `TransportCostPostingService` posts each confirmed, amount-present 3rd Party source row to `tblallocationledger` under a new `'transport-cost'` cost category and `'tbltransportcostsourcerecords'` source collection, reusing the ledger's existing append-only/idempotency/reversal machinery. A correction (the source row's Amount changes after posting) reverses the old posting and posts a new one — the ledger never mutates a row in place, and a versioned idempotency key (`baseKey:v1`, `:v2`, …) lets a corrected row re-post without colliding with `tblallocationledger`'s unique `{tenantId, idempotencyKey}` index. `TransportCostPostingService` calls `allocationLedgerRepository.append()` directly rather than going through `AllocationService.postAllocation`, because that method's vehicle resolution is hard-wired to `tblvehicles` (Olivine-owned, telemetry-tracked vehicles) and would reject every contracted third-party vehicle; it safely reuses `AllocationService.reversePosting` for corrections, since that method never touches `tblvehicles`.

**Phase O4 — the report/drill-down screen.** `TransportCostReportService.getAllocationReport` groups postings — postings only, never raw source records — by business stream and then by vehicle for a period, flags whether any of that period's rows are still pending an Amount, and refuses to sum two different reporting currencies into one figure. `getPostingsForVehicle` drills down to the individual postings behind one vehicle's total. The frontend is one screen: `/transport-cost/report` (`TransportCostReportPage`), a month picker defaulting to January 2026, Business Stream summary cards, a Vehicle/Transporter table sorted by net amount, a pending-rows banner, and a click-through drill-down dialog listing every posting (including reversals) for the selected vehicle.

## Hard constraints honored

- Never fabricates or zero-fills a missing amount, tonnage unit, or currency; renders `null` explicitly through to the UI (a pending-amount row posts nothing, and the screen's banner says so).
- No hard joins across 3rd Party / Swift / PODs. PODs is untouched.
- No fuel or cost-per-km logic anywhere in this slice.
- Fuzzy transporter/vehicle matching suggests only; `ConfirmReviewNewHandler`/`ConfirmReviewMatchHandler` are the only write paths that create or attach an identity, and both require an explicit human confirmation.
- `TransportCostPostingService` is a new, parallel service — `AllocationPosting`'s shape and `AllocationService`'s existing call paths are unchanged.

## Scope note: Vansales is not posted in this slice

O3 posts 3rd Party rows only. A Vansales row's `date` is always `null` — it is a fixed monthly retainer, not a dated transaction — and posting it into a `periodStart`/`periodEnd`-keyed ledger without a real per-row date would mean inventing one. Rather than fabricate a period from the sheet-name text, Vansales posting is deferred; the rows import cleanly (Phase O1) and sit ready for a follow-up decision on how a retainer should be periodized.

## Still open — needs your decision

- **Org-unit attribution for contracted vehicles.** Left on O1's existing interim rule (resolved from the importing user's own scope) across O2/O3/O4, per your instruction not to invent a new rule. Marked provisional in code comments and here, same as O1. Still needs a real decision before this can be treated as settled.
- **Currency: provisional USD default.** Neither sheet states a currency. Per your "seed USD as a flagged DEFAULT" decision, `TRANSPORT_COST_VAT_CONFIG_DEFAULTS` seeds `currency: 'USD'` for both sheet families, marked `isProvisionalDefault: true` everywhere it's surfaced (code comments, the resolver's own return type, this README). It posts real numbers today and is correctable by writing a confirmed `TransportCostImportVatConfig` row — a config change, not a code change — once Olivine confirms the real currency.
- **Depot STO sign-off columns.** Not built in this slice. The 3rd Party import path accepts the columns the audit identified as stable; Depot STO's sign-off columns were out of scope for O2/O3/O4 and remain open.
- **January 2026's business stream is "unattributed."** Verified directly against the source workbook: the January "JAN-26 3rd Party" and "JAN-26 Vansales" sheets carry no business-stream indicator anywhere (no per-stream tab split, unlike some later months, e.g. "MAY -26 3rd Party Olivine" vs. "...Hypery"; no explicit column). `ContractedVehicle.businessStream` is only ever set when a human reviewer supplies one while confirming an O2 review item — never inferred — so every vehicle first seen in January's data shows under "unattributed" until a reviewer sets a stream by hand, or a later month's data reveals it. This is the honest state of today's data, not a bug; the Stream → Vehicle hierarchy is fully built and will populate the moment a stream is actually known.
- **Four source rows carry a year typo.** Rows 93, 96, 97, 105 on the January 3rd Party sheet have Date cells reading `30.01.25` / `31.01.25` (year 2025, not 2026) — Amount $642 / $688 / $1,070 / $260. The system parses a row's own Date cell literally rather than assuming the sheet tab's nominal month, so these four post correctly to January **2025**, not January 2026, and are absent from the January 2026 screen. Worth a one-line correction in the source file if these were meant to be `.26`.

## Verification

**`tsc --noEmit`:** clean, no errors, across the whole codebase (including this slice's 25 new/changed files).

**Test suite:** 176 of 177 suites, 3,108 of 3,129 tests passing (21 pre-existing skips, unrelated to this work). 26 new tests across three new spec files:

- `tests/unit/transport-cost/transport-cost-posting.service.spec.ts` (14 tests) — happy-path posting, idempotent replay, re-import-twice zero-duplicates, correction (reversal + new posting, original untouched), race-guard conflict, every refusal path (null amount, Vansales, unresolved vehicle, unresolved currency, unresolved FX, out-of-scope, not-found), best-effort batch posting.
- `tests/unit/transport-cost/transport-cost-vat-config.service.spec.ts` (6 tests) — DEFAULT fallback, per-family VAT basis, confirmed override, batch-scoped-wins-over-family, partial confirmation, unconfirmed-row-ignored.
- `tests/unit/transport-cost/transport-cost-report.service.spec.ts` (6 tests) — stream/vehicle grouping, mixed-currency never summed, pending banner independent of the total, reversed posting nets to zero, drill-down.

A pre-existing gap in the shared `tests/helpers/fake-collection.ts` test double was found and fixed along the way (it silently dropped `$addToSet` updates and mis-normalized `_id: {$in: [...]}` filters — both now throw loudly on anything genuinely unsupported instead of quietly returning the wrong rows, matching that file's own stated policy). All 3,108 tests, including every pre-existing one, still pass after the fix.

**Re-import-twice check** (`scripts/verify-phase-o3-o4.ts`, run against the real `TRANSPORT_COST_JANUARY_2026.xlsx`): posting the same import batch three times in a row produced 73 postings after the first run and exactly 73 after the second and third — **zero duplicate postings**.

**Corrected-row check:** mutated one posted row's Amount from 120 to 121 and re-posted — produced a reversal posting (-120) and a new posting (121); reverted to 120 and re-posted again — produced a second reversal (-121) and a third posting (120). The original posting's stored document was **byte-identical** before and after both corrections — confirmed programmatically, never mutated in place.

**January 2026 reconciliation**, real Olivine numbers, 3rd Party sheet:

| | Amount |
|---|---:|
| Workbook's own January 3rd Party total (raw sheet sum) | 67,812.00 |
| Posted to the Allocation Ledger for January (net, reversal-aware) | 29,242.00 USD |
| **Difference** | **38,570.00** |

Fully explained:

| Category | Rows | Amount |
|---|---:|---:|
| Blank Amount cell — never zero-filled, never posted (pending) | 30 | — |
| Rejected at import validation (bad date / missing registration / known-invalid transporter label) | 7 | 35,283.00 |
| Flagged as a likely duplicate of an already-imported row | 12 | 627.00 |
| Vehicle identity not yet resolved to a confirmed `ContractedVehicle` | 0 | — |
| Posted successfully, but the row's own Date cell parses outside January 2026 (the 4-row year typo above) | 4 | 2,660.00 |
| **Unexplained residual** | | **0.00** |

Zero unexplained residual. Every dollar of the gap between the workbook's raw total and what's posted is accounted for by name.

## The O4 screen

`/transport-cost/report` — `TransportCostReportPage`:

1. **Header + month picker.** Title, a one-line description ("sourced from posted Allocation Ledger entries only"), and a month `<select>` defaulting to **January 2026**, populated from every month that actually has postings (`GET /api/transport-cost/report/months`) plus January itself even if it has none yet, so the client's own requested default is never silently missing from the list. A link across to the import screen.
2. **Pending-rows banner** (amber, `AlertTriangle` icon) — shown whenever the selected period has rows still missing an Amount: "17 rows in January 2026 have no Amount yet... The totals below are real, but not the final total for this month once those rows are filled in." Absent entirely when there's nothing pending, never a decorative "0 pending."
3. **Mixed-currency banner** (same style) — shown only if a period's postings span more than one reporting currency; when shown, every figure on the page is a per-currency subtotal, never a cross-currency sum.
4. **Business Stream summary cards** — one card per stream (for January 2026 today, real data has a single "Unattributed" bucket — see the open item above), each showing its net amount, vehicle count, and posting count.
5. **Vehicle table** — Registration, Transporter, Business stream (badge), Postings, Net amount, sorted highest-to-lowest. Real January 2026 top five: AGL8230/SIGHTSCORE $3,182.00 (7 postings), AGJ6242/SIGHTSCORE $1,904.00 (5 postings), AGL2725/FROST $1,674.00 (2 postings), AFJ5203/SHARMIC $1,070.00 (1 posting), AFJ4791/SHARMIC $1,070.00 (1 posting).
6. **Drill-down dialog** — clicking any vehicle row opens a dialog listing every individual posting for that vehicle in the selected period: date (the posting's own transaction period, not when the ledger row was written), description, amount, and a Posted/Reversal badge — so a corrected row is visibly two lines, never one silently-edited number.

## Files changed in this slice

Backend: `modules/finance/types/allocation.types.ts` (additive), `modules/finance/repositories/allocation-ledger.repository.ts` (`findBySource`, `getNetTotalsByVehicleForCategory`, `getDistinctPostedMonths`), `modules/transport-cost/repositories/{contracted-vehicle,transport-cost-source-record}.repository.ts` (additive methods), `modules/transport-cost/repositories/transport-cost-vat-config.repository.ts` (new), `modules/transport-cost/services/{transport-cost-vat-config,transport-cost-posting,transport-cost-report}.service.ts` (new), `modules/transport-cost/controllers/transport-cost.controller.ts` (additive), `app/api/transport-cost/{postings,postings/batch,report,report/months,report/vehicles/[id]}/route.ts` (new), `shared/types/transport-cost-vat-config.types.ts` (new), `server/tenancy/module-scope.registry.ts` / `infrastructure/database/indexes.*-addendum.ts` (additive).

Frontend: `frontend/modules/transport-cost/{types/index.ts,services/transport-cost.api.ts,hooks/useTransportCost.ts,components/VehicleDrillDownDialog.tsx,pages/TransportCostReportPage.tsx}`, `app/(protected)/transport-cost/report/page.tsx`.

Tests: `tests/unit/transport-cost/{transport-cost-posting.service,transport-cost-vat-config.service,transport-cost-report.service}.spec.ts`, `tests/security/transport-cost-indexes.spec.ts` (updated), `tests/helpers/fake-collection.ts` (bug fix — see Verification above).

Verification tooling: `scripts/verify-phase-o3-o4.ts` — runs the real O1→O2→O3→O4 pipeline against the real January 2026 workbook with no live database (in-memory collections standing in for MongoDB, the same technique `tests/security/*.spec.ts` already uses), reproducibly (re-run twice, byte-identical output). Run it with `NEXTAUTH_SECRET=... REFRESH_TOKEN_SECRET=... JWT_SECRET=... npx tsx scripts/verify-phase-o3-o4.ts` from the repo root.

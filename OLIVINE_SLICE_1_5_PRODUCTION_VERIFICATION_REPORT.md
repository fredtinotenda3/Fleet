# Olivine Transport Cost — Slice 1–5 Production Verification & Fix Report

Investigation baseline: production deployment commit `abbdb57` ("FEAT:
OLIVINE SLICE 5"), domain `fleet-alpha.vercel.app`. Confirmed present in
Vercel before this pass began: `SECRETS_ENCRYPTION_KEY`,
`REFRESH_TOKEN_SECRET`, `MONGODB_URI`, `NEXTAUTH_SECRET`, `NEXTAUTH_URL`,
`REDIS_URL` — **this was not a build/secrets problem**, and nothing
below assumes it was.

## 1. Root cause

Not one root cause — five independent, narrowly-scoped defects, each in
a different slice, none related to deployment/env/build:

1. **(HIGH PRIORITY) Master-data search silently truncated with no
   signal.** `TransportPartnerRepository.searchConfirmedByName`,
   `ContractedVehicleRepository.searchConfirmedByRegistration`,
   `CustomerRepository.search`, and `DestinationRepository.search` all
   capped results at a hardcoded `limit: number = 20` and returned a
   bare array — opening a picker with no query typed (or a broad query)
   silently showed only the alphabetically-first ~20 rows with **no
   indication more existed**. This is exactly the reported "the
   production form appears to show only approximately 20 transporters."
2. Operational records table (Import page) had no Company/Category/
   Customer/Destination columns, even though every row already carries
   that data.
3. Operation detail page had no "data quality" section at all.
4. Command Centre's "By vehicle" drill-down used an older, filter-blind
   query path, silently ignoring every active company/category/
   transporter/destination/customer filter (every other dimension's
   drill-down already respected filters).
5. (Considered, not a defect) Slice 2 multi-line entry at creation time
   is 3rd-Party-only, and Slice 4's pending/rejected counts have no
   dollar figure — both are deliberate, already-documented behavior;
   see section 11.

## 2. Slices verified

- **Slice 1 (cost-facing company):** REACHABLE AND FUNCTIONAL end to
  end — entry → source record → posting → ledger → report → Command
  Centre, all keyed on the same `costFacingCompany` field, distinct
  from transporter/customer/vehicle/destination. No changes needed.
- **Slice 2 (multi-load):** Financial-integrity requirement (exactly
  one posting regardless of load count) VERIFIED, no gap. Multi-line
  entry at creation is 3rd-Party-only by deliberate, pre-existing design
  (documented in `shared/types/transport-cost.types.ts`'s own header) —
  not changed.
- **Slice 3 (search + Add New + VanSales):** Search fixed (item 1
  above). Add New confirmed correct for all four master-data types,
  including the deliberate Transporter/Vehicle review-gated path (never
  a synchronous create — see `master-data.service.ts`'s header).
  VanSales confirmed fully reachable end to end, periodization/
  transport-retainer semantics unchanged.
- **Slice 4 (Command Centre):** Vehicle drill-down filter gap fixed
  (item 4). No fabricated metrics found anywhere in this module (no
  cost/km, cost/tonne, ROI, margin, or savings figure exists in the
  Command Centre code path — a same-named but unrelated `cost-per-km`
  feature exists elsewhere, in the Finance module, and is not called
  from here).
- **Slice 5 (operational records / detail / actions / audit):** Table
  columns fixed (item 2), data-quality section added (item 3). Every
  controlled action (View/Edit/Duplicate/Correct/Cancel) is genuinely
  gated by record/posting state AND permission, both client- and
  server-side (defense in depth). Audit trail confirmed real end to end:
  mutation → `auditLog.log*` → dedicated audit API route → detail page
  re-fetch on every mutation.
- **Review Queue:** REACHABLE AND FUNCTIONAL, no bypass of the O2
  review-gated identity architecture found.

## 3. Fixes made (files and changes)

See the manifest at the end of this document for the full file list.
Summary by defect:

- **Search truncation:** repositories now fetch `limit + 1` rows and
  return `{ results, hasMore }` instead of a bare, silently-capped
  array; the signal is threaded through `MasterDataService` →
  `MasterDataController` → the frontend API client → all three shared
  search components (`SearchCreateSelect`, `IdentityPicker`,
  `SearchSelect`), which now render "Showing the first N matches — keep
  typing to narrow" when more rows exist. Default page size also moved
  from 20 to 50 as a secondary, minor headroom improvement — the
  `hasMore` signal is the actual fix. Tenant scoping, `reviewStatus`/
  `active` filtering, and the existing `containsMatch` regex-escaping
  are byte-for-byte unchanged.
- **Table columns:** added Category (a display-only, drift-guarded
  mirror of the real `COST_CATEGORY_BY_FAMILY` mapping — see
  `frontend/modules/transport-cost/types/index.ts`), Company, Customer,
  Destination columns to the operational records table, all reading
  fields the API response already returned.
- **Data quality section:** new pure util
  (`frontend/modules/transport-cost/utils/operation-data-quality.utils.ts`)
  derives a list of real, already-fetched-field conditions (missing
  amount, unattributed company, unparsed date, unresolved transporter/
  vehicle identity, unknown currency/VAT basis) and the detail page
  renders them — or nothing at all when the record has no issues (never
  a fabricated "all clear" banner).
- **Vehicle drill-down filters:** the "By vehicle" table now opens the
  same filter-aware `DimensionDrillDownDialog`/`setDimensionDrillDown`
  mechanism every other dimension (company/category/transporter/
  destination/customer) already used, instead of the older,
  filter-blind `VehicleDrillDownDialog`. That component itself was NOT
  deleted — `TransportCostReportPage.tsx` still legitimately uses it for
  its own, separate, non-Command-Centre view.

## 4. VanSales

Confirmed fully reachable and unmodified: entry form (file upload +
manual entry), cost-facing company selector, transporter/vehicle
lookup (via the fixed search), periodization (`VANSALES_PERIODIZATION_DECISION.md`,
Option A — `periodMonth`/`total`, `date` always null, no per-trip
allocation), posting as `transport-retainer` category, and full Command
Centre visibility (no family-scoping filter excludes it anywhere in the
summary/report pipeline). No changes were needed here beyond the
search-limit fix, which applies to VanSales' transporter/vehicle lookup
identically to every other sheet family.

## 5. Transporter lookup

Previously: `TransportPartnerRepository.searchConfirmedByName` returned
at most the alphabetically-first 20 confirmed rows with zero signal
that more existed. Now: fetches `limit + 1` (default 50), detects
truncation, and returns `{ results, hasMore }`; the picker renders an
honest "keep typing to narrow" hint instead of silently presenting a
partial list as complete. Typing a query (e.g. "ABC") still searches
the full tenant-scoped confirmed-transporter set via the existing,
already-safe `containsMatch` case-insensitive substring match —
unchanged.

## 6. Vehicle lookup

Identical fix, in `ContractedVehicleRepository.searchConfirmedByRegistration`
— same `limit + 1`/`hasMore` pattern, same tenant scoping, same optional
`transporterPartnerId` narrowing, same `containsMatch` registration
matching, unchanged.

## 7. Add New

- **Customer / Destination:** synchronous find-or-create via
  `SearchCreateSelect`'s `onCreateNew` → `MasterDataService.createCustomer`/
  `createDestination` — safe because these are lightweight reference
  data with no ledger-postability implication.
- **Transporter / Vehicle:** deliberately NOT a synchronous create.
  `IdentityPicker`'s `onRequestNew` goes through the existing
  request-new-transporter/vehicle commands, creating a
  `reviewStatus: 'needs-review'` row — immediately selectable, visibly
  flagged "pending" in the UI, resolved later in the Review Queue. This
  is the correct, by-design behavior (see `master-data.service.ts`'s own
  header) preventing a confirmed, ledger-postable identity from being
  created without human review — not a gap, and not changed.

## 8. Security

- Every search/lookup route remains behind `withAuth` +
  `Permission.TRANSPORT_COST_VIEW` (read) or `TRANSPORT_COST_NORMALIZE`/
  `TRANSPORT_COST_IMPORT`/`FINANCE_MANAGE` (write), unchanged.
- Tenant isolation re-verified directly against the fixed repository
  methods: new adversarial tests (identical name/registration across
  two tenants) confirm zero cross-tenant leakage for all four
  master-data search methods, plus the pre-existing
  `customer-destination.repository.spec.ts` isolation tests still pass
  unmodified in substance (only the `{results, hasMore}` return shape
  changed).
- Fail-closed behavior on an empty/missing tenantId re-confirmed for all
  four search methods (`TenantScopeError`).
- No scoping, permission check, or authentication requirement was
  loosened anywhere in this pass.

## 9. Tests

Full results (this environment, no live MongoDB — see section 10):

| Command | Result |
|---|---|
| `npm run type-check` | Clean, 0 errors |
| `npm test` (unit + security) | **195 suites, 3421 tests, all passed** |
| `npm run test:security` | Included in the above (security suites pass) |
| `npm run test:e2e` | 1 suite, 14 tests, all passed |
| `npm run test:performance` | 1 suite, 13 tests, all passed |
| `npm run test:integration` | 1 suite, **21 tests SKIPPED** — no live MongoDB reachable from this sandbox (`mongodb-memory-server` download blocked at the network policy level; confirmed, not worked around) |
| `npm run build` | Succeeds (required a temporary, sandbox-only, reverted `next/font/google` substitution to get past this sandbox's blocked Google Fonts egress — not part of the delivered fix; the route manifest includes every transport-cost route, including all four `*/search` endpoints) |
| `npm run lint` | 23 pre-existing errors, all in files this pass never touched (none of the 21 changed/new files listed in the manifest appear in the lint output) |

New/extended test coverage this pass: `tests/unit/transport-cost/transporter-vehicle-search.repository.spec.ts`
(new — direct repository-level coverage of the search fix, including
`hasMore` true/false and tenant isolation), `tests/unit/transport-cost/cost-category-label-sync.spec.ts`
(new — drift guard between the frontend display label and the real
backend category mapping), `tests/unit/transport-cost/operation-detail-data-quality.spec.ts`
(new — the data-quality section's derivation logic), plus updates to
`master-data.service.spec.ts` and `customer-destination.repository.spec.ts`
for the new `{results, hasMore}` return shape.

Not added: a rendered-component test for the "keep typing to narrow"
hint or the new table columns/data-quality card's actual DOM output —
this project's Jest config (`jest.config.js`) has no JSX transform
wired up for its `testEnvironment: 'node'` (confirmed directly: `.tsx`
component files cannot be imported into a test at all, "Unexpected
token '<'"), so a rendering assertion is not possible without first
adding a jsdom/React Testing Library harness, which is outside a
minimal fix's scope. All new logic that does not require rendering
(the data-quality derivation, the repository/service behavior) is fully
unit-tested; the JSX itself was verified by direct code reading and by
a clean production build's route manifest.

## 10. Production verification

**VERIFIED LOCALLY/STATICALLY** (this sandbox has no route to a live
MongoDB or to this deployment's actual production database/session):
every fix's full chain — UI component → API route → `withAuth` →
permission → tenant scope → service → repository → MongoDB query
construction → API response → UI render — by direct code reading, a
clean `tsc --noEmit`, a clean `npm run build` with the real route
manifest, and unit/security/e2e/performance tests exercising the real
repository/service/controller code against a Mongo-shaped in-memory
fake collection.

**NOT verified in this pass** because it requires a live, authenticated
click-through against the actual production database, which this
sandbox cannot reach: an end user's browser actually seeing the
"Showing the first N matches" hint render, actually seeing the new
table columns/data-quality card populated with real production rows,
and actually clicking a vehicle row with a live filter active and
seeing it now respect that filter. These four things should be
confirmed by the client in their own browser against the real
deployment after this fix ships.

## 11. Remaining gaps (genuine, not fixed — with reasoning)

1. **Slice 2, multi-line entry at creation is 3rd-Party-only.**
   Deliberate, pre-existing design decision (the other three sheet
   families' source structure is inherently one-line per row; forcing a
   multi-line model onto them risks a false merge of real financial
   records with no reliable signal to group rows correctly). Not
   changed. Worth a direct conversation with the client about whether
   Swift/VanSales/Depot STO genuinely need multi-line creation, or
   whether Edit-time multi-line (already available for all four via
   `EditRecordDialog`) is sufficient.
2. **Slice 4, pending/rejected shown as counts only, no dollar value.**
   Investigated and deliberately NOT changed: "pending" here is
   structurally defined as rows with `amount === null` — there is no
   real number to sum (treating null as 0 would violate this codebase's
   own hard "never coerce a blank to 0" rule, present throughout
   `shared/types/transport-cost.types.ts`). "Rejected" rows only carry
   an unparsed raw string in the source cell (often the very reason the
   row was rejected) — safely parsing and summing these into a trusted
   financial figure is not possible without risking a fabricated number
   from malformed input. Showing counts only, as today, is the correct,
   non-fabricating behavior here, not a gap.
3. **Slice 4, one dynamic period-total KPI card instead of four
   simultaneous Daily/Weekly/Monthly/Selected-Total cards.** The
   existing granularity/preset selector already lets a user see any of
   the four; showing all four simultaneously would require computing
   all four on every page load regardless of the selected granularity
   (roughly 4x the query cost) for a UX preference the client's spec
   does not explicitly require to be simultaneous. Not changed; flagged
   for the client's judgment call.
4. **Live production click-through** — see section 10.

## 12. ZIP output

See the accompanying manifest and ZIP file(s) delivered alongside this
report. No full project ZIP, no `node_modules`, no `.next`, no `.git`,
no unrelated files — only the files listed in the manifest, with their
original project directory structure preserved.

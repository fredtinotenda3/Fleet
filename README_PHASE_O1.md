# Olivine Phase O1 — Transport Cost Source Import

Scope actually built, per your selection ("Phase O1 only"): the import
pipeline and `TransportCostSourceRecord` collection for the **3rd Party**
and **Vansales** sheet families. Source evidence only — no ledger
posting, no cost-per-tonne, no fuel/vehicle linkage. Every file below
carries header comments tracing back to the specific audit section that
drove the decision.

Drop these files into the same relative paths in `Fleet-main/`. Files
under `modules/transport-cost/`, `app/api/transport-cost/`,
`app/(protected)/transport-cost/`, `frontend/modules/transport-cost/`,
`shared/types/transport-cost.types.ts`, and
`tests/unit/transport-cost/` are **brand new** — nothing to merge.

## Files that already existed and were edited (merge, don't overwrite blindly)

- `server/cqrs/cqrs.module.ts` — added the `registerTransportCostCqrsHandlers`
  import and call, two lines each.
- `server/permissions/roles.ts` — added
  `Permission.TRANSPORT_COST_VIEW` / `TRANSPORT_COST_IMPORT`, and granted
  them to `BRANCH_MANAGER` (view only), `FLEET_MANAGER` and `ACCOUNTANT`
  (view + import). `ORGANIZATION_OWNER`/`ORGANIZATION_ADMIN`/`SUPER_ADMIN`
  get both automatically via the existing `Object.values(Permission)`
  grant — no change needed there.
- `server/tenancy/module-scope.registry.ts` — added a `transport-cost`
  entry: `level: 'org-unit'`, `orgUnitSource: 'explicit'`,
  `confirmed: false` (the org-unit ownership rule — importing user's
  branch vs. a depot/origin named in the sheet — is one of the still-open
  Section R confirmations; Phase O1 doesn't need the answer to run, but
  the registry says so honestly rather than assuming).
- `tests/security/module-scope-conformance.spec.ts` — added
  `'transport-cost'` to the expected list of unconfirmed decisions (kept
  in alphabetical order, matching the test's own assertion style).
- `frontend/shared/import/ImportModal.tsx` — **one small, backward-compatible
  change**: `onImport` now receives the uploaded file's name as a second
  argument (`(records, fileName) => ...`). This was necessary because
  `TransportCostSourceRecord.sourceFileName` is a required, immutable
  provenance field, and the component previously had no way to hand the
  file name back to the caller. Verified this doesn't break the two
  existing callers (`ExpenseListPage`, `TripsListPage`) — both only take
  `records` as a parameter, and TypeScript allows a function with fewer
  parameters to satisfy a call site that offers more.

## What's deliberately NOT here

- No Allocation Ledger posting, no cost-per-tonne, no fuel logic (Phases
  O3/O4 — gated on Section R's client confirmations).
- No sidebar/navigation entry (`frontend/shared/ui/navigation/nav.config.ts`)
  — flagged as a follow-up rather than guessed at; the route
  `/transport-cost/import` works once linked to, it's just not in the nav
  yet.
- No transporter-name fuzzy-matching (Phase O2 — gated on a confirmed
  master list; raw + normalized forms are both stored so nothing is lost
  in the meantime).

## Verification performed in the sandboxed copy of your codebase

- `npm ci` — clean install, 1449 packages, no changes needed to
  `package.json`/lockfile.
- `npx tsc --noEmit` — **zero errors across the entire project**
  (caught and fixed one real issue of my own: a type re-exported from the
  wrong module).
- `npx jest` (full suite, excluding integration/performance which need a
  live Mongo) — **167 suites / 3025 tests, all passing**, including:
  - The new `tests/unit/transport-cost/import-transport-cost.handler.spec.ts`
    (16 tests): rejects bad/missing dates including the "31.02.26"
    rollover trap, rejects missing registration, rejects the "VAT EXCL"
    blocklisted transporter value, never coerces a blank Amount/weekly
    figure to `0`, flags duplicates without inserting them, resolves
    `orgUnitId` exactly once per batch from the importing user's own
    scope (never from the uploaded row, even when a row tries to smuggle
    one in), leaves `orgUnitId` unresolved for a system-scoped import
    rather than guessing, normalizes registration whitespace/case, and
    imports a Vansales row with a blank REG cell successfully.
  - `tests/security/module-scope-conformance.spec.ts` (79 tests) — the
    new module passes every structural tenancy check the registry
    enforces.
  - `tests/security/permission-symmetry.spec.ts` and
    `tests/security/finance-permissions-conformance.spec.ts` — unaffected
    by the new permissions.
- Spot-checked ESLint on the new/changed files: the only findings are
  `no-explicit-any` / unused-import style warnings that exist identically
  in the reference files I modeled this on (e.g.
  `expense.controller.ts`, `assign-vehicle-driver.handler.spec.ts`) — not
  something this change introduces. I did clean up the one genuinely
  unused import my own code left behind.

## Trying it

- `POST /api/transport-cost/import/third-party` and
  `POST /api/transport-cost/import/vansales` — body `{ rows, sourceFileName }`,
  requires `transport-cost:import`.
- `GET /api/transport-cost/source-records` — paginated, filterable
  verification listing, requires `transport-cost:view`.
- UI: `/transport-cost/import` (not yet in the sidebar — see above).

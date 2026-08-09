# Step 3 — Value Ledger Export (JSON/PDF)

Extends the existing ESG export pattern (`modules/esg/*`,
`app/api/esg/export/route.ts`) to produce a tenancy-scoped report of
resolved value-ledger postings. Same shape, same scoping discipline,
new domain. Step 2's files (repository append/immutability, the
resolve service, the resolve route, etc.) are untouched except for one
additive method described below.

## New files

- `modules/attention/types/ledger-export.types.ts`
  `LedgerExportOptions` / `LedgerExportFilters` / `LedgerExportEntry` /
  `LedgerExportSummary` / `LedgerExportData` — mirrors
  `modules/esg/types/esg-export.types.ts`'s shape (a `*Options` input,
  a `*Data` output carrying `organization`/`generatedAt`/`scope`), plus
  the row-cap/truncation metadata every CSV/XLSX export already exposes
  (`shared/export/export.types.ts`'s `ExportDataset`), since this export
  has a row-level component the ESG export doesn't.

- `modules/attention/services/ledger-export.service.ts`
  `ledgerExportService.buildExport(context, options)`. One read
  (`valueLedgerRepository.getFilteredEntriesForExport`), then computes
  a summary rollup (totals, per-source breakdown, per-baseline-tier
  counts) from exactly the rows that call returned — never a second,
  unscoped read. Adds `variance` (`realisedAmount - modelledAmount`)
  per entry and in aggregate.

- `modules/attention/generators/ledger-pdf.generator.ts`
  `buildLedgerPdfBuffer(data)` — renders header/summary/postings
  sections with pdfkit, the same dependency
  `modules/esg/generators/esg-pdf.generator.ts` uses. Caps rendered
  rows at 200 with a "use the JSON export for the complete row set"
  note (the PDF itself isn't meant to be the bulk-data path); surfaces
  a truncation warning when the underlying dataset was capped.

- `modules/attention/controllers/ledger-export.controller.ts`
  `GET` handler: resolves a full `TenantContext` via
  `resolveTenantContext(req)` (never a `tenantId`-only helper — the
  leak shape `export-scope-conformance.spec.ts` guards against
  elsewhere), validates `format` (`json`/`pdf`), `source`
  (`fuel_fraud`/`expense_anomaly`, optional), and `from`/`to` date
  query params, then either returns JSON or streams a PDF with
  `Content-Disposition: attachment`.

- `app/api/attention/ledger/export/route.ts`
  `GET /api/attention/ledger/export`, gated behind
  `Permission.ANALYTICS_EXPORT` — the same permission every other
  export in this codebase requires, via `withAuth`.

- `tests/security/ledger-export-scope.spec.ts`
  Mirrors `esg-export-scope.spec.ts`: mocks
  `valueLedgerRepository.getFilteredEntriesForExport` and asserts the
  service (a) threads the caller's `TenantContext` straight through
  with no fallback, (b) passes `source`/`from`/`to` filters through
  unmodified, (c) computes `scope.orgUnitId` from
  `context.activeOrgUnitId`, (d) computes a summary that matches
  exactly the mocked rows (not recomputed from anything else), (e)
  surfaces the repository's cap/truncation flag unchanged, and (f)
  reports applied filters back with `null` defaults. Plus two
  structural checks (source-read, not behavioural): the controller
  calls `resolveTenantContext(req)`, and the route is gated behind
  `Permission.ANALYTICS_EXPORT`.

- `tests/security/value-ledger-export-repository.spec.ts`
  Runs the real `ValueLedgerRepository.getFilteredEntriesForExport()`
  against the in-memory `FakeCollection` (same helper Step 1/2's
  repository suites use). Proves the method actually builds the query
  correctly rather than trusting the mocked test above: tenant scoping,
  org-unit narrowing (including the fail-closed empty-array case and
  the org-wide `null` case), the `source` filter, soft-delete
  exclusion, and cap/`truncated`/`totalMatched` bookkeeping.

## Modified files

- `modules/attention/repositories/value-ledger.repository.ts`
  Added `getFilteredEntriesForExport(filters, context, cap?)` —
  purely additive, no existing method's signature or behaviour
  changed. Composes the two scope layers every other export repository
  in this codebase uses (`BaseRepository.getActiveFilter` for tenant
  scope, then `tenantScopeService.buildFilter(context, 'orgUnitId')`
  for org-unit scope — see `ExpenseRepository.buildScopedMatch` for the
  precedent), optionally narrows by `source` and a `resolvedAt`
  date range, sorts newest-first, and caps at `EXPORT_ROW_CAP` (same
  constant and same rationale as every CSV/XLSX export:
  `shared/export/export.constants.ts`). Returns an `ExportDataset`
  (`rows`, `totalMatched`, `truncated`, `exportCap`) exactly like the
  five existing `getFiltered*ForExport` methods. Does not touch
  `append()`, `update()`, `softDelete()`, `hardDelete()`, or
  `findByAttentionItemKeyInScope()` — the append-only guarantee Step 2
  built is a write-path property and this is a read.

## Not touched

`server/tenancy/module-scope.registry.ts` already registers
`tblvalueledger` under the `attention` entry (`org-unit`,
`confirmed: false`) from Step 2 — the export read goes through the
same collection and the same scoping, so no registry change was
needed. `tests/security/export-scope-conformance.spec.ts`'s hardcoded
list covers the five row-based CSV/XLSX exports specifically (its own
header explains why); the ESG export isn't in that list either, and
this export follows the ESG pattern, not that one, so it wasn't added
there — it gets its own dedicated scope spec instead, exactly as ESG
does.

## Verification

- `npm run test:security` — **22 suites / 291 tests passed** (was 20
  suites / 274 tests after Step 2; +2 suites / +17 tests from this
  pass, none of the pre-existing tests changed).
- `npx tsc --noEmit` — **clean, zero errors.**

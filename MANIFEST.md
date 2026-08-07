# Fleet — report builder org-unit scoping

9 files. The last read path that ignored org-unit scope.

## The hole

`ReportQueryEngine.run()` built its `$match` as:

```ts
{ ...source.baseFilter(tenantId), ...userFilters }
```

`baseFilter` constrains the **organization** only. Nothing constrained the org
unit. So a scoped user could author a definition over `vehicles`, `expenses`,
`fuel`, `maintenance` or `trips`, run it, and get **every row in the
organization** — then export to CSV, Excel or PDF.

`bulawayo.manager@` sees 20 vehicles on every page and could have downloaded all
76, with Harare's full cost base. Reports are the worst place for this: the output
is designed to be kept and shared.

This was documented in `module-scope.registry.ts` ("enforcement belongs in the
execution engine") and never implemented.

## The fix

`orgUnitPredicate()` merged into the `$match`, **spread last**. Ordering is
load-bearing: `orgUnitId` is an exposed filterable field on these data sources, so
a definition may legitimately contain `orgUnitId = X`. Spreading scope first would
let that user-supplied condition overwrite the scope key — the same key-collision
bypass `BaseRepository.findMany` was fixed for. There's a test for it.

Scoped collections are read from `module-scope.registry.ts`, not restated, so
flipping a module's scope decision propagates to reports automatically. Shared
reference data (fuel stations, vendors, SLA) is deliberately **not** filtered —
hiding those would be the opposite failure.

Fails closed: a scoped caller with no units gets `{ $in: [] }`, never org-wide.

Threaded through: engine → execution / builder / dashboard / drilldown services →
3 controllers, which resolve `TenantContext` at the request edge. `context` is
optional so background jobs and platform tooling still run org-wide.

## Verification
`npm run test:security` **181/181** (10 new) · `npx tsc --noEmit` **83** (baseline 83).

Verify: sign in as `bulawayo.manager@`, build a report over Vehicles, run it —
20 rows, not 76.

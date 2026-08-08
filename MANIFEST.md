# Fleet — export audit, AI scoping, high-risk type errors

7 files.

## 1. Export audit — NO LEAK FOUND

I flagged these as a suspected leak in two previous rounds. Audited all five
export endpoints end to end (controller → repository → Mongo query):

| Export | Controller resolves context | Repository applies org-unit filter |
|---|---|---|
| expenses | yes | `buildScopedMatch` |
| fuel | yes | `buildScopedQuery` |
| maintenance | yes | `buildScopedQuery` |
| trips | yes | `buildScopedQuery` |
| vehicles | yes | `buildScopedQuery` |

Every one takes `TenantContext` (not `tenantId`) and applies
`tenantScopeService.buildFilter(context, 'orgUnitId')` — in the vehicles case via
`Object.assign(query, scopeFilter)` **last**, so filters can't widen it. My earlier
suspicion was wrong; nothing to fix.

Added `tests/security/export-scope-conformance.spec.ts` (11 tests) so this stays
true: it fails if any export repository method takes a bare `tenantId`, if a
controller stops resolving a context, or if an export loses its row cap. An audit
is a snapshot; this is the invariant.

## 2. AI services — fleet health genuinely scoped, four still gated

**`fleetHealthService.calculateHealthScore`** now takes `TenantContext` and applies
one org-unit predicate across all five of its input reads (vehicles, maintenance,
expenses, trips, fuel). Scoped users get **real numbers** — the placeholder is gone
for this endpoint.

The other four (driver-risk, fuel-fraud, predictive-maintenance, expense-anomaly)
build their own multi-stage aggregations and **remain behind the fail-closed gate**.

Deliberate: fleet health was scopeable because its inputs are five plain collection
reads. A partially-scoped AI panel is worse than a blocked one — the numbers look
authoritative while silently mixing one branch's vehicles with another's expenses.
So each service is unblocked only when its *whole* input set is narrowed. The
single shared `scope` predicate in fleet-health exists for the same reason: five
independently-scoped reads could disagree.

## 3. Type errors — 83 → 79, all four were broken endpoints

Triaged by runtime risk rather than count. The four fixed were not cosmetic:

- **`POST /api/trips/import`** called `tripController.importTrips`, which **does not
  exist anywhere**. Every call threw `TypeError: ... is not a function` → opaque 500.
  TS2551 said *"Did you mean 'exportTrips'?"*. Now returns an explicit **501** —
  trip import needs a column mapping, duplicate policy and partial-failure
  behaviour; guessing those would create bad data, which is worse than an honest
  "not built".
- **3 reporting routes** (execution download, KPI evaluate, template instantiate)
  passed the awaited `params` **object** where the controller takes `id: string`, so
  `id` arrived as `{ id: "..." }` and every call 404'd or queried for
  `"[object Object]"`. TS2345 flagged all three.

That's **four endpoints broken in production**, each flagged by tsc and shipped by
`ignoreBuildErrors: true`. The remaining 79 are overwhelmingly frontend (42)
`null`-vs-`undefined` mismatches with no runtime consequence.

**The real lesson is the config, not the count.** These four cost nothing to find —
the compiler had already found them. Turning off `ignoreBuildErrors` is now within
reach and is the highest-value follow-up.

## Verification
`npm run test:security` **211/211** (15 new) · `npx tsc --noEmit` **79** (was 83).

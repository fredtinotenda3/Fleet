# Step 2 — Resolve Action + Value Ledger: Tests Finished

Scope of this pass: **only** finishing and verifying the two test files
that were left incomplete. No production code was touched — the
repository, service, controller, route, schema, types, registry, and
index files from the earlier Step 2 work are unchanged.

> Note: the task brief's file list used slightly different names/paths
> than what's actually on disk (e.g. `modules/attention/services/
> attention-resolution.service.ts` instead of `modules/ai/services/
> needs-attention-resolution.service.ts`, `shared/validations/
> attention.schema.ts` instead of `modules/ai/validations/needs-
> attention.schema.ts`, `modules/attention/types/value-ledger.types.ts`
> instead of `modules/ai/types/valueledger-item.types.ts`). All the
> described functionality does exist under those real paths, and both
> new test files import from the real locations.

## New files

- `tests/security/value-ledger-append-only.spec.ts`
  Repository-level suite for `ValueLedgerRepository`, run against the
  same in-memory `FakeCollection` the persistence/tenant-isolation
  suites use. Covers:
  - `append()` inserts a posting with all supplied fields plus audit
    fields (`tenantId`, `isDeleted: false`, ...).
  - A second `append()` for the same `attentionItemKey` creates a
    **second row**, not an update-in-place — proving there is no merge
    path, only ever more rows (unlike `AttentionItemRepository.
    upsertFeedItems()`, which is deliberately the opposite).
  - Rows are scoped to `tenantId`.
  - `update()`, `softDelete()`, and `hardDelete()` all throw
    `ConflictError` with the documented message, and — critically —
    never touch the underlying collection (asserted via a
    before/after snapshot of `collection.docs`).
  - The three overrides throw the actual `ConflictError` class, not
    just an error with a matching message.
  - `findByAttentionItemKeyInScope()` returns only postings for the
    given item key within the given tenant, and preserves **every**
    posting when an item was resolved more than once (a correction),
    rather than the second write clobbering the first.

- `tests/security/needs-attention-resolution.spec.ts`
  Service-level suite for `AttentionResolutionService.resolve()`,
  mocking `attentionItemRepository` and `valueLedgerRepository` at the
  boundary the service calls (same style as
  `expense-anomaly-scope.spec.ts`). Covers:
  - 404s (`NotFoundError`) when the item was never persisted.
  - 404s when the caller is org-unit scoped and the item belongs to a
    different unit, *and* when the item has no resolvable `orgUnitId`
    at all (the documented fail-closed gap from Step 1) — both without
    leaking existence via a different status code.
  - Resolution succeeds for an org-unit-scoped caller within their
    accessible units, and for an org-wide caller (`accessibleOrgUnitIds
    === null`) regardless of the item's `orgUnitId`.
  - 409s (`ConflictError`) on an already-resolved item, carrying the
    prior `resolvedAt`/`resolvedBy` in `details`, and does not call
    `resolveByItemKey` or `append` in that case.
  - `baselineTier`/`evidenceRefs` are required (`ValidationError`) only
    for `fuel_fraud` and `expense_anomaly` items — parameterised over
    both eligible sources and over "missing" vs. "empty array" for
    `evidenceRefs`.
  - Four non-eligible sources (`driver_risk`, `maintenance`,
    `compliance`, `fleet_health`) resolve successfully with neither
    field supplied, return `ledgerEntry: null`, and never call
    `valueLedgerRepository.append`.
  - A ledger-eligible resolve writes **exactly one** posting, with
    `modelledAmount` sourced from the item's `cost`, `realisedAmount`
    from the resolver's input (or falling back to `cost` when omitted),
    `orgUnitId` copied from the item, and the exact `resolvedAt` the
    repository returned.
  - A race where `resolveByItemKey` returns `null` after
    `findByItemKey` succeeded (concurrent delete) surfaces as
    `NotFoundError`, not a silent no-op, and never reaches `append`.

## Verification

- `npm run test:security` — **20 suites / 274 tests passed** (was 18
  suites / 246 tests after Step 1; +2 suites / +28 tests from this
  pass, none of the pre-existing tests changed).
- `npx tsc --noEmit` — **clean, zero errors**.

## Not included / not touched

Per the task instructions, none of the already-written Step 2
production files were rebuilt or modified: the value-ledger types,
attention-item types, both repositories, the resolve schema, the
resolution service, the controller method, the resolve route, the
module-scope registry entry, and the index addendum are all exactly as
they were before this pass.

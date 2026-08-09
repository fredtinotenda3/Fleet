# Step 1 — Persist the Attention Queue

Scope: persistence only, as instructed. Steps 2–4 (resolve action, value
ledger, ledger export, command centre UI) are NOT included.

## New files

- `modules/attention/types/attention-item.types.ts`
  `AttentionItem` entity — the persisted counterpart of
  `NeedsAttentionItem`. Extends `OrgUnitScopedEntity`; `orgUnitId` is
  also declared inline so the module-scope conformance suite (which
  greps source rather than resolving TS inheritance) can see it. Adds
  `itemKey` (dedupe key, = the aggregator's own item id, e.g.
  `fuel_fraud:alert-1`), `firstSeenAt` (set once), `lastSeenAt` (set on
  every refresh).

- `modules/attention/repositories/attention-item.repository.ts`
  `AttentionItemRepository extends TenantScopedRepository<AttentionItem>`,
  collection `tblattentionitems`. `upsertFeedItems(tenantId, items,
  orgUnitId?)` does one unordered `bulkWrite` of `updateOne(filter:
  {tenantId, itemKey}, upsert: true)` per item — `$set` for every
  mutable field, `$setOnInsert` for `firstSeenAt`/`createdAt` only, so
  refreshing the same item never creates a duplicate row and never
  resets when it was first seen.

- `infrastructure/database/indexes.attention-addendum.ts`
  Indexes for `tblattentionitems`, wired into
  `infrastructure/database/indexes.ts`'s existing addendum-merge
  pattern (same shape as `indexes.anomaly-addendum.ts`). Includes a
  **unique** index on `{tenantId, itemKey}` — the idempotency guarantee
  is enforced at the DB layer, not just in application code.

- `tests/security/attention-items-persistence.spec.ts`
  Runs the real repository against the existing in-memory
  `FakeCollection` helper (same pattern as `tenant-isolation.spec.ts`).
  Covers: first insert, idempotent update-in-place on repeat upsert
  (`firstSeenAt` unchanged, mutable fields updated), no duplicate rows
  across 5 repeated refreshes of a 3-item feed, tenant isolation on a
  shared `itemKey`, empty-feed no-op, and the documented limitation that
  stale rows aren't pruned yet.

## Modified files

- `modules/ai/services/needs-attention.service.ts`
  `getFeed()` now calls a new private `persistFeed()` after computing
  the full sorted, pre-`limit` item list, which calls
  `attentionItemRepository.upsertFeedItems()`. Wrapped in try/catch +
  `monitoring.logError` — a persistence failure is logged and swallowed,
  never thrown, matching the file's existing per-source failure-isolation
  stance. **The method's return shape and `limit` truncation are
  unchanged** — the API response is identical to before this change.

- `server/tenancy/module-scope.registry.ts`
  Added an `attention` entry: `level: 'org-unit'`, collection
  `tblattentionitems`, `orgUnitSource: 'parent-record'`,
  `confirmed: false`. The rationale documents a known, deliberate
  simplification: rows are tagged with the request's `activeOrgUnitId`
  rather than each item's individually-resolved owning vehicle/driver.
  This is safe (fail-closed — a row without a resolvable org unit is
  simply invisible to scope-narrowed reads, never over-exposed) but
  incomplete, which is why it's left unconfirmed pending a follow-up
  that joins each item back to its source entity the way
  `tblanomalies` does.

- `tests/security/module-scope-conformance.spec.ts`
  Updated the hardcoded "open decisions" list (`unconfirmedDecisions()`)
  to include `'attention'`, since that test asserts on the exact set.

- `tests/helpers/fake-collection.ts`
  Added `bulkWrite()` supporting the `updateOne` + `$set`/`$setOnInsert`
  + `upsert: true` shape `upsertFeedItems()` emits — the only shape this
  fake needs to support, consistent with the file's existing policy of
  extending rather than emulating all of Mongo.

## Verification

- `npm run test:security` — **18 suites / 246 tests passed** (was
  216 before this change; +30 from the new persistence spec plus
  updated assertions elsewhere).
- `npx tsc --noEmit` — **clean, zero errors**.

## Known gaps / follow-ups (not silently glossed over)

1. **orgUnitId resolution is coarse.** Every row from one refresh gets
   the same `orgUnitId` (the caller's `activeOrgUnitId`), not each
   item's true owning vehicle/driver. A caller with several org units
   active but none individually selected will persist rows with no
   `orgUnitId` at all — invisible to narrowed reads, not wrong, but
   incomplete. Flagged via `confirmed: false` in the registry.
2. **No staleness pruning.** If a source stops reporting an item (the
   underlying condition cleared), its previously-persisted row is left
   in place indefinitely — `lastSeenAt` stops advancing but nothing
   deletes or marks it resolved. Covered by a test that documents this
   explicitly rather than silently passing. A sweep job or `resolve`
   action (Step 2) is the natural place to close this.
3. No read endpoint was added for `tblattentionitems` in this pass —
   only the write side. `GET /api/ai/needs-attention` still reads the
   live-computed feed, unchanged.

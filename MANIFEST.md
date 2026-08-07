# Fleet — `_id` type/runtime mismatch

2 files.

| Path | Change |
|---|---|
| `server/repositories/base.repository.ts` | Normalizes `_id` to string on every read; adds `toObjectId()` |
| `tests/security/document-id-normalization.spec.ts` | 9 new tests |

## The 20 write sites did not need changing — and here's why

I said 20 earlier. That number was wrong in an important way: **~25 of the 27 are in
`scripts/`, which use the raw driver (`db.collection(...)`) and never touch
BaseRepository.** Their `_id` stays an `ObjectId`, so their
`updateOne({ _id: doc._id })` keeps working untouched. Changing them would have
*introduced* the breakage I was worried about.

In application code there were exactly three consumers of a read `_id`:

| Site | Verdict |
|---|---|
| `org-unit-hierarchy.service.ts:122` — `updateOne({ _id: descendant._id })` | **Safe.** `descendant` comes from a raw `collection.find()`, not the repository. Unaffected. |
| `session.service.ts:32` — `_id: s._id!` into a DTO typed `string` | Now actually correct; it was an ObjectId in a string field. |
| `driver-risk.service.ts:103` — `_id: t._id \|\| ''` | Same; read-only shaping. |

Everything else my grep caught was `$group: { _id: null }` in aggregation
pipelines — unrelated.

So the change is: normalize at the read boundary, touch no write site.

## A live bug this fixes for free

`OrgUnitHierarchyService.moveUnit()` does:

```ts
const unit = await this.repo.findById(orgUnitId, tenantId);   // _id was ObjectId
collection.find({ organizationId: ..., path: unit._id })      // path stores STRINGS
```

An ObjectId never matches a string element, so **descendant paths were never
rewritten when a unit was moved** — silently, no error. Since a wrong `path` is
exactly what makes descendant expansion collapse (the bug that made branch
managers see an empty app), moving a unit could have re-broken scoping at any
time. Normalizing `unit._id` to a string fixes that query with no further edit.

## Scope

Converts **only** the top-level `_id`, and only when it is a real ObjectId. No
deep walk: reference fields (`vehicleId`, `orgUnitId`, `driver_id`) are already
stored as strings, a traversal on every read would cost, and it would rewrite
ObjectIds inside caller payloads that may legitimately hold them.

Documents read via `collection.find()`, `collection.aggregate()` or anything in
`scripts/` still carry an ObjectId. `toObjectId()` is provided for code that mixes
both sources.

## Verification
`npm run test:security` **190/190** (9 new) · `npx tsc --noEmit` **83** (baseline 83).

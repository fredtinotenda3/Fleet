# Fleet — vehicle-create 500 + expense categories

2 files.

| Path | Fix |
|---|---|
| `modules/organizations/services/organization.service.ts` | vehicle-create 500; vehicle-limit check |
| `modules/expenses/repositories/expense-type.repository.ts` | "Uncategorised" |

## 1. Vehicle creation 500 — root cause

The slug-vs-ObjectId bug, in the one place it survived. Chain:

```
POST /api/vehicles
  -> CreateVehicleHandler
    -> organizationService.checkVehicleLimit()
      -> getOrganization(organizationId, tenantId)
         -> repo.findById(<slug>)   // ObjectId.isValid(slug) === false
         -> null -> throw NotFoundError('Organization not found')
```

`organizationId` is the tenant **slug** here (for org-scoped resources
organizationId === tenantId). `BaseRepository.findById()` returns null before
querying when the id isn't 24 hex chars. Reads never call this, which is why only
creation broke. Your Vercel line `Unexpected error: i: Organiza…` is that message,
minified and truncated. Now routed through `resolveOrganization()`.

**You will still hit a second wall.** Your organization has
`features.maxVehicles: 10` and 76 vehicles exist, so the limit check now fires
correctly with a clear 400. Raise it before demoing:

```js
db.tblorganizations.updateOne(
  { slug: "willsgrove-farm-enterprises-9e80ed" },
  { $set: { "features.maxVehicles": 500 } }
)
```

I also made a missing/zero `maxVehicles` mean *unmetered* rather than *zero* — the
old `count >= max` blocked every create when the field was absent.

## 2. "Uncategorised" — root cause

`tblexpense_types` is a **global reference catalogue**; its documents carry no
`tenantId` (verify in your dump — same shape as `tblunits`). But the repository
extends `BaseRepository`, so every query appended `{ tenantId: <slug> }` and
matched **zero** documents. Empty dropdown, and every existing expense rendered
"Uncategorised" because its type couldn't resolve.

Fixed with an explicit *mine-or-global* predicate rather than by dropping the
tenant filter: tenants can add their own types (the bulk-import handler does), and
those stay private. Not org-unit scoped — a branch manager must categorise from
the same catalogue as everyone else.

## Verification
`npm run test:security` **171/171** · `npx tsc --noEmit` **83** (baseline 83).

## NOT done
- **Per-row delete** on expense/fuel/maintenance. Permission gating is already
  correct (all six modules delegate to `permissionService`), and **bulk delete
  works today** — tick a row, the Delete button appears. Only the per-row icon is
  missing; it's a table-column change in three list pages.
- **Fuel-type autofill** from the selected vehicle — not done.
- **AI services** — still the safe "unavailable for your scope" placeholder.
- Organisation dashboard scoping was already fixed in the previous round (verified).

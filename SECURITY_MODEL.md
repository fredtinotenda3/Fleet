# Security Model

How isolation, authorization and auditability actually work in this
platform — written from the code, with the failure modes each control
exists to prevent.

---

## 1. Two boundaries, not one

| Boundary | Enforced by | Failure if wrong |
|---|---|---|
| **Tenant** (organization) | `tenantId` on every row; `resolveTenantScope()` fails closed | One customer reads another's data. Breach. |
| **Org unit** (branch / department / workshop / fleet) | `orgUnitId` + `tenantScopeService.buildFilter()` | One branch reads another's; or a user sees nothing and reports data loss. |

The tenant boundary is absolute. The org-unit boundary is a visibility
rule *within* one customer, and it fails in both directions — too much is
a leak, too little looks like the save button is broken.

### `tenantId` is the organization SLUG

Not `String(org._id)`. `willsgrove-farm-enterprises-9e80ed`, not an
ObjectId. This has caused real incidents: `organizationRepository.findById(tenantId)`
opens with `ObjectId.isValid()` and returned `null` 100% of the time,
which 404'd every org-unit-scoped endpoint. Use
`server/tenancy/organization-resolver.ts`.

### Fail-closed sentinels

`'default'`, `'system'` and `'super_admin'` were once treated as "return
every tenant's rows". They now raise `TenantScopeError`. Anything that
needs genuine platform scope uses `PLATFORM_SCOPE_TENANT_ID` explicitly.

---

## 2. Org-unit scoping

`TenantContext.accessibleOrgUnitIds` is the whole mechanism:

- **`null`** — not narrowed. Org-wide roles (owner, organization admin,
  super admin) see everything in-tenant. **This is why scoping bugs
  survive demos**: whoever demos is usually org-wide.
- **A non-empty array** — the expanded closure of the user's assigned
  units *and their descendants*.
- **An empty array** — assigned, but to nothing. Fails **closed**: sees
  zero rows.

`tenantScopeService.buildFilter(context, 'orgUnitId')` turns that into
`{ orgUnitId: { $in: [...] } }`. A row with **no** `orgUnitId` matches
nothing, so it is invisible to every narrowed user.

### Where a record's org unit comes from

| Record | Inherits from |
|---|---|
| Fuel, expense, trip, reminder, work order, DVIR, booking, fuel card | the **vehicle** |
| Driver, workshop bay, spare part, dispatch job | the **submitter** (`resolveCreationOrgUnitId`) |
| Stock movement | its parent **spare part** |
| Driver shift | the **driver**, then the vehicle |
| Digital twin, generated trip | the **vehicle** |

A cost belongs to the branch that runs the truck, not the branch that
typed it in. Attributing it to the submitter would corrupt both branches'
cost-per-km.

### Writes are scoped too

`server/tenancy/write-scope.ts` defines a **required** discriminated
union:

```ts
type WriteScope =
  | { kind: 'user';   context: TenantContext }   // org-unit scope ENFORCED
  | { kind: 'system'; tenantId: string; reason: string }  // no acting user
```

There is deliberately **no** unscoped member, and `reason` is mandatory
so the unchecked branch is never reached by accident. An optional
`context?` parameter would let the next call site reproduce the omission
and still type-check — which is exactly how ten write paths came to
resolve a vehicle by plate with no tenant filter.

`vehicleWriteResolver.resolveForWrite()` is the single place a
caller-supplied `license_plate` becomes a vehicle. It:

- never crosses a tenant boundary,
- refuses an **ambiguous** plate (409) rather than picking one,
- reports **out-of-scope identically to not-found** (400), so a narrowed
  caller cannot enumerate another branch's plates one at a time.

---

## 3. Authorization

### Roles and permissions

`server/permissions/roles.ts` holds the `Permission` enum and the
role→permission map. Routes are gated with
`withAuth(handler, { permission })`.

### `isSuperAdmin` is not what you think

`AuthContext.isSuperAdmin` is **also true for `organization_owner`**, who
is privileged only inside their own tenant. Every platform endpoint that
reads across tenants therefore checks the **literal `Role.SUPER_ADMIN`**
via `PlatformController.requirePlatformAdmin`, in addition to
`withAuth(PLATFORM_VIEW)`.

Two guards, and the second is the load-bearing one.

### Known stopgap

There is no `Permission.DRIVER_*`. Driver reads/writes are gated on
`VEHICLE_VIEW` / `VEHICLE_EDIT`, documented at the top of
`app/api/drivers/route.ts`. The nav and onboarding checklist mirror that
exactly.

---

## 4. Cross-tenant reads: the one sanctioned exception

`modules/tenancy/services/platform-directory.service.ts` is the only
service that reads across tenants by design (`GET /api/platform/users`,
`/api-keys`, `/roles`).

Because a secret leaked there is leaked for the **whole platform**, its
projections are **allow-lists**, never `delete row.secret`:

- `tbladmin` — `Password` is never projected.
- `tblapikeys` — `keyHash` is never projected; only `keyPrefix`.
- `tblcustomroles` — a permission **count**, not the grant list.

An allow-list omits a field added tomorrow by default. A deny-list
includes it by default. That direction is the entire point.

---

## 5. Aggregates are where leaks come back

Three times in this codebase a row-level list was correctly scoped and an
**aggregate over the same data was not**:

- anomaly severity counts,
- the report engine's `$match`,
- (prevented) the telematics alert summary.

Rule: **an aggregate must apply the same predicate as the rows it counts,
spread LAST** so nothing above can override the scope key, and must
require the **same permission**. `getAlertSummaryInScope` is the
reference implementation.

---

## 6. Auditability

- `tblauditlog` is **hash-chained** (`prevHash` → `hash`), so a deleted
  or edited row breaks verification.
- `tbltenant_repair_audit` records every migration, repair and reset;
  `npm run db:revert` rolls a run back from it.
- The allocation ledger is **append-only**. A wrong posting is corrected
  by a **reversing posting**, never an edit — which is why posting
  idempotency is enforced by a partial unique index rather than by a
  read-then-write.
- `scripts/reset-business-data.ts` deliberately **preserves** the audit
  log. Clearing it as part of a data reset would destroy the record of
  the reset itself.

---

## 7. Structural guards (CI, not review)

| Suite | Prevents |
|---|---|
| `module-scope-conformance` | an org-unit module missing its read wiring |
| `write-scope-conformance` | an org-unit module that cannot **set** `orgUnitId`; any raw unscoped `tblvehicles.findOne` |
| `org-unit-write-roundtrip` | a value that is *mentioned* but never reaches Mongo |
| `route-auth-conformance` | an API route with no auth |
| `ai-trigger-wiring` | a handler keyed on an event name nothing publishes |
| `allocation-posting-wiring` | the same, for money |
| `platform-directory-redaction` | a credential in a cross-tenant projection |
| `trip-generation-safety` | cross-tenant or unscoped trip generation |
| `trip-playback-scope` | movement history reachable out of scope |
| `reset-business-data-classification` | a collection deleted or preserved by accident |

Run: `npm run test:security`.

---

## 8. Threat notes

**"I am a malicious customer. How do I read another tenant's data?"**

- *Guess a plate and post a cost against it* — refused; the resolver is
  tenant-scoped and reports out-of-scope as not-found.
- *Probe ids on a detail endpoint* — `NotFoundError`, never `Forbidden`,
  so existence does not leak.
- *Ask for an aggregate instead of a list* — same predicate, same
  permission (§5).
- *Use an API key from another org* — keys carry `organizationId`; the
  platform listing never exposes `keyHash`.
- *Replay a domain event* — postings are idempotent by deterministic key
  plus a unique index.

**Still open, and stated rather than hidden:**

`loadInScopeFuel/Expense/Trip/Reminder` guard with
`if (orgUnitId && !canAccess)`. A row with **no** `orgUnitId` is
therefore reachable by any authenticated user with the permission —
including for update and delete — while the list path hides it.
Tightening it is one line per file, but it locks everyone out of every
legacy row until `npm run tenancy:backfill` has run. **Backfill first,
then tighten.**

---

## 9. Credentials

- `.env` is never packaged. Three credentials found in earlier rounds
  (an Eagle Track token, a second vendor token, a hardcoded Atlas
  password) were purged from the tree; **rotation is an operator
  action**.
- `CRON_SECRET` guards scheduled routes, timing-safe, fail-closed.
- Rate limiting keys on a **trusted** proxy hop, not the client-writable
  leftmost `x-forwarded-for` entry. Set `TRUSTED_PROXY_HOPS` for your
  topology (default 1 suits Vercel).

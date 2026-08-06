# True Multi-Tenancy — Implementation & Runbook

Phase F. Read `## Deploy sequence` before running anything against a real database.

---

## 1. The defect that mattered most

**Multi-tenancy was never executing.** Not partially — not at all, for every non-platform user.

`TenantContextService.resolveContext()` did this:

```ts
const organization = await organizationRepository.findById(tenantId, tenantId, false, true);
```

`tenantId` in this database is the organization **slug**, not its `_id`:

```
tblorganizations: { _id: ObjectId(...),
                    slug:     "willsgrove-farm-enterprises-9e80ed",
                    tenantId: "willsgrove-farm-enterprises-9e80ed" }
tblvehicles:      { tenantId: "willsgrove-farm-enterprises-9e80ed" }
```

`BaseRepository.findById()` opens with `if (!ObjectId.isValid(id)) return null;`. A slug is not 24 hex
characters, so the method returned `null` **before issuing a query** — every time, for every
organization. The `null` became `throw new NotFoundError('Organization not found')`.

`resolveContext()` is the entry point to every org-unit-scoped read path in the product. So:

* every scoped endpoint 404'd for every non-platform user;
* the org-unit scoping built in Phases A–C could never execute one query;
* the dashboard showed a **mix** of working widgets (fleet size, fuel spend — the older
  bare-`tenantId` path) and `Failed to load this widget` (expense breakdown — the
  `resolveTenantContext()` path).

That mixed-success pattern is the diagnostic signature. A platform admin returns before the lookup,
which is exactly why it was invisible from the `super_admin` account doing the testing.

The same broken call existed in **eleven** places. All are fixed and now route through
`server/tenancy/organization-resolver.ts`, which accepts slug or ObjectId and is the single place
that rule lives.

**Second blocker:** the requested ladder was impossible to build. `ALLOWED_PARENT_TYPES` only allowed
`workshop → branch` and `fleet → branch`, so creating Branch → Department → Workshop → Fleet threw
`ValidationError`. Widened as a strict superset — every previously legal tree stays legal.

---

## 2. The hierarchy

```
Platform                     PLATFORM_SCOPE_TENANT_ID ('__platform__')
  └── Organization           tblorganizations row; tenantId = slug
        └── Branch           depth 1   ─┐
              └── Department depth 2    │ tblorgunits rows
                    └── Workshop depth 3│ scoped via orgUnitId
                          └── Fleet     depth 4
                                └── Team depth 5
                                      └── Users   tbluser_scope_assignments
```

Nesting is a **superset** of the linear chain: a fleet may sit under a branch, a department, or a
workshop. What is enforced is that a unit can never nest under an equal-or-deeper type — that is what
prevents cycles.

Two independent boundaries, enforced by different code:

| Boundary | Enforced by | Applies |
|---|---|---|
| Organization ↔ Organization | `BaseRepository.getTenantFilter()` | Automatically, every query |
| Branch ↔ Branch (same org) | `tenantScopeService.buildFilter()` | Only where a developer wired it |

The second is why per-module tests and the conformance suite exist. Forgetting is invisible.

---

## 3. Module scope registry

`server/tenancy/module-scope.registry.ts` declares every module's level as reviewable data with a
written rationale, instead of leaving the decision implicit in whether some repository method happens
to call `buildFilter()`.

Eight modules previously flagged "ask before scoping" are **decided but marked
`confirmed: false`** — they surface in `npm run tenancy:report` until signed off. Flip `level` and
update the expected list in the conformance spec to change one.

| Module | Decision | Short reason |
|---|---|---|
| fuel-cards | **scoped** | Payment instrument issued against one vehicle; limits + PAN suffix |
| fuel-stations | shared | Geographic reference data; scoping breaks refuelling outside home branch |
| sla | shared | Policy must read identically everywhere, or the same event is judged differently |
| procurement | **scoped** | `BRANCH_MANAGER` holds `PROCUREMENT_APPROVE` — segregation-of-duties |
| vendors | shared | Master data; scoping fragments the register |
| compliance | **split** | Rules shared, *records* scoped (evidence about one vehicle/driver) |
| intelligence | **scoped** | Derived records can't be less protected than their inputs |
| reporting | shared defs | Leak vector is the *output*; enforcement belongs in the execution engine |

---

## 4. Deploy sequence

Order is mandatory. Each step is dry-run by default.

```bash
npm install --ignore-scripts     # see "Known environment issues"
npm run test:security            # 156 tests must pass

# 1. Inspect. Read-only, writes nothing.
npm run tenancy:report

# 2. OPTIONAL — reduce to one organization. Destructive; see §5.
npm run tenancy:purge -- --keep willsgrove-farm-enterprises-9e80ed
npm run tenancy:purge -- --keep willsgrove-farm-enterprises-9e80ed --confirm --i-understand-this-deletes-data

# 3. Build the hierarchy and provision test accounts.
npm run tenancy:provision                # dry run — prints the plan AND the credentials
npm run tenancy:provision -- --confirm   # commit; prints credentials ONCE

# 4. Assign orgUnitId to existing rows.
npm run tenancy:backfill                 # dry run
npm run tenancy:backfill -- --confirm

# 5. Verify what each account will actually see.
npm run tenancy:report
```

**Deploy the code before step 3.** The `authorize()` fix and the organization-resolver fix must both
be live, or provisioned accounts will hit the same 404 this phase removes.

### Why the backfill matters

`orgUnitId` is optional on every entity, deliberately — adding a required field to a live collection
breaks every existing row. The consequence: **an unbackfilled row is invisible to a scoped manager**
and visible to org-wide roles. That is fail-closed and correct, but it is not the end state. Until
step 4 runs, a branch manager logs in to an empty fleet.

`tenancy:report` distinguishes the two failure modes explicitly:

* *"scoped correctly but sees nothing — backfill gap"* → run step 4
* *"scoped to Harare, can see Bulawayo rows"* → an actual isolation bug

---

## 5. Purge safety

`tenancy:purge` is the only destructive script, and is deliberately **separate** from provisioning —
destroying customer data must never be a side effect of a command that sounds like it creates things.

* Dry run by default.
* `--confirm` alone is **not** sufficient; `--i-understand-this-deletes-data` is also required.
  `--confirm` is muscle memory across this repo's other scripts, and muscle memory is exactly what
  you don't want driving a delete.
* `--keep <tenantId>` is mandatory. No default. A typo aborts rather than falling back to "the first
  one".
* **Soft delete by default** (`isDeleted: true`). `--hard` is a further opt-in.
* A JSON export of everything about to be removed is written to `./reports/` first.
* Matches on canonical tenant id only, never on name — so the two distinct organizations both named
  "Toyota Zimbabwe" (`toyota-zimbabwe-63078f`, `toyota-zimbabwe-949d94`) can never be conflated.
* Accounts with no `tenantId` (platform admins) are never swept up.

---

## 6. Test accounts

`tenancy:provision` creates one account per level at `@willsgrove.test`, generates a random 12-char
password each run (`crypto.randomBytes`), and prints them **once** — only the bcrypt hash is stored.
Use `--password <pw>` for a fixed dev password.

| Account | Role | Scope | Should see |
|---|---|---|---|
| `owner@` | organization_owner | org-wide | Everything in Willsgrove; no other org |
| `admin@` | organization_admin | org-wide | Same as owner |
| `harare.manager@` | branch_manager | Harare Branch | Harare + all descendants. **Not Bulawayo** |
| `bulawayo.manager@` | branch_manager | Bulawayo Branch | Bulawayo subtree only |
| `logistics.manager@` | department_manager | Logistics Dept | Dept + its 2 fleets |
| `workshop.manager@` | workshop_manager | Harare Central Workshop | Workshop + loan fleet |
| `fleet.manager@` | fleet_manager | Harare Heavy Fleet | Narrowest manager scope |
| `driver@` | driver | Harare Heavy Fleet | Own trips/shifts → lands on `/trips` |
| `mechanic@` | mechanic | Harare Central Workshop | Work orders → lands on `/maintenance` |
| `accountant@` | accountant | org-wide | Financials |
| `auditor@` | auditor | org-wide | Read-only |
| `unassigned@` | viewer | **none** | **ZERO rows** |

`unassigned@` is the control. A scoped role with no scope assignment must see **nothing** — not the
whole organization. **If that account sees any data, isolation is broken.**

The tree is deliberately asymmetric (Bulawayo is shallow, with a fleet directly under the branch) so
the tests exercise the widened nesting rules rather than only the uniform four-deep path.

---

## 7. Landing routing

`app/page.tsx` was a literal `<h1>Fleet Management</h1>` with no redirect, and `/` is a *public* path
in middleware — so an authenticated user hitting the site root landed on a dead page and concluded
they'd been logged out. Every login path also hard-coded `router.push('/dashboard')`.

`server/permissions/landing.ts` resolves by **permission, not role** — a role list here drifts out of
sync with `roles.ts`, which middleware's `/admin` check already did once.

Ordering matters and is load-bearing: `DRIVER` and `MECHANIC` both hold `VEHICLE_VIEW`, so the
specialised destinations must be checked **before** the generic fallback. Getting this wrong sends
both roles to a dashboard where every widget is permission-gated off — an empty page that fails
silently. There is a test for exactly this.

`callbackUrl` is now validated (`isSafeRedirectPath`) before use — an unvalidated redirect parameter
is an open-redirect phishing primitive.

---

## 8. Tests

`npm run test:security` — **156 passing** (was 57).

| Suite | Covers |
|---|---|
| `tenant-isolation.spec.ts` | Organization ↔ organization (pre-existing) |
| `tenant-scope.spec.ts`, `tenant-identity.spec.ts` | Fail-closed resolver (pre-existing) |
| `org-unit-isolation.spec.ts` | **Branch ↔ branch within one organization** |
| `tenant-hierarchy.spec.ts` | Ladder constructibility, ordering, landing, open-redirect |
| `module-scope-conformance.spec.ts` | **Registry enforced against the source tree** |

The conformance suite is the one that changes future behaviour. It reads the registry and fails CI if
a module declared `org-unit` lacks its `orgUnitId` field, its repository wiring, or its addendum
import. The recurring failure here has never been "someone wrote a bad filter" — it has been "someone
added a read path and never thought about scoping", which is invisible and therefore the default
outcome under deadline. This makes it loud.

No `mongod` required; everything runs against `tests/helpers/fake-collection.ts`.

---

## 9. Known environment issues

* **`npm install` fails in sandboxed/air-gapped CI.** `@sentry/cli`'s postinstall fetches a binary
  from `downloads.sentry-cdn.com` and gets a 403. Workaround: `npm install --ignore-scripts`. Since
  Sentry is already non-functional on Next 15 (`@sentry/nextjs` v6 incompatibility, pre-existing),
  removing the dependency is the cleaner fix.
* **83 type errors remain** — unchanged from baseline. Verified by diffing `tsc --noEmit` against the
  untouched original: **zero introduced, zero fixed**. All are pre-existing
  `null`-vs-`undefined` mismatches in frontend components. `ignoreBuildErrors: true` still cannot be
  turned off.

---

## 10. Still open

* **Controllers** are not yet switched to the `*InScope` repository variants. The repository layer is
  wired and tested; each controller still calls the unscoped method. Until a controller passes a
  `TenantContext`, that endpoint stays organization-wide. This is the largest remaining item and is
  mechanical: resolve context, call the `InScope` variant.
* Eight scope decisions await product sign-off (§3).
* `reporting` execution-engine filtering — the registry documents that enforcement belongs there;
  the change itself isn't made.
* Geofences with no `orgUnitId` are treated as organization-wide shared boundaries by design; the
  backfill deliberately won't invent one.

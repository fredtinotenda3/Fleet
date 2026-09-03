# Platform Admin — Users, Roles & Permissions: backend gaps

**Frontend only. No backend route, permission, DTO or response shape was
changed, and none was added.** No vehicle/driver assignment file was
touched.

This document records what was searched, what exists, what does not, and
the two findings that are security issues rather than missing features.
It is a spec for the next backend change, not a description of shipped
code.

---

## Summary

| # | Gap | Severity | Shipped behaviour |
|---|---|---|---|
| 1 | No platform-wide user endpoint | Feature | Directory **derived** from the organizations listing; page states its own scope |
| 2 | Member routes take an organization id nothing binds to the caller | **Security — FIXED** | Writes restricted to the caller's own organization, fail-closed |
| 3 | `/api/admin` legacy surface is under-gated | **Security — FIXED** | Routes removed; nothing in the product used them |
| 4 | API keys are organization-scoped, not platform-scoped | Feature | Page says so in a banner; heading is "API keys", not "Platform API keys" |
| 5 | Custom roles cannot be assigned to a member | Feature | Role dialog lists built-in roles only and explains why |
| 6 | Custom role listing is tenant-scoped | Feature | Card states it shows the caller's own organization only |

---

## What was searched

Every location named in the brief, plus the ones that actually hold the
data:

| Looked for | Found |
|---|---|
| `app/api/users/**` | **Does not exist** |
| `app/api/roles/**` | **Does not exist** — roles live at `/api/security/roles` |
| `app/api/permissions/**` | **Does not exist** — at `/api/security/permissions` |
| `app/api/audit-log/**` | **Does not exist** — at `/api/security/audit-log` |
| `app/api/admin/**` | Exists — legacy `tbladmin`, jobs, register/update/delete. See gap 3 |
| `app/api/platform/**` | `organizations`, `organizations/:id`, `organizations/:id/status`, `stats` |
| `app/api/security/**` | 31 routes incl. roles, permissions, api-keys, audit-log, sessions, lockouts, scope-assignments |
| `app/api/organizations/:id/members/**` | POST (add direct), invite, suspend, restore, PATCH role, DELETE — **but no GET** |

---

## Endpoints used — all of which already existed

| Feature | Route | Method | Server gate | Scope |
|---|---|---|---|---|
| Users directory | `/api/platform/organizations` | GET | `PLATFORM_VIEW` **+ literal `Role.SUPER_ADMIN`** | Cross-tenant |
| Organization + members | `/api/platform/organizations/:id` | GET | same | Cross-tenant |
| Custom roles | `/api/security/roles` | GET | `CUSTOM_ROLE_VIEW` | Caller's tenant |
| Permission catalogue | `/api/security/permissions` | GET | `CUSTOM_ROLE_VIEW` | Global registry |
| API keys | `/api/security/api-keys` | GET, POST | `API_KEY_VIEW` / `API_KEY_MANAGE` | Caller's tenant |
| Revoke API key | `/api/security/api-keys/:id` | DELETE | `API_KEY_MANAGE` | Caller's tenant |
| Audit log | `/api/security/audit-log` | GET | `AUDIT_LOG_VIEW` | Cross-tenant **for super admins only** |
| Chain verification | `/api/security/audit-log/verify` | GET | `AUDIT_LOG_VIEW` | Global chain |
| Invite member | `/api/organizations/:id/members/invite` | POST | `ORG_MEMBERS_MANAGE` | See gap 2 |
| Suspend / restore | `.../members/:memberId/suspend` \| `/restore` | POST | `ORG_MEMBERS_MANAGE` | See gap 2 |
| Change role | `.../members/:memberId` | PATCH | `ORG_MEMBERS_MANAGE` | See gap 2 |
| Remove member | `.../members/:memberId` | DELETE | `ORG_MEMBERS_MANAGE` | See gap 2 |

Three behaviours verified in the controllers rather than assumed:

* **`GET /api/organizations/:id/members` does not exist.** The route
  file exports only `POST` and `DELETE`. Members are read from the
  `members[]` array embedded on the `Organization` document, which both
  `GET /api/organizations/:id` and `GET /api/platform/organizations/:id`
  return in full.
* **`GET /api/platform/organizations` returns FULL documents.**
  `PlatformService.listOrganizations` passes no projection to
  `organizationRepository.findWithPagination`, so every organization on
  the page arrives with its `members[]` and `invites[]`. This is what
  makes the user directory possible with **zero fan-out**.
* **The static role matrix has no endpoint.** `GET /api/security/roles`
  returns tenant-defined *custom* roles. `rolePermissions` in
  `server/permissions/roles.ts` is a plain TypeScript module the
  frontend already imports (`Sidebar.tsx` uses `permissionService` from
  it), so the built-in matrix is read from source — which means what the
  screen renders is exactly what the permission engine enforces, with no
  possibility of drift.

---

## Gap 1 — No platform-wide user endpoint

**Affects:** `UsersPage`.

There is no `/api/users`, no `/api/platform/users`, no cross-tenant user
search, and no user-by-id lookup anywhere in `app/api`. `tblusers` has
no controller of its own; `AdminUserRepository` is reached only through
`OrganizationService`.

### Shipped behaviour

The directory is **derived** from `GET /api/platform/organizations` by
flattening each organization's `members[]` and pending `invites[]`
(`buildUserDirectory()`). Cost: zero extra requests. Scope: exactly the
organizations on the current page — which the page states in an `Alert`
whenever `pagination.hasNext` is true, rather than presenting a partial
list as complete. An operator who searches for someone and finds nothing
needs to be able to tell "not on the platform" from "not on this page".

### Suggested endpoint

#### `GET /api/platform/users`

**Permission:** `Permission.PLATFORM_VIEW` **plus** the literal
`Role.SUPER_ADMIN` check in `PlatformController.requirePlatformAdmin` —
the same double gate every other `/api/platform` route carries, and for
the same reason: `AuthContext.isSuperAdmin` is also true for
`organization_owner`, who must never reach a cross-tenant surface.

**Query parameters**

| Param | Type | Notes |
|---|---|---|
| `search` | string | Matches email and name. Use `containsMatch` from `shared/utils/regex.utils.ts`, as `PlatformService.listOrganizations` already does |
| `status` | `active` \| `invited` \| `suspended` | |
| `role` | string | One of `ORGANIZATION_ROLES` |
| `organizationId` | string | Slug or ObjectId, via `resolveOrganization` |
| `page`, `limit` | number | Through `validatePaginationParams` |

**Response:** `paginatedResponse(rows, pagination)` where a row is

```jsonc
{
  "userId": "…",
  "email": "person@example.com",
  "name": "Ada Lovelace",
  "role": "fleet_manager",
  "status": "active",
  "organizationId": "…",
  "organizationName": "Acme Haulage",
  "organizationTenantId": "acme-haulage",
  "joinedAt": "2026-01-04T09:12:00.000Z",
  "orgUnitId": "…"
}
```

Implementation notes:

* **One `$unwind` on `members`, not a fan-out.** An aggregation over
  `tblorganizations` unwinding `members` and matching on the unwound
  fields answers this in a single pipeline.
* **Never include `invites[].token`.** It is a credential that grants
  organization access to whoever holds it. The derived directory
  deliberately drops it, and there is a test asserting it never appears
  in the output (`platform-access.utils.spec.ts`).
* A person in two organizations is **two rows**, not one. They are two
  memberships with independent roles and statuses, and collapsing them
  hides one.

Frontend change once it ships: replace `buildUserDirectory` with a query
in `UsersPage`, and delete the "partial directory" `Alert`. The table
component takes the same row shape and needs no change.

---

## Gap 2 — Member routes are not bound to the caller's tenant

**Severity: security. This one is not a missing feature — it is a
missing authorization check.**

**Status: FIXED.** `OrganizationService.getOrganization(organizationId,
tenantId)` now enforces the tenant-binding check described below —
see "What actually shipped" at the end of this section for the
enforcement, the helper it uses, and the regression test file. The
platform-scoped member-management routes proposed in "Suggested fix"
were deliberately **not** added as part of this change; only the
missing check was closed. They remain a Gap 2 follow-up, not a
prerequisite for it.

### What was found

All five member routes take the organization from the URL:

```
POST   /api/organizations/:id/members/invite
POST   /api/organizations/:id/members/:memberId/suspend
POST   /api/organizations/:id/members/:memberId/restore
PATCH  /api/organizations/:id/members/:memberId
DELETE /api/organizations/:id/members/:memberId
```

Each is wrapped in `withAuth(..., { permission: Permission.ORG_MEMBERS_MANAGE })`.
`withAuth` checks authentication, permissions, roles and rate limits — it
does **not** check that the caller is entitled to the resource named in
the path.

The controller then resolves the organization:

```ts
// OrganizationController.suspendMember
const tenantId = await getTenantFromRequest(req);
await organizationService.suspendMember(id, memberId, userId, tenantId);
//                                      ^^ from the URL
```

…and the service ignores the tenant it was handed:

```ts
// OrganizationService.getOrganization(organizationId, tenantId)
const organization = await resolveOrganization(organizationId);
if (!organization) throw new NotFoundError(...);
return organization;
// `tenantId` is never read. No comparison is made.
```

`tenantId` is used **only** to stamp the audit entry — so the audit trail
would record the acting tenant correctly while the write itself landed
in another one.

**Consequence:** an `organization_admin` (or any role holding
`ORG_MEMBERS_MANAGE`) in tenant A can address tenant B's organization id
and suspend, remove, or change the role of B's members. The request
succeeds.

Contrast with the org-unit endpoints, which have the *opposite* flaw:
`/api/tenancy/org-units` **overrides** the organization with the
caller's session tenant, so a cross-tenant write silently lands in the
wrong place. Neither is safe, but they fail in opposite directions, and
gap 2 is the more serious: one misfires, the other is simply unguarded.

### Shipped behaviour

Member **reads** are cross-tenant (via
`GET /api/platform/organizations/:id`, which genuinely is a
SUPER_ADMIN-gated platform read). Member **writes** are offered only
when the viewed organization is provably the caller's own, decided by
`canManageMembersFor(org, sessionTenantId)` — the same fail-closed shape
`canManageOrgUnitsFor` already uses. When it returns false the section
renders an `Alert` naming the reason instead of buttons.

This is not a claim that the frontend guard is a security control. It is
not: anyone can call the API directly. It is a refusal to ship a UI whose
correctness depends on a check that does not exist.

### Suggested fix

Smallest correct change, in `OrganizationService`:

```ts
async getOrganization(organizationId: string, tenantId: string): Promise<Organization> {
  const organization = await resolveOrganization(organizationId);
  if (!organization) throw new NotFoundError(`Organization not found: "${organizationId}"`);

  // A caller may only reach their own organization through this path.
  // Platform-wide reads go through PlatformService, which is gated on
  // the literal Role.SUPER_ADMIN.
  if (!isPlatformScope(tenantId) && !matchesTenant(organization, tenantId)) {
    // 404, not 403 — a 403 confirms the id is real. Same convention as
    // AnomalyController.getById and the Phase G scope rules.
    throw new NotFoundError(`Organization not found: "${organizationId}"`);
  }

  return organization;
}
```

Callers that legitimately need cross-tenant access already exist and do
not route through here (`PlatformService.getOrganization` calls
`resolveOrganization` directly).

Then, for genuine cross-tenant member administration, add
platform-scoped equivalents under the existing double gate:

```
POST   /api/platform/organizations/:id/members/:memberId/suspend
POST   /api/platform/organizations/:id/members/:memberId/restore
PATCH  /api/platform/organizations/:id/members/:memberId
DELETE /api/platform/organizations/:id/members/:memberId
```

all `PLATFORM_MANAGE` + literal `Role.SUPER_ADMIN`, delegating to the
same service methods. Once those exist, `canManageMembersFor` widens to
"own organization **or** platform admin" and the read-only `Alert`
disappears.

> **Regression test worth adding alongside the fix.** `tests/security/`
> already holds scope-conformance suites of exactly this shape (see
> `export-scope-conformance.spec.ts`). A case asserting that a tenant-A
> caller with `ORG_MEMBERS_MANAGE` gets a 404 from tenant B's member
> routes would pin this closed.

### What actually shipped

The suggested fix above was implemented essentially as written, with
one substitution: no `matchesTenant` helper existed anywhere in the
codebase, so it was added to `server/tenancy/tenant-scope.ts` — the
file's own header already names itself the single source of truth for
tenant-scope logic, and it already exports the sibling `isPlatformScope`
helper the fix depends on. `matchesTenant` does the same exact-string
comparison `BaseRepository.getTenantFilter()` uses to build `{ tenantId:
scope.tenantId }` predicates, so the new check is consistent with how
every other repository already decides "is this record mine."

`modules/organizations/services/organization.service.ts`,
`getOrganization(organizationId, tenantId)`:

```ts
const organization = await resolveOrganization(organizationId);
if (!organization) {
  throw new NotFoundError(`Organization not found: "${organizationId}"`);
}

if (!isPlatformScope(tenantId) && !matchesTenant(organization.tenantId, tenantId)) {
  // 404, not 403 -- same convention as before.
  throw new NotFoundError(`Organization not found: "${organizationId}"`);
}

return organization;
```

Every member-write path (`addMember` / invite, `suspendMember`,
`restoreMember`, `updateMemberRole`, `removeMember`) already calls
`getOrganization` first, so this one change closes the gap for all five
routes at once. `PlatformService.getOrganization` calls
`resolveOrganization()` directly and was already gated on the literal
`Role.SUPER_ADMIN` at the controller — it does not route through
`OrganizationService.getOrganization` and is unaffected. A literal
`SUPER_ADMIN` caller's `tenantId` is always the platform sentinel (see
`server/auth/auth-context.ts`), so `isPlatformScope(tenantId)` is `true`
for them and the same member-write routes keep working for a genuine
platform admin.

**Regression tests:**
`tests/security/organization-member-tenant-binding.spec.ts` — covers,
against the real `OrganizationService` and `OrganizationRepository`:

* a tenant-A caller with `ORG_MEMBERS_MANAGE` cannot suspend, restore,
  change the role of, remove, or invite-into tenant B (and the reverse
  direction);
* every one of those cross-tenant calls rejects with `NotFoundError`
  whose `statusCode` is `404`, not `403`;
* the same five operations still succeed for a caller acting on their
  own organization;
* a platform-scoped caller (`tenantId === PLATFORM_SCOPE_TENANT_ID`,
  i.e. a literal `SUPER_ADMIN`) is exempt from the tenant check and can
  still act cross-tenant;
* a nonexistent organization id still 404s, unchanged from before the
  fix.

---

## Gap 3 — `/api/admin` is a legacy, under-gated surface

**Severity: security.**

**Status: FIXED by removal.** `app/api/admin/route.ts`,
`app/api/admin/register/route.ts`, `app/api/admin/update/route.ts`, and
`app/api/admin/delete/route.ts` have been deleted. See "What actually
shipped" below for why removal (rather than migration onto
`withAuth`/`Permission`) was the safe choice here, and what remains as
an operational follow-up.

`app/api/admin/route.ts` returned every row of the legacy `tbladmin`
collection. Its problems, in its own header's words and verified in the
code:

* **Gated on `requireAuth()` alone** — any authenticated user, from any
  tenant, with no `Permission` check and no tenant filter. Every other
  admin surface in the app goes through `withAuth` + a `Permission`.
* **No tenant scoping at all.** The query is `db.collection("tbladmin").find()`.
* **Wrong response shape.** It returned a bare array via
  `NextResponse.json(admins)`, not the `{ success, data }` envelope
  `apiClient.handleResponse` expects.
* Its own comment called it "a pre-multi-tenancy holdover… It should be
  migrated onto that system (or removed) rather than patched
  indefinitely."

At the time of this fix, `admin/register`, `admin/update` and
`admin/delete` had already been separately hardened in a prior pass —
each required `context.isSuperAdmin` and tenant-scoped non-platform
callers — so they were no longer exactly as exposed as `route.ts`
remained. They still shared the deeper problem: routes bypassing
`withAuth`/`Permission` entirely, invisible to the Permission-based
conformance tooling the rest of the app relies on, and reachable by
nobody in the actual product.

### Shipped behaviour (before this fix)

**Not used.** The Users page is built on `/api/platform/organizations`
instead. Wiring a Platform Admin screen to `/api/admin` would put an
under-gated endpoint into the product's administration surface and imply
it is platform-grade.

### What actually shipped

Before choosing between the two options below, this pass looked for
every consumer of these four routes — Platform Admin frontend,
organization-member flows, other backend modules, and the test suite —
and found **none**. `OrganizationMember` (embedded on `Organization`,
see Gap 1/2 above) is the platform's real user-membership model, and
tenant-bound account creation/update/removal already goes through
`OrganizationService` (`addMember`, `addMemberDirect`,
`suspendMember`/`restoreMember`, `updateMemberRole`, `removeMember`) via
`/api/organizations/*`, not through this surface. That made **removal**
the safe option per the stated preference order, not the migration
fallback:

1. Deleted `app/api/admin/route.ts`, `app/api/admin/register/route.ts`,
   `app/api/admin/update/route.ts`, `app/api/admin/delete/route.ts`.
2. Left the unrelated `/api/admin/jobs/*` and `/api/admin/reminders/*`
   routes untouched — they are a separate, already `withAuth` +
   `Permission`-gated feature (job scheduling / maintenance-reminder
   triggers) that happens to share the `/api/admin` URL prefix, not
   part of this finding.
3. Updated the two frontend comments that referenced `/api/admin` as an
   unused-but-present alternative (`frontend/modules/platform-admin/
   types/access.types.ts`, `.../pages/UsersPage.tsx`) to state it has
   been removed, so they don't describe a route that no longer exists.
4. Corrected a factual error carried from the original audit write-up:
   the earlier "suggested fix" below states `AdminUserRepository`
   "fronts `tblusers`" — there is no `tblusers` collection anywhere in
   this codebase. `AdminUserRepository` (and `lib/authOptions.ts`, and
   every script under `scripts/*` that touches admin accounts) reads
   and writes `tbladmin`, the same collection the removed routes
   exposed. `tbladmin` is **not** a dead table and was **not** touched
   by this fix: it remains the collection NextAuth authenticates
   against and the one `OrganizationService.addMemberDirect` writes new
   login-ready accounts to. Removing the four HTTP routes closes the
   unauthorized *read/write surface* over it; it does not affect
   `tbladmin` itself.
5. `lib/requireAuth.ts` (the auth helper `GET /api/admin` used) has no
   remaining callers after this change. It has been left in place
   rather than deleted, since removing a now-unused helper file was
   judged out of scope for a security fix — noted here as a minor
   cleanup follow-up, not a risk.

**Operational follow-up (not code):** `tbladmin` still stores live,
bcrypt-hashed credentials and predates the `tenantId`-scoping
conventions the rest of the app follows (see
`modules/organizations/repositories/admin-user.repository.ts`'s own
header). Migrating it onto the current `BaseEntity`/tenant-scoping model
— or consolidating it with `OrganizationMember` outright — remains
worthwhile, but is a data-migration project, not something to fold into
a routes-removal fix. No credential field was exposed by this change in
either direction: it was already stripped by the one route that
returned data, and no route returns `tbladmin` rows any more at all.

### Regression tests

`tests/security/legacy-admin-routes-removed.spec.ts` — covers:

* all four route files are gone from disk, and `require()`-ing any of
  their paths fails with `Cannot find module` — the structural proxy
  for "no anonymous, authenticated non-super-admin, or super-admin
  caller can reach this route any more," since there is no handler left
  for any of them to reach;
* the unrelated `/api/admin/jobs/*` and `/api/admin/reminders/*` routes
  still exist, untouched;
* no file in the tracked tree still references any of the removed URL
  paths (a repository-wide scan, excluding this suite and the two
  now-updated frontend comments documenting the removal);
* no other `app/api/**/route.ts` reads the `tbladmin` collection
  directly outside a small, named allow-list of legitimate,
  already-reviewed auth call sites (login, token refresh, SSO precheck);
* neither `AdminUserRepository` nor the token controller returns a raw
  `tbladmin` document (and therefore its `Password` hash) in an HTTP
  response;
* `PLATFORM_ADMIN_BACKEND_GAPS.md` itself records Gap 3 as fixed.

### Suggested fix (original audit text, superseded above)

Two options, both out of scope here:

1. **Remove it.** `OrganizationMember` is the platform's real user model
   and `AdminUserRepository` already fronts `tblusers`. If nothing reads
   `tbladmin` any more, deleting these four routes closes the hole
   outright.
2. **Migrate it** onto `withAuth` + `Permission.PLATFORM_VIEW`, add
   tenant scoping, and return the standard envelope.

Until then it is worth confirming whether `tbladmin` still holds live
credentials — an unscoped, permission-free read of an account table is a
finding regardless of what the UI does with it.

---

## Gap 4 — API keys are organization-scoped, not platform-scoped

**Affects:** `PlatformApiKeysPage`.

`ApiKeyController` resolves the organization from the session on every
verb:

```ts
async list(req, context)   { …apiKeyService.listForOrganization(context.tenantId, …) }
async create(req, context) { …apiKeyService.createApiKey(parsed.data, context.tenantId, context.userId) }
async revoke(req, context, id) { …apiKeyService.revoke(id, context.tenantId, …) }
```

There is no parameter that widens this and no cross-tenant listing.

### Shipped behaviour

The page is titled **"API keys"**, not "Platform API keys", and carries a
banner stating that the endpoints resolve the organization from the
session so it can only show and create keys for the organization the
admin belongs to. A page titled "Platform API keys" showing one tenant's
keys is a lie an operator cannot detect by looking — and the mistake it
invites (assuming a key seen here is the only one on the platform) is the
kind that surfaces during an incident.

Two related behaviours the UI compensates for, both verified in the
service:

* **`keyHash` never reaches the browser.** `listForOrganization` and
  `getById` both destructure it away. The frontend type deliberately
  does not declare it, so no component can render it.
* **`status` is not swept to `expired`.** Expiry is checked at
  authentication time in `ApiKeyService.verify`; nothing updates the
  stored status. A key past its expiry still arrives as
  `status: "active"`. The table renders an **effective** status instead
  (`effectiveApiKeyStatus()`), because showing the stored value verbatim
  tells an operator a dead key is live.

### Suggested endpoint

#### `GET /api/platform/api-keys`

`PLATFORM_VIEW` + literal `Role.SUPER_ADMIN`, optional `organizationId`
filter, returning the same `Omit<ApiKey, 'keyHash'>` rows plus the
owning organization's name. Revocation should stay a
`PLATFORM_MANAGE` write with a required `reason`, since revoking another
tenant's key breaks their integrations.

A background sweep (or a `$set` in `verify`) that moves an expired key's
stored status to `expired` would also let `effectiveApiKeyStatus` be
retired.

---

## Gap 5 — Custom roles cannot be assigned to a member

**Affects:** `MemberRoleDialog`, `RolesPermissionsPage`.

`POST /api/security/roles` creates a `CustomRole`. But
`OrganizationService.updateMemberRole` validates against the static enum:

```ts
if (!VALID_ROLES.includes(newRole)) throw new ValidationError(`Invalid role: ${newRole}`);
// VALID_ROLES = ORGANIZATION_ROLES = Object.values(Role) minus SUPER_ADMIN
```

`addMember` (invite) and `addMemberDirect` do the same. So a custom role
can be **defined** but assigned to nobody — and `OrganizationMember.role`
is a `string`, so there is no type-level obstacle, only this check.

### Shipped behaviour

The role dropdown lists `ASSIGNABLE_ORGANIZATION_ROLES` only. When the
organization has at least one custom role, the dialog says why they are
absent, and the Roles page repeats it under the custom-roles table.
Listing them would produce a `ValidationError` the operator would have to
decode from a toast.

### Suggested fix

Widen the check to accept a custom role id or name that resolves within
the same organization:

```ts
const isStatic = VALID_ROLES.includes(newRole);
const isCustom = await customRoleService.existsInOrganization(newRole, tenantId);
if (!isStatic && !isCustom) throw new ValidationError(`Invalid role: ${newRole}`);
```

The permission engine already resolves a custom role's grants
(`CustomRole.permissions` + `customPermissionKeys`, additive over
`baseRole`), so nothing downstream needs to change. Note that
`OrganizationMember.permissions` is a separate stored array — decide
explicitly whether assigning a custom role populates it or whether
resolution stays dynamic, because having both is how two answers to
"what can this person do" appear.

---

## Gap 6 — Custom role listing is tenant-scoped

**Affects:** `RolesPermissionsPage`.

`RoleController.listRoles` resolves the tenant from the session
(`getTenantFromRequest(req)`), so even a platform admin sees only their
own organization's custom roles. There is no cross-tenant role listing.

### Shipped behaviour

The custom-roles card says so in its description rather than implying a
platform-wide list. The built-in role matrix above it *is* global (read
from source), so the page is not empty for a platform admin whose own
tenant defines no custom roles.

### Suggested endpoint

`GET /api/platform/roles` under the usual double gate, with an optional
`organizationId`, returning `CustomRole[]` plus the owning organization's
name.

---

## Things that exist and were deliberately **not** built

* **Create / edit / delete custom roles.** `POST /api/security/roles` and
  `PATCH|DELETE /api/security/roles/:id` all exist and are gated on
  `CUSTOM_ROLE_MANAGE`. The brief asked to *show* role definitions and
  grants; a role editor is a permission-composition surface with real
  blast radius (`customPermissionKeys` accepts arbitrary registry keys)
  and wants its own slice with a preview of the resulting effective
  permission set. The read path and types are in place for that to be an
  additive change.
* **Sessions and lockouts.** `/api/security/sessions`,
  `/api/security/sessions/users/:userId` and `/api/security/lockouts`
  exist and would make a natural "user detail" drawer — but there is no
  cross-tenant user to hang it off yet (gap 1), and per-user session
  revocation is a different kind of action from directory browsing.
* **Scope assignments.** `/api/security/scope-assignments` assigns a user
  to an org unit, but `UserScopeController.assign` forces
  `organizationId: tenantId` from the session — the same constraint as
  org units. It belongs with the branch-management surface, gated the
  same way, once gap 2's platform-scoped equivalents exist.
* **Adding a member directly.** `POST /api/organizations/:id/members`
  creates a login-ready account with a temporary password returned in the
  response. That is a credential-handling flow (display once, force
  rotation) and deserves the same care as the API key panel rather than
  being bolted onto the invite dialog.

---

## Verification

| | Result |
|---|---|
| `npm run type-check` | 0 errors |
| `npm run test:unit` | 99 suites / 1814 passed (100 new in `tests/unit/platform-admin/platform-access.utils.spec.ts`) |
| `npx eslint` on new files | 0 problems |

New routes, four:

```
/platform-admin/users
/platform-admin/roles
/platform-admin/api-keys
/platform-admin/audit-log
```

**Modified — two files, both additive:**

* `frontend/shared/ui/navigation/Sidebar.tsx` — one `Platform Admin`
  entry with four children in the **existing** `Platform` section. This
  also fixes a dead page: `/platform-admin/organizations` has shipped
  since the first slice with no nav entry, reachable only by typing the
  URL.
* `frontend/modules/platform-admin/pages/OrganizationDetailPage.tsx` —
  one import and one `<OrganizationMembersSection />` element. No
  existing markup changed.

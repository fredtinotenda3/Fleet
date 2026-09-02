# Platform Admin UI — slice 1

Frontend only. **No backend route, permission, DTO or response shape was
changed**, and none was added.

---

## Verification

| | Result |
|---|---|
| `npm run type-check` | **0 errors** |
| `npm test` | **94 suites / 1595 passed** (was 94 / 1541 — the 54 new are this slice's unit tests) |
| `next build` | **219 static pages, 0 errors** (was 218; the one addition is `/platform-admin/organizations`) |

The build was run on a throwaway copy with `next/font` stubbed, because
`next/font` fetches Geist from Google at build time and this environment
has no route to it — a pre-existing condition unrelated to this work.
The only warning is the pre-existing `@opentelemetry` *Critical
dependency*.

New routes, exactly two and no more:

```
○ /platform-admin/organizations           (static)
ƒ /platform-admin/organizations/[id]      (dynamic)
```

---

## Endpoints used — all of which already existed

| Feature | Route | Method | Server gate |
|---|---|---|---|
| List organizations | `/api/platform/organizations` | GET | `PLATFORM_VIEW` **+ literal `Role.SUPER_ADMIN`** |
| Organization detail | `/api/platform/organizations/:id` | GET | same |
| Platform counters | `/api/platform/stats` | GET | same |
| Create organization | `/api/organizations` | POST | authenticated (self-service) |
| List org units | `/api/tenancy/org-units` | GET | `ORG_UNIT_VIEW` |
| Create org unit | `/api/tenancy/org-units` | POST | `ORG_UNIT_MANAGE` |

Two details worth knowing, both verified in the controllers rather than
assumed:

* **The platform routes are guarded twice.**
  `PlatformController.requirePlatformAdmin` checks for the literal
  `Role.SUPER_ADMIN` *on top of* `withAuth(PLATFORM_VIEW)`, because
  `AuthContext.isSuperAdmin` is also true for `organization_owner`. The
  page's own `PLATFORM_VIEW` check is a UI convenience — it shows a
  clear message instead of a failed fetch — and is not the enforcement
  point.
* **Org units use the tenancy path, not `/api/security/org-units`.**
  Both exist and both now run hierarchy validation, but
  `app/api/tenancy/org-units/route.ts` is the one whose POST goes
  through `TenancyController.createOrgUnit`, its own header names it as
  the path the app's UI uses, and `frontend/modules/organizations`
  already targets it. A second base path for one collection is how two
  screens end up disagreeing about validation.

---

## The one feature that could not be built as specified

**Branch management for an organization other than your own.**

`/api/tenancy/org-units` resolves `organizationId` from the **caller's
session** on both verbs:

```ts
// OrgUnitController.listOrgUnits
const tenantId = await getTenantFromRequest(req);
await orgUnitService.listOrgUnits({ organizationId: tenantId, ... });

// TenancyController.createOrgUnit
await orgUnitHierarchyService.createOrgUnit(
  { ...parsed.data, organizationId: tenantId },   // session tenant spread LAST
  userId
);
```

`orgUnitCreateSchema` does not declare `organizationId` at all, and the
create path spreads the session's tenant **last**, so a body naming
another organization is overridden rather than honoured. There is no
platform-scoped equivalent anywhere in `app/api`.

So on the detail page for a tenant that is not the signed-in admin's
own, listing branches would have shown **the admin's own branches under
someone else's organization name**, and "Add unit" would have created
the branch **in the admin's own tenant** — with every request returning
200. Wrong data that looks right, plus a write that silently lands
somewhere else, is the worst available outcome, so the section is gated
instead:

* `canManageOrgUnitsFor(org, sessionTenantId)` decides, and fails closed
  on a missing session tenant or an unloaded organization;
* when it returns false the page renders an `Alert` naming the reason
  and the caller's own tenant, rather than an empty table;
* the query is `enabled: false` in that case, so nothing is fetched and
  no stale cache can leak into the view.

Consequently the detail page **does** list and create branches when a
super admin is viewing their own organization, and explains itself
otherwise. Closing the gap needs a backend change that is out of scope
here — e.g. `GET/POST /api/platform/organizations/:id/org-units`
resolving the organization from the path under `PLATFORM_MANAGE`.

---

## Two further backend behaviours surfaced rather than hidden

1. **Creating an organization makes *you* its owner.**
   `OrganizationController.createOrganization` sets `ownerId` from the
   caller. `ownerEmail`/`ownerName` only populate the owner member
   record; they do not transfer ownership. The form says so in an
   `Alert` above the fields — this is the only organization-creation
   endpoint that exists, so the alternative was to omit the feature.

2. **That endpoint has no schema.** It reads `body.name`,
   `body.ownerEmail` and `body.ownerName` straight off the request;
   only `OrganizationService`'s own non-empty-`name` check runs. The
   form therefore validates with a plain function
   (`validateCreateOrganization`) rather than a `zodResolver`: there is
   no server schema to mirror, and writing one would imply a contract
   that does not exist. The owner fields are required client-side
   anyway, because an organization created with a blank owner email
   produces a member row nobody can be contacted through and nothing
   server-side prevents it.

---

## Deliberately not built in this slice

* **Suspend / reactivate.** `PUT /api/platform/organizations/:id/status`
  exists and is wired in the service layer
  (`platformAdminApi.setOrganizationStatus`, `useSetOrganizationStatus`)
  but no UI calls it yet. It is a `PLATFORM_MANAGE` write that cuts off
  a live tenant, so it wants a confirmation flow and a reason field —
  the endpoint records `reason` on an audit entry — rather than a button
  bolted onto a list slice. The plumbing is in place for that to be a
  small, self-contained addition.
* **Editing an organization or an org unit.** `PATCH
  /api/organizations/:id` and `PATCH /api/tenancy/org-units/:id` exist;
  the brief asked for list + create, and the organizations module
  already owns the in-tenant editing surface at `/organizations/teams`.
* **A second org-unit tree widget.**
  `frontend/modules/organizations/components/roles/OrgUnitTree.tsx`
  already provides the interactive tree. `OrgUnitTable` here is a
  read-oriented columnar view for scanning type/code/status; it does not
  replace or duplicate that component's editing behaviour.

---

## Files

**New — module** (`frontend/modules/platform-admin/`, mirroring
`frontend/modules/observability/`)

```
types/index.ts                      endpoint map + wire shapes
services/platform-admin.api.ts      apiClient calls, one per real route
hooks/usePlatformOrganizations.ts   TanStack Query hooks + query keys
hooks/index.ts
utils/platform-admin.utils.ts       every pure function (all tested)
components/OrganizationTable.tsx
components/OrganizationForm.tsx
components/OrgUnitTable.tsx
components/OrgUnitForm.tsx
components/index.ts
pages/OrganizationsPage.tsx
pages/OrganizationDetailPage.tsx
pages/index.ts
routes/index.ts
index.ts
```

**New — route shims**

```
app/(protected)/platform-admin/organizations/page.tsx
app/(protected)/platform-admin/organizations/[id]/page.tsx
```

**New — tests**

```
tests/unit/platform-admin/platform-admin.utils.spec.ts   (54 tests)
```

**Modified — one file**

```
frontend/shared/ui/navigation/Sidebar.tsx
```

One `Network` icon import and one nav item added to the **existing**
`Platform` section, gated on `Permission.PLATFORM_VIEW` like its two
siblings. No existing entry was touched.

---

## On the tests

`jest.config.js` sets `testEnvironment: 'node'` with no jsdom and no
React Testing Library, so components cannot be rendered in a test. That
is why every decision this UI makes lives in
`utils/platform-admin.utils.ts` and the components stay declarative —
the same split `frontend/modules/observability` uses.

The 54 tests cover the tree builder (including the orphan and cycle
cases, which are reachable from real data — a filtered list read can
omit a parent, and a cycle in a render path would hang the tab), both
form validators against the real server schemas, the payload builders
(empty `code` omitted rather than sent as `""`; `organizationId` never
emitted), `canManageOrgUnitsFor`'s fail-closed behaviour, and the
presentation helpers' rule that an unrecognised status is never rendered
as healthy.

`eligibleParents` is asserted against the **real**
`ALLOWED_PARENT_TYPES` import rather than a restated copy, so it fails
if the hierarchy rules change and the UI is not updated with them.

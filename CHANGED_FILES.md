# Platform Admin — Users, Roles & Permissions: changed files

Verified against the supplied archive: **18 new files, 7 modified,
0 backend files touched.**

```
npm run type-check      clean (first pass, no fixes needed)
npm run test:unit       99 suites / 1814 tests passing (100 new)
npx eslint <new files>  0 problems
```

## Constraints honoured

- Nothing under `app/api/**`, `modules/**`, `server/**`, `shared/**` or
  `infrastructure/**` was added or modified. No route, permission, DTO
  or response shape changed.
- No vehicle/driver assignment file touched.
- Every call maps to an endpoint that already exists. Five features that
  need endpoints which do not exist are documented in
  `PLATFORM_ADMIN_BACKEND_GAPS.md` and not fabricated.

## ⚠️ One note on applying this ZIP

`frontend/shared/ui/navigation/Sidebar.tsx` is cumulative: it carries
**both** this slice's `Platform Admin` nav group **and** the previous
slice's `Fleet Leaderboard` entry under *Insights*. Apply this on top of
a tree that already has the Fleet Leaderboard slice, or delete the
`fleet-leaderboard` nav item — otherwise that one entry is a dead link.
Nothing else in this ZIP depends on the leaderboard slice.

The whole `frontend/modules/platform-admin/` directory is included so it
unzips self-consistent; the table below marks which files are actually
new or changed.

---

## New — module (`frontend/modules/platform-admin/`)

| File | Purpose |
| --- | --- |
| `types/access.types.ts` | Wire shapes for roles, permissions, API keys, audit entries, member payloads. Header documents the three constraints that shape the slice. |
| `services/platform-access.api.ts` | `apiClient` calls, one per real route, under `/api/security` and `/api/organizations`. |
| `utils/platform-access.utils.ts` | **Pure.** Directory derivation, the fail-closed write gate, role matrix, permission merge, effective key status, audit query normalisation. |
| `hooks/usePlatformAccess.ts` | TanStack Query hooks + member mutations. Per-permission `enabled`, no retry on 403. |
| `components/UserDirectoryTable.tsx` | Cross-organization user rows. No action column, by design. |
| `components/RoleMatrixTable.tsx` | Built-in roles, expandable to every grant. |
| `components/CustomRoleTable.tsx` | Tenant roles, separating inherited from direct grants. |
| `components/ApiKeyTable.tsx` | Keys with *effective* status, never a secret. |
| `components/ApiKeyForm.tsx` | Two-act dialog: create, then copy-once plaintext panel. |
| `components/AuditLogTable.tsx` | Ledger with sequence, chain hashes and expandable metadata. |
| `components/OrganizationMembersTable.tsx` | Member rows; owner row is deliberately actionless. |
| `components/OrganizationMembersSection.tsx` | Members card, owns the own-organization write gate. |
| `components/MemberRoleDialog.tsx` | Assign a built-in role; states why custom roles are absent. |
| `components/InviteMemberDialog.tsx` | Invite by email + role, with seat context. |
| `pages/UsersPage.tsx` | Derived directory, search + 3 filters, states its own scope. |
| `pages/RolesPermissionsPage.tsx` | Built-in matrix, custom roles, permission catalogue. |
| `pages/PlatformApiKeysPage.tsx` | Keys for the caller's organization, scope stated in a banner. |
| `pages/PlatformAuditLogPage.tsx` | Filterable ledger + on-demand chain verification. |

## New — elsewhere

| File | Purpose |
| --- | --- |
| `app/(protected)/platform-admin/users/page.tsx` | Route shim |
| `app/(protected)/platform-admin/roles/page.tsx` | Route shim |
| `app/(protected)/platform-admin/api-keys/page.tsx` | Route shim |
| `app/(protected)/platform-admin/audit-log/page.tsx` | Route shim |
| `tests/unit/platform-admin/platform-access.utils.spec.ts` | 100 tests |
| `PLATFORM_ADMIN_BACKEND_GAPS.md` | Six gaps, two of them security findings, each with a proposed contract |

## Modified

| File | Change |
| --- | --- |
| `frontend/shared/ui/navigation/Sidebar.tsx` | One `Platform Admin` item + 4 children in the existing `Platform` section. Also restores the nav entry for `/platform-admin/organizations`, which had shipped with none. (Plus the previous slice's leaderboard entry — see the note above.) |
| `frontend/modules/platform-admin/pages/OrganizationDetailPage.tsx` | One import, one `<OrganizationMembersSection />` element. No existing markup changed. |
| `frontend/modules/platform-admin/types/index.ts` | One `export * from './access.types'`. |
| `frontend/modules/platform-admin/routes/index.ts` | Four route constants. |
| `frontend/modules/platform-admin/hooks/index.ts` | Re-export of the new hooks. |
| `frontend/modules/platform-admin/components/index.ts` | Re-export of the new components. |
| `frontend/modules/platform-admin/index.ts` | Re-export of the new service and utils. |

## Unchanged — included only so the module unzips whole

`components/OrganizationTable.tsx`, `components/OrganizationForm.tsx`,
`components/OrgUnitTable.tsx`, `components/OrgUnitForm.tsx`,
`pages/OrganizationsPage.tsx`, `hooks/usePlatformOrganizations.ts`,
`services/platform-admin.api.ts`, `utils/platform-admin.utils.ts`.

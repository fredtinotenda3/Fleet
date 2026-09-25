# Willsgrove member login — root cause and fix

Written after tracing a reported `POST /api/auth/token 401` for a Willsgrove
member whose credentials "looked correct." I don't have access to your
database from here, so I can't confirm which of the two bugs below actually
produced your specific 401 — but both are real, both were found by reading
the actual code path your login form calls (not assumed), and both are now
fixed and covered by new regression tests. See "What to run to confirm" at
the end for how to pin down which one it was.

## The endpoint that actually runs

Your login form (`useAuth()` → `authApi.login()`) calls `POST /api/auth/token`
→ `TokenController.login()`
(`modules/security/controllers/token.controller.ts`). NextAuth's
`authOptions.ts` credentials provider is a separate, parallel path the UI
does not use — a fact already established in a previous session's
`OLIVINE_STATUS_AND_LOGIN_FIX.md`, and still true.

## Bug A — a reused account's password was silently discarded

`OrganizationService.addMemberDirect()` — the service behind the "Add
directly" tab of the Add Member dialog — creates a login-ready `tbladmin`
account immediately. If the email you type already has a `tbladmin` row
(a stale account from an earlier attempt, an earlier organization, or any
other reason), the code **reused that account instead of erroring**, which
is correct and intentional — but it reused it **without ever applying the
password you typed into the form**. The account kept whatever password
hash it already had.

The dialog *did* say so ("no new password was generated"), but that
message is easy to miss, and if you typed a password expecting it to take
effect, the member you handed it to got a credential that looks right and
simply does not match the stored hash — which is exactly an "Invalid email
or password" 401, with nothing wrong on the server's side to log.

**Fixed:** if you explicitly type a password when adding a member, it is
now always applied to the account — whether the account is brand new or
being reused. The dialog now says so and shows you the password that was
actually set. If you leave the password blank on a reused account, nothing
changes — the existing password is left alone, same as before, and the
dialog still tells you that.

## Bug B — a reused account's organization was silently kept

The same reuse path never touched the account's `tenantId` — the single
field this entire platform's tenant isolation is built on. If the email
you added already had a `tbladmin` row scoped to a *different* real
organization, that account would keep authenticating into that other
organization, not the one you just added them to. That's the opposite of
"all organizations should log in and see their own data only" — not a
cross-tenant *leak* (the fail-closed tenant-scope layer this platform
already has prevents that), but a very real "this person can't see the
organization they were just added to" defect, and potentially "this
person is looking at someone else's organization's data" if their old
tenant happened to be usable.

**Fixed, in the two cases that are safe to resolve automatically:**

- If the reused account had **no tenant** (new/unset) or a **legacy
  sentinel** (`'default'`/`'system'`/`'super_admin'`) — it's now claimed
  for the organization you just added it to, same as a brand-new account
  would be.
- If the reused account already belonged to **this same organization** —
  no change, nothing to do.

**Deliberately refused, not silently resolved:** if the reused account
already belongs to a **different, real** organization, the add now fails
with a clear error instead of silently moving the account. This platform's
login model resolves one tenant per account with no "switch organization"
step, so reassigning it would effectively evict that person from their
current organization without anyone deciding that on purpose. That's
exactly the kind of automatic tenant reassignment this codebase already
disabled once before (`scripts/backfill-user-tenants.ts`, replaced by the
audited `tenant-data-repair.ts`) — so the same discipline applies here: a
genuine cross-organization move needs a human decision, not code guessing.

## A third bug found along the way — not your 401, but real

While tracing the endpoint your login form actually calls, I found that
`TokenController.login()` resolves a new access token's **role** — the
thing that decides how much of your organization's data an account can
see once logged in — from `admin.roles`, a plural array field. Nothing in
this codebase's ordinary account-creation paths (`createOrganization()`'s
owner account, `addMemberDirect()`'s member accounts) ever writes that
field; both write only the legacy singular `Role` field. So `admin.roles`
was undefined for essentially every real account, and the fallback
silently downgraded every login through this endpoint to the least
privileged role (VIEWER) — correctly *not* the old, far worse
`super_admin` fallback this exact spot used to have, but still wrong: a
branch manager, fleet manager, or even an organization owner logging in
the normal way would find themselves restricted to view-only, with no
error anywhere.

A second, related copy of this same role-mapping table lived inside
`refresh-token.service.ts` and had already drifted out of sync with the
canonical one in `lib/authOptions.ts`, missing five roles added in a
later phase (`organization_admin`, `branch_manager`, `department_manager`,
`workshop_manager`, `supervisor`) — so even the token-*refresh* path,
which did look at the real role, was wrong for those five.

**Fixed:** both places now resolve the role through the one exported
`resolveRole()` in `lib/authOptions.ts` instead of a second, independently
maintained copy — the same "don't duplicate the sentinel/role mapping"
discipline already applied elsewhere in this codebase's tenancy work.

If your Willsgrove member's 401 turns out to be something else entirely
once you check with `diagnose-login.ts` (see below), this bug is still
worth having fixed: it explains a very plausible companion symptom —
"I can log in, but I can't see anything" — for anyone other than an
account that happens to carry a manually-set `roles` array.

## Files changed

- `modules/organizations/repositories/admin-user.repository.ts` — new
  `setTenantId()`, mirroring the existing `resetPassword()`'s safety
  model and comments.
- `modules/organizations/services/organization.service.ts` —
  `addMemberDirect()`'s reuse branch now applies an explicit password and
  safely claims an unowned/sentinel tenantId, refusing (not silently
  overwriting) a genuine cross-organization conflict.
- `modules/security/controllers/token.controller.ts` — login's role
  resolution now falls back to `resolveRole(admin.Role)` instead of a
  bare `Role.VIEWER` default that ignored the account's real role.
- `modules/security/services/refresh-token.service.ts` — removed the
  drifted, hand-duplicated role map; now imports the same `resolveRole()`
  token.controller.ts uses.
- `frontend/modules/organizations/components/members/AddMemberDialog.tsx`
  — the credentials panel now correctly shows the password when one was
  set on a reused account, instead of always claiming "no new password
  was generated."
- `tests/security/add-member-direct-account-reuse.spec.ts` (new, 7
  tests) — pins both reuse-path fixes: password applied vs. left alone,
  tenantId claimed for missing/sentinel vs. left alone when already
  correct, the cross-organization refusal, and the brand-new-account path
  left unaffected.
- `tests/security/login-role-resolution.spec.ts` (new, 4 tests) — pins
  `resolveRole()` against every role this codebase assigns, and pins both
  call sites' wiring at the source level so a future edit can't silently
  reintroduce either the VIEWER-only fallback or a second drifted map.

## Verification performed

- `npx tsc --noEmit -p .` — clean, zero errors.
- `npm test -- --runInBand` — **186 suites / 3281 tests, all passing**
  (baseline was 186/3270 with these files not yet present; the +11 is
  exactly the two new test files, zero regressions elsewhere).
- `next lint` on every changed file — zero new violations. Two
  pre-existing unused-import findings (`Role` in
  `organization.service.ts`, `AppError` in `token.controller.ts`) were
  confirmed pre-existing — dead code neither introduced nor touched by
  this change — and left alone rather than bundled into an unrelated fix.
  The new test files' `no-explicit-any`/`no-require-imports` findings
  were confirmed to match this codebase's own pre-existing, already-
  shipped test-mocking convention exactly (checked against
  `tests/security/organization-member-tenant-binding.spec.ts`, which has
  the identical pattern).
- `npm run build` — blocked by the same pre-existing, environment-only
  Google Fonts network restriction documented in earlier deliveries
  (`next/font` cannot reach `fonts.googleapis.com` from this sandbox).
  Unrelated to this change; no workaround attempted, reported honestly.

## What to run to confirm, on your own machine

I can't query your live database from here, so I can't tell you which bug
(A, the password, or B, the tenant) actually caused your specific 401 —
or whether it's neither, and something else is going on for this one
account. The repo already has the right tool for this:

```
npx tsx diagnose-login.ts <the member's email> <the password you gave them>
```

It tells you, against the database `npm run dev` is actually pointed at:
whether the account exists, whether that exact password matches the
stored hash, whether the account is locked, and whether its tenantId is
usable. If the password doesn't match, that's Bug A, and re-adding the
member (or using the admin UI's "Add directly" tab again, now fixed, with
a password typed in) will resolve it. If the password matches but
`tenantId` shows as unusable or as a different organization, that's Bug B,
and re-adding them once this fix is deployed will resolve it automatically
for the missing/sentinel case, or tell you clearly if it's the
different-organization case.

**NO DATABASE RESET OR DESTRUCTIVE OPERATION OCCURRED.**

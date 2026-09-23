# Olivine — status, the login bug, and what's left

Written after tracing a stuck Olivine owner login (`POST /api/auth/token 401`) back to a real, previously-unknown tenancy bug in `organizationService.createOrganization()`. This document is both the incident writeup and a current-state summary across everything done for Olivine so far, so it can stand on its own as a handoff.

## 1. The login bug — root cause

`owner@olivine.test` was created correctly, the "Olivine Group" organization was created correctly, and the role ladder under it (from `tenancy-provision.ts`) was created correctly. The break is specific and narrow:

**`organizationService.createOrganization()` never writes the new organization's `tenantId` back onto its own owner's `tbladmin` row.**

Why: creating an organization requires an *existing* `ownerId` — the account has to exist before the org that will own it does. So the sequence is unavoidably "create the owner account, then create the org, then reference that ownerId." But nothing in that sequence, or anywhere in `createOrganization()`, ever goes back and stamps the freshly-minted `tenantId` (`olivine-group-b606e3`) onto the owner's own `tbladmin.tenantId` field. That field is left exactly as it was before the org existed — for a brand-new bootstrap account, that means **unset**.

This matters because `modules/security/controllers/token.controller.ts` (the real login endpoint — `/api/auth/token`, which the login form actually calls; NextAuth's `authOptions.ts` credentials provider is a separate, parallel path not used by the current UI) resolves tenant at login with:

```ts
const tenantId = admin.tenantId || 'default';
```

and that resolved value is what gets baked into the JWT and trusted by every request afterward (`getAuthContext()` → `resolveTenantContext()` → every tenant-scoped repository call). So an org owner with no `tenantId` on their `tbladmin` row logs in — if the password's right — scoped to the literal string `'default'`, not to their own organization. Depending on what else has ever landed in that same `'default'` bucket, that's either an empty tenant (owner sees nothing) or, worse, a real cross-tenant collision.

**This is not new to Olivine.** `scripts/seed-enterprise-org.ts` (Toyota Zimbabwe / Honda Zimbabwe) has the exact same `createOwnerAccount()` pattern with the exact same gap. It's also not exploitable through the normal signup API in a way that's worse than what's already documented: `server/tenancy/tenant-scope.ts` already fail-closes the legacy `'default'` sentinel at the query layer (`resolveTenantScope()` throws rather than silently granting cross-tenant reads) — so this bug's blast radius is "an org owner can't see their own data" (annoying, breaks onboarding) rather than "an org owner can see someone else's data" (which the fail-closed sentinel handling already prevents at the repository layer). Still a real bug, worth fixing, but not the worse of the two possible shapes.

**Whether this is *also* why you're getting a 401** (rather than a successful-but-wrong-tenant login) is a separate question I can't answer without querying your database — I don't have access to it from here. A missing `tenantId` does not by itself produce a 401 anywhere in the login code path; a 401 from `/api/auth/token` only comes from account-not-found, wrong password, or a lockout. See §2 for how to tell which one it is.

## 2. What to run, in order

**Step 1 — diagnose, don't guess.** `diagnose-login.ts` at the repo root existed already but was broken (hardcoded a different account's test password, guessed wrong collection names for the lockout check — it could only ever report "not locked," correctly or not). Fixed: it now takes the real email/password as arguments, checks the actual `tblaccountlockouts`/`tblloginattempts` collections your code writes to, and prints whether `tenantId` is usable.

```
npx tsx diagnose-login.ts owner@olivine.test "LMxmRChB6vgY!7"
```

This tells you definitively: does the account exist in the database `npm run dev` is currently pointed at, is the password right, is it locked, and is `tenantId` usable. Run this before touching anything else — it turns "still 401, no idea why" into a specific, named cause.

**Step 2 — fix the tenantId gap for every account, not just Olivine's owner.** The repo already has the right tool for this, and it's more careful than anything I'd write standalone: `scripts/tenant-data-repair.ts` (`npm run db:repair` / `npm run db:repair:apply`). It's dry-run-by-default, audits every write to `tbltenant_repair_audit`, never guesses, and classifies every `tbladmin` account as RECOVERABLE / NEEDS_REVIEW / UNRECOVERABLE — for an org owner specifically, it resolves ownership via `tblorganizations.ownerId`, which is exactly the link `owner@olivine.test` has. Run:

```
npm run db:repair          # dry run — review reports/ output, confirm owner@olivine.test shows RECOVERABLE
npm run db:repair:apply    # commit exactly the reviewed plan
```

Because this scans *every* `tbladmin` row, it also answers your isolation question directly: if Willsgrove's owner (or anyone else) has the same gap, the dry-run report will show it before anything is written, and `--apply` fixes all of them in the same pass, all audited.

**Step 3 — re-confirm.** Re-run `diagnose-login.ts` with the same credentials; `tenantId` should now show the real slug (`olivine-group-b606e3`) instead of `(not set)`. Then try the browser login again.

**If Step 1 shows the password doesn't match:** re-run `npx tsx scripts/seed-olivine-org.ts` (now fixed — see §3) with the same `--owner-email`/`--owner-name` flags. It resets the existing account's password to whatever it prints, so the new printed credential is guaranteed to work; the previous version could silently print a password that didn't match anything if the account already existed (see §3).

## 3. What I fixed, concretely

Three files, all additive, all `tsc --noEmit` clean, full existing suite still green (178/179 suites, 3163/3184 tests — same pre-existing skip as before, nothing newly broken):

- **`modules/organizations/repositories/admin-user.repository.ts`** — added `resetPassword(id, passwordHash)`. Nothing else changed.
- **`scripts/seed-olivine-org.ts`** — `createOwnerAccount()` now resets an existing account's password on reuse instead of silently leaving the old hash in place while printing a new, non-matching password (see below). Credentials now print *before* `createOrganization()` runs, not after — the previous ordering meant a re-run against an already-existing org would reset the password in the database, then crash with `ConflictError` before ever showing the new password, leaving the account's real password known to nobody. `main()`'s printed next-steps now include the required `db:repair` step and a ready-to-paste `diagnose-login.ts` command.
- **`diagnose-login.ts`** (repo root) — rewritten per §2; was checking the wrong collections and a hardcoded, unrelated password.

**The credential-honesty bug**, found while tracing this: `createOwnerAccount()` used to look up an existing account by email, and if found, return its id *without touching its password* — but `main()` always printed the freshly-generated password as if it were live. If the script had ever been run twice against the same email (a partial earlier run, a retry), the second run's printed password would not open the account. I didn't find direct evidence this happened for your current Olivine credentials specifically (`OLIVINE.MD`'s recorded password matches what the first, successful run printed), but it's a real bug regardless of whether it's the cause of this particular 401, so it's fixed now rather than left for the next org.

**What I deliberately did not do:** patch `organizationService.createOrganization()` itself to auto-stamp the owner's `tenantId`. This codebase already has a mature, audited, human-reviewable repair pipeline (`tenant-data-repair.ts`) specifically because an earlier version of exactly this kind of auto-repair (`scripts/backfill-user-tenants.ts`) shipped a real data-corrupting bug — it's now disabled with a loud warning pointing at the replacement. Silently writing to `tbladmin.tenantId` — the single field the entire tenant-isolation model trusts — from inside `createOrganization()` would bypass that audit trail for the most security-sensitive field in the system, and would behave badly for the one case that isn't provably safe: an account that's already a member of a *different* real organization creating a second org (current login only supports one tenant per account — see §5). The right fix is almost certainly having `createOrganization()` call the same recoverability-ladder logic `tenant-data-repair.ts` already has (extracted into a shared function), which for a brand-new org/owner pair is always unambiguously RECOVERABLE. That's a real next step, not done here, flagged in §6 rather than rushed in.

## 4. Tenant isolation — what's confirmed vs. what running Step 2 confirms

Confirmed by reading the code (not assumed): every tenant-scoped repository call resolves scope through `server/tenancy/tenant-scope.ts`'s `resolveTenantScope()`, which fail-closes — a missing or legacy tenant value throws rather than granting cross-tenant access. That's the layer that has already been hardened (see `SCOPE_INTEGRITY_FINDINGS.md`, `PHASE_0_SECURITY.md` from earlier work). What was *not* previously verified, and what this incident surfaced, is the layer above it: whether the tenantId baked into a given account's session token is the *right* one in the first place. That's what §1–§2 fix.

Once you've run `npm run db:repair:apply` and confirmed via `diagnose-login.ts` that both `owner@olivine.test` (and Willsgrove's owner, and anyone else the dry-run report flags) show real, distinct tenant slugs, the isolation guarantee holds end-to-end: Olivine's owner literally cannot construct a query that reads Willsgrove's rows, because every repository call is filtered by the tenantId baked into their token, and that filter is now provably correct rather than defaulted.

I don't have database access from here, so I can't run Step 2 myself or confirm its output — that's the one piece of this you'll need to do and report back on if anything in the dry-run report looks unexpected (e.g., if it shows NEEDS_REVIEW for any account, that means real ambiguity exists and needs a human decision, not a rerun).

## 5. A related architectural note, not a today problem

The current login model resolves exactly one `tenantId` per `tbladmin` account, baked in at login with no "switch organization" step — `getOrganizationsForUser()` exists as a read (a "my organizations" listing) but nothing in the auth flow uses it to let one account operate across multiple orgs. That's fine for Olivine and Willsgrove as they stand (one owner, one org, one email domain each), but worth knowing if a future request ever needs one person to own or belong to two organizations — today that's not supported at the session layer, independent of anything fixed in this pass.

## 6. Current state — Cost Intelligence Command Centre milestone

Unrelated to the login incident; tracked separately in `COMMAND_CENTRE_PROGRESS.md`, summarized here for one-place visibility:

| Slice | Scope | Status |
|---|---|---|
| Design | 25-section design doc, grounded in the real codebase (verified `FakeCollection` aggregation limits, tenancy declarations, existing precedent in `AllocationLedgerRepository`) | Shipped |
| A0 | Prerequisite fixes: `extractRawDisplayFields` for all four sheet families, `countPendingAmount` widened to any category/family, `TRANSPORT_COST_CATEGORIES` constant, new ledger index | Shipped, tested (10 new tests), verified — O4 report screen unaffected |
| A | Cost aggregation + time series (dimension breakdowns, custom ranges) | Not started |
| B | Drill-down to source evidence | Not started |
| C | Data quality / trust panel | Not started |

## 7. Current state — Olivine transport-cost data pipeline (O-series)

Tracked in `OLIVINE_PHASE_PLAN.md`:

- **O1–O4 (3rd Party import, normalization review, ledger posting, Business Stream → Vehicle report): shipped.**
- **Vansales posting:** periodization decision made (declared-month, see `VANSALES_PERIODIZATION_DECISION.md`), posting itself not yet implemented — the recommended next data-pipeline slice.
- **Swift:** cost-category decided, parser not started.
- **Depot STO (O5):** deferred, needs its own sign-off-provenance decision first.
- **PODs, fuel/cost-per-km for Olivine:** explicitly out of scope — no safe join key / no real fuel-distance data exists in the source workbook.

## 8. Loose ends worth a cleanup pass (not urgent, noted so they don't get lost)

Your repo root has accumulated some stray debugging artifacts from earlier troubleshooting rounds — files like `console.log(JSON.stringify(d`, `r.json())`, `prompt`, `samples.ts`, `testConnection.ts`, `powershelworker.md`. None of these are referenced by the app; they look like copy-paste accidents from terminal sessions. Worth deleting in a housekeeping pass, not urgent.

## 9. Immediate next action

Run the three commands in §2 (`diagnose-login.ts`, `npm run db:repair`, `npm run db:repair:apply`, then `diagnose-login.ts` again) and report back what each prints — particularly whether `diagnose-login.ts`'s *first* run (before any repair) shows the password matching or not. That one bit of information decides whether there's still a second bug to find, or whether the tenantId fix alone resolves it.

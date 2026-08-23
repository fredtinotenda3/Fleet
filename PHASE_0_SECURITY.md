# Phase 0 — Security Remediation

Implemented against the architecture audit of 22 August 2026. This
document is the operator-facing record: what changed, what you must
configure, and what you must do outside the repository.

---

## 1. Scheduled endpoints now fail closed (F-1)

### What changed

Five scheduler-invoked routes shared this pattern:

```ts
const CRON_SECRET = process.env.CRON_SECRET;
if (CRON_SECRET && authHeader !== `Bearer ${CRON_SECRET}`) return 401;
```

When `CRON_SECRET` was unset the check was skipped and the request ran
unauthenticated. All five now route through
`server/middleware/cron-auth.ts`.

### REQUIRED CONFIGURATION

**`CRON_SECRET` must be set before deployment.** If it is absent these
five endpoints return **HTTP 500** and do not execute:

| Endpoint | What it does |
|---|---|
| `/api/security/expire-grants` | Revokes expired permission grants, flushes the permission cache |
| `/api/reminders/update-status` | Bulk reminder status recalculation |
| `/api/reminders/notify-overdue` | Marks reminders overdue and notifies assignees |
| `/api/cron/eagletrack-sync` | Drives Eagle Track vendor synchronisation |
| `/api/workflows/process-timeouts` | Escalates timed-out workflow steps across every tenant |

Generate one with:

```
openssl rand -base64 32
```

Set it in the deployment environment **and** in whatever invokes the
schedule. Callers present it as `Authorization: Bearer <value>`.

> **This is a behaviour change.** Any deployment currently running with
> `CRON_SECRET` unset has these five schedules working *because*
> authentication was being skipped. They will start returning 500 until
> the variable is set. That is the intended outcome — the alternative is
> that they remain callable by anyone.

### HTTP method

`GET` is **retained** as the primary method: Vercel Cron (see
`vercel.json`) issues GET and cannot be configured otherwise, so
removing the GET handler would silently stop the schedule.

Retaining a mutating GET is safe here specifically because the
credential is a `Bearer` header, which a browser never attaches
automatically — there is no ambient-authority (CSRF) path to these
routes, unlike a cookie-authenticated one.

`POST` is also exported on all five, identically guarded, so operators
on a scheduler that can issue it (GitHub Actions, Cloud Scheduler, k8s
CronJob, curl) can use the correct method today, and so GET can be
retired without a code change once Vercel Cron is no longer the driver.

### Properties

- Missing/blank secret → 500, operation does not run, logged as a
  configuration error with no secret material.
- Missing or malformed credential → 401.
- Comparison is `crypto.timingSafeEqual` over SHA-256 digests, so
  neither the length nor the content of the configured secret is
  recoverable by timing.
- The configured secret is never returned in a response and never
  written to a log line.

---

## 2. Workflow permissions (F-4)

`modules/workflows` previously had **no permission at all**. Every route
used `withSession()` (authenticated only), and the engine's step check
ended in `return true` for any step without an explicit assignee list.

### New permissions

| Permission | Governs |
|---|---|
| `WORKFLOW_VIEW` | Reading definitions, instances, my-tasks, metrics |
| `WORKFLOW_MANAGE` | Creating, editing, deleting **definitions** |
| `WORKFLOW_START` | Starting an instance against an entity |
| `WORKFLOW_APPROVE` | Approving a step |
| `WORKFLOW_REJECT` | Rejecting a step |
| `WORKFLOW_CANCEL` | Cancelling an in-flight instance |

### Grants

| Role | View | Start | Approve | Reject | Cancel | Manage |
|---|---|---|---|---|---|---|
| Super admin / Org owner / Org admin | ✔ | ✔ | ✔ | ✔ | ✔ | ✔ |
| Branch / Department / Fleet manager | ✔ | ✔ | ✔ | ✔ | ✔ | — |
| Workshop manager | ✔ | ✔ | ✔ | ✔ | — | — |
| Supervisor | ✔ | ✔ | ✔ | ✔ | — | — |
| Accountant | ✔ | — | ✔ | ✔ | — | — |
| Dispatcher | ✔ | ✔ | — | — | — | — |
| Auditor / Viewer | ✔ | — | — | — | — | — |
| Driver / Mechanic | — | — | — | — | — | — |

`WORKFLOW_MANAGE` is deliberately **not** granted below organization
level: a definition is organization-wide approval policy, and a manager
who can approve within their own scope must not be able to rewrite the
chain that governs everyone.

### Two independent gates

A permission answers *"may this role decide workflow steps at all"*. It
can never answer *"is this the right person for **this** step"*. So the
engine enforces its own check regardless of how it was called:

1. **Explicit assignment** — the actor must be in the step's assignee
   list. The instance's resolved `assignedTo` wins over the definition's
   `assignee`, so editing a template cannot move an in-flight approval to
   someone else.
2. **Role assignment** — the actor must hold the step's named role
   (case-insensitive). Organization-wide administrators also satisfy this.
3. **Neither** — **denied**. A step with no assignee list and no role is a
   misconfigured gate, not an open one. To mean "anyone may approve",
   name a role on the step.

Self-approval is measured against `instance.createdBy`. When
`config.allowSelfApproval === false`, the originator is refused.

### Also fixed

- `rejectStep` had **no** authorization check whatsoever. It now applies
  the identical step check as approve.
- `cancelInstance` had **no** authorization check. Now restricted to the
  instance originator or an organization-wide administrator.
- **Routing defect:** `steps/[stepId]/route.ts` contained a mis-pasted
  copy of the instance route, so approve/reject had **no HTTP route**,
  and instance read/cancel was served at a path whose `[stepId]` segment
  was required but ignored (`DELETE /instances/abc/steps/anything`
  cancelled instance `abc`). Corrected.

### API changes

| Method | Path | Permission |
|---|---|---|
| `GET` / `POST` | `/api/workflows` | `WORKFLOW_VIEW` / `WORKFLOW_MANAGE` |
| `GET` / `PUT` / `DELETE` | `/api/workflows/[id]` | `WORKFLOW_VIEW` / `WORKFLOW_MANAGE` |
| `GET` / `POST` | `/api/workflows/instances` | `WORKFLOW_VIEW` / `WORKFLOW_START` |
| `GET` / `DELETE` | `/api/workflows/instances/[id]` | `WORKFLOW_VIEW` / `WORKFLOW_CANCEL` |
| `POST` | `.../steps/[stepId]/approve` | `WORKFLOW_APPROVE` |
| `POST` | `.../steps/[stepId]/reject` | `WORKFLOW_REJECT` |

`GET|DELETE /api/workflows/instances/[id]/steps/[stepId]` now returns
**410 Gone** with a pointer to the correct paths.

---

## 3. Telemetry ingestion authorization (F-5)

`POST /api/telematics/ingest` enforced authentication and nothing else —
any authenticated user could fabricate telemetry against any vehicle in
the tenant.

> `middleware.ts` does **not** cover `/api/telematics/*` — its matcher
> excludes non-versioned `/api/*`. Route-level protection is the only
> protection on this path.

### New permission

`TELEMATICS_INGEST` — granted to **no ordinary role**. Only organization
owners/admins hold it by construction. The intended credential is a
**service identity (API key)**, not a human login: asserting a
measurement into the telemetry stream is a machine act. It is
deliberately not folded into `VEHICLE_EDIT`, which would have handed
telemetry-write to every role that can rename a vehicle.

### Four gates

1. `Permission.TELEMATICS_INGEST` at the route, rate-limited.
2. `assertVehicleInScope` — the same helper the Eagle Track endpoints
   use. Resolves the vehicle inside the caller's tenant **and**
   accessible org units; 404s (never 403) on a miss so the endpoint
   cannot be used to probe vehicle ids in another branch; refuses a
   vehicle with no org unit rather than treating unassigned as shared.
3. Device/vehicle binding — a `deviceId` already registered to a
   different vehicle is rejected with 409.
4. `tenantId` and `orgUnitId` are taken from the resolved **vehicle
   record**, never from the request.

### Payload contract changes

- The schema is now `.strict()` — a body carrying `tenantId`,
  `orgUnitId`, `isDeleted` or any other unknown key is a **400**.
- **Measurement fields are now optional.** Previously every
  engine/trip/fuel field was *required*, which did not prevent
  fabrication — it mandated it: a device with no RPM sensor had to send
  `rpm: 0`. A fabricated `fuelLevel: 0` reaches the `< 10` low-fuel
  branch and manufactures a high-severity alert plus a manager
  notification on every post; a fabricated `odometer: 0` overwrites the
  vehicle's real odometer in the digital-twin fallback chain. Omit what
  you do not measure. A genuine `0` is still accepted as a real reading.
- Timestamps are bounded: no more than 1 day in the future, no more than
  1 year old. The window is generous on purpose — devices legitimately
  buffer while out of coverage and dump on reconnect.
- Coordinates, speeds, RPM, temperatures and percentages are
  range-checked.

---

## 4. WebSocket org-unit isolation (F-7)

Every socket joined one room, `tenant:{tenantId}`, and every ingested
telemetry fix was emitted to it. So every user in a tenant received live
positions for **every** vehicle in that tenant — data the REST path
deliberately withholds. A Bulawayo branch user was denied Harare
vehicles over HTTP and pushed them over WebSocket, continuously.

### Authorization model

Room membership is decided **once, at handshake**, from server-resolved
authority — never from anything the client sends:

| Room | Membership |
|---|---|
| `tenant:{t}` | Every authenticated member. **Tenant-wide events only** (billing, membership) |
| `tenant:{t}:allunits` | Callers with organization-wide visibility (`accessibleOrgUnitIds === null`) |
| `tenant:{t}:unit:{u}` | One per accessible org unit, from the same expanded closure (assignments + descendants) the REST layer uses |

An entity event is emitted to `unit:{u}` **plus** `allunits`.

The closure is resolved via `tenantContextService.resolveContext` at
connection time — once per connection, not per event. A permission
change mid-session is picked up at reconnect, bounded by the access
token's TTL, matching the REST path's behaviour.

**Unassigned entities fail closed.** An event whose entity has no
`orgUnitId` reaches `allunits` only; it is *not* broadcast tenant-wide.
This matches `assertVehicleInScope` rather than the geofence convention:
a geofence with no owner is genuinely shared reference data, but a
vehicle with no org unit is *missing information*, and the REST reads
already return nothing for it to a scoped caller.

A socket whose scope cannot be resolved is **refused**, never admitted
with an absent scope.

### Subscription allow-list

The old handler let a client join **any** room whose name began
`event:`, unvalidated. Nothing emits to those rooms today, so it was
inert — and a live bypass the moment anyone wrote `io.to('event:' + x)`.
Subscriptions are now restricted to `vehicle:location`, `vehicle:alert`,
`vehicle:geofence` and `maintenance:overdue`, capped at 32 per socket,
and joining one **never** widens what a socket receives.

### For API consumers

`emitToTenant` is now for organization-level events only. Entity events
must use `emitToOrgUnit(tenantId, orgUnitId, event, payload)`. The
`emitVehicleUpdated` / `emitExpenseCreated` / `emitFuelLogged` /
`emitReminderOverdue` / `emitTripCreated` helpers take an optional
trailing `orgUnitId`.

---

## 5. Credential exposure (F-6)

### ACTION REQUIRED OUTSIDE THIS REPOSITORY

Three live credentials were committed. All must be treated as
**compromised and rotated**. Rotation cannot be performed from inside
the repository and has **not** been done.

| Credential | Was in | Rotate at |
|---|---|---|
| Eagle Track production API token | 4 markdown files + a test fixture | Eagle Track vendor console |
| **MongoDB Atlas connection string incl. password** | `scripts/count-fuellogs.ts` (hardcoded literal) | Atlas → Database Access → Edit password |
| Second vendor-token-shaped literal | 2 config-schema test fixtures | Eagle Track vendor console |

The Atlas credential is the most serious of the three and **was not in
the original audit** — it was found by the repository-wide scan during
remediation. Anyone with a clone had direct read/write access to the
production database, bypassing every tenant-scope control in the
application layer.

See `SECURITY-CREDENTIALS.md` for the full rotation checklist, which
also covers `NEXTAUTH_SECRET` and `JWT_SECRET`.

### What was done here

All three values were removed from the working tree and replaced with
synthetic placeholders. `scripts/count-fuellogs.ts` now reads
`MONGODB_URI` from the environment and refuses to run without it.

`tests/security/no-committed-secrets.spec.ts` scans the tracked tree on
every test run and fails on connection strings with inline passwords,
vendor-token-shaped literals, and assigned secret/key/password literals.

### Git history

**The archive supplied contains no `.git` directory**, so history could
not be inspected or rewritten, and no unrelated history was destroyed.

If these values exist in the history of your own repository, removing
them from the working tree is **not sufficient**. Recommended
remediation:

```bash
# Inspect first
git log -p -S'<the-token>' --all

# Rewrite (git-filter-repo is the maintained tool)
pip install git-filter-repo
git filter-repo --replace-text <(echo '<the-token>==>REDACTED')

# Then force-push and have every collaborator re-clone
```

Rotation still takes priority: a rewritten history does not help if the
value was ever pushed, cloned, or logged by the vendor. With Eagle
Track's query-parameter authentication, that token is also in the
vendor's own access logs.

---

## 6. Environment variables

| Variable | Required | Behaviour if missing |
|---|---|---|
| `CRON_SECRET` | **Yes, in production** | The five scheduled endpoints return 500 and do not run |
| `SECRETS_ENCRYPTION_KEY` | **Yes, in production** | Throws — provider credentials cannot be decrypted |
| `MONGODB_URI` | Yes | Application and scripts refuse to start |
| `NEXTAUTH_SECRET` / `JWT_SECRET` | Yes | Token verification fails |
| `REDIS_URL` | Optional | Background workers do not run; read-through lock fails open |

## 7. Verification

```
npm ci          # now succeeds (lockfile was out of sync)
npm run type-check
npm test
```

Baseline before Phase 0: 767 tests / 50 suites.
After Phase 0: **864 tests / 55 suites, all passing.**

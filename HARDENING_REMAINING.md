# Hardening — remaining gaps

Recorded rather than pretended-done, per the brief.

---

## 1. Integration tests could NOT be executed in the authoring environment
**Item 2 · Written and type-checked; not run against a real database here**

`mongodb-memory-server` downloads a mongod from `fastdl.mongodb.org` on
first use. That host is blocked in the environment these tests were
written in (HTTP 403 from the egress proxy), so the 21 integration
assertions have **never been observed passing**.

What IS verified:
- they compile (`tsc --noEmit`, 0 errors);
- the skip path works — 21 reported as *skipped*, not passed;
- the hard-fail path works — with `REQUIRE_INTEGRATION_DB=true` the run
  fails with a message naming the fallbacks.

**Run them yourself before trusting them.** On a machine with network:

```bash
npm run test:integration
```

If the download is blocked (corporate proxy, Windows, air-gapped):

```bash
# Preferred — use a mongod you already have
docker run -d -p 27017:27017 --name fleet-test-mongo mongo:7
INTEGRATION_MONGO_URI=mongodb://localhost:27017 npm run test:integration

# Or a binary already on disk
MONGOMS_SYSTEM_BINARY="C:\Program Files\MongoDB\Server\7.0\bin\mongod.exe" npm run test:integration
```

`INTEGRATION_MONGO_URI` is checked **first**, so an existing server always
wins over a download.

If any of the 21 fail, that is a real finding about the indexes, not
about the harness — each one asserts a constraint a previous phase
declared but could not prove.

---

## 2. `npm run lint` fails with 23 pre-existing errors
**Item 5 · Made non-blocking, not fixed**

CI previously ran lint **before** the tests, so the job died there and
type-check and tests never ran at all — a pipeline that has never
executed a test, mistaken for coverage.

Lint is now `continue-on-error: true`: visible in the log, not gating.

Not fixed because fixing 23 lint errors means editing unrelated business
logic, which the brief forbids. Also `next lint` is deprecated in Next 15
and removed in 16, so the real fix is migrating to the ESLint CLI — a
build-tooling change with no security content.

`next.config.ts` also sets `ignoreDuringBuilds: true`, so lint has never
gated a build either.

---

## 3. E2E is API-contract level, not over HTTP
**Item 3 · Deliberate, stated rather than glossed**

The suite imports the **real** exported route handlers and invokes them
with a real `NextRequest`, exercising `withAuth`, the permission check,
the auth-context resolver and the error mapping. It does **not** start a
server, so it does not exercise `middleware.ts` or the network.

That is the honest description, and the layer is the right one *for this
codebase*: `middleware.ts`'s matcher excludes non-versioned `/api/*`
(finding S-1), so for ~300 routes the handler wrapper **is** the entire
security boundary. There is no outer layer for a true E2E test to catch
that these do not.

A true HTTP E2E suite would need a running server plus a seeded database
and a real login — worth doing, and a larger piece of work with its own
fixtures.

---

## 4. No test asserts a *successful* authenticated request
**Item 3 · Gap**

The E2E suite proves refusals (401 anonymous, 401 bogus token, 500 on
unset cron secret, non-200 on unset metrics token). It does not prove
that a *valid* credential succeeds, because minting one needs a seeded
user and a real database.

Refusals are the higher-risk half — every CRITICAL finding in the
original audit was something that should have been refused and was not —
but "auth works" is only half-proven until the happy path is covered
too. It belongs with the HTTP E2E suite above.

---

## 5. Error monitoring is counts, not traces
**Item 6 · Within the brief's constraints**

`fleet_unhandled_errors_total` is now incremented on every API 5xx (it
was registered in Phase 7 and **never called**, so it read zero forever),
and `/api/observability/summary` exposes unhandled, provider, database,
sync-failure and dead-letter counts.

What this is not: an error *tracker*. There is no stack trace, no
grouping, no first/last-seen, no release correlation. Counts tell you
*that* something is failing and roughly where; they do not tell you why.

The brief rules out a paid SaaS dependency, and a self-hosted collector
(Jaeger, Tempo, a Sentry instance) is an infrastructure decision rather
than a code change. **OTel export configuration:** the SDK is already
initialised in `instrumentation.ts` and `workers/bootstrap.ts`; pointing
it at a collector needs
`OTEL_EXPORTER_OTLP_ENDPOINT` and `OTEL_EXPORTER_OTLP_HEADERS` set in the
deployment. No endpoint is fabricated here.

---

## 6. `OBSERVABILITY_VIEW` permission is still not merged
**Pre-existing · Not fixed**

`/api/observability/summary` is gated on `Permission.JOB_VIEW` as an
interim measure, with a comment pointing at
`server/permissions/roles.observability-addendum.ts` for the dedicated
permission "to swap in once merged".

Left alone: merging a permission changes the authorization model, and
the addendum's own contents should be reviewed before that happens
(Phase 0 found a workflow addendum in exactly this state — a comment file
nothing imported — that had been sitting unmerged while the routes it
described were unprotected).

The route **is** authenticated and permission-gated today; the gap is
that the permission is a borrowed one.

---

## 7. Route-auth conformance covers presence, not correctness
**Item 1 · Inherent limit, worth naming**

The test proves every route has *an* auth mechanism or an explicit,
justified public-allowlist entry. It cannot prove the mechanism is the
*right* one — a route gated on `VEHICLE_VIEW` that should require
`VEHICLE_EDIT` passes.

It does catch the two failure modes that actually occurred here: a
missing wrapper (F-1, F-5) and `withSession` mistaken for authorization
(F-4), the latter asserted separately.

Choosing the right permission per route remains a review question.

---

## Audit findings still open

| ID | Finding | Severity |
|---|---|---|
| F-8 | Rate limiting is an in-memory `Map`, per-instance, reset on cold start | HIGH |
| F-9 | Query cache is invalidate-only and keyed by tenant, not org unit | HIGH |
| F-17 | Live map is a poll, presented as real-time | MEDIUM |
| N-3 (Ph0) | `createAlert` writes no `orgUnitId` while the scoped read filters on it | MEDIUM |
| P3-N1 (Ph3) | `NotificationHandler` / `WebhookDispatchHandler` non-idempotent | MEDIUM |
| P4-N1 (Ph4) | Reports read raw telemetry, not rollups | MEDIUM |
| P6-N2 (Ph6) | AI services do not yet emit the evidence envelope | MEDIUM |
| P6-N3 (Ph6) | Attention dispatch has no persistence wiring or registered executors | MEDIUM |
| P7-N2 (Ph7) | Stale-vehicle gauge registered but never populated | LOW |

**S-1 is now closed** by `tests/security/route-auth-conformance.spec.ts` —
it was carried as "highest-leverage remaining item" from the original
audit through Phase 7.

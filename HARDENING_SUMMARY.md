# Backend Hardening & Testing

## Status

| # | Item | Result |
|---|---|---|
| 1 | Route-auth conformance (S-1) | **DONE** |
| 2 | Real MongoDB integration tests | **WRITTEN — not executable here** (see below) |
| 3 | E2E smoke suite | **DONE** (API-contract level, stated) |
| 4 | Performance smoke tests | **DONE** |
| 5 | CI runs on PRs | **DONE** |
| 6 | Error monitoring surface | **DONE** (counts, not traces) |

## Verification

| Check | Result |
|---|---|
| `npm ci` | succeeds |
| `npm run type-check` | **0 errors** |
| `npm test` | **1367 passed / 1367, 81 suites** |
| Baseline 1325 / 78 | **+42 tests, +3 suites, 0 regressions** |
| `npm run test:security` | passes (subset of the above) |
| `npm run test:e2e` | **14 passed** |
| `npm run test:performance` | **12 passed** |
| `npm run test:integration` | **21 skipped** — no MongoDB binary available here |

---

## 1. Route-auth conformance — closes S-1

`tests/security/route-auth-conformance.spec.ts`, 16 tests.

S-1 was the finding carried as "highest-leverage remaining item" from the
original audit through every phase: `middleware.ts` excludes
non-versioned `/api/*`, so ~300 routes are self-defending and a single
omission is an open endpoint. Three of the four CRITICAL findings in the
audit were exactly that.

The test walks `app/api/**/route.ts` and requires each route to **either**
use a recognised auth mechanism **or** appear in `PUBLIC_ROUTES` with a
written reason. The allowlist is the control, not the loophole: making a
route public becomes a deliberate, reviewable edit with a justification —
rather than what currently happens when you forget to type `withAuth`.

Also asserted: no stale allowlist entries (so it cannot rot, and a rename
cannot leave the new path unguarded), no route on `withSession` alone
(Phase 0's F-4 was the *wrong* wrapper, not a missing one), no
reintroduction of the fail-open `if (SECRET && ...)` pattern, and
cross-tenant observability routes gated on a platform-only permission.

**It found four routes my manual grep had missed** — `admin`,
`billing/webhook`, `health/live`, `oauth/token`. Investigated rather than
allowlisted: `admin` uses `requireAuth` (a real mechanism I hadn't
recognised — added), and the billing webhook authenticates by Paynow
hash, which is now pinned by its own assertion.

## 2. Integration tests — written, **not executed here**

`tests/integration/persistence-invariants.spec.ts`, 21 assertions across
telemetry uniqueness, workflow idempotency, allocation posting, outbox
claim/lease/retry, and tenant scope.

These close the gap every phase from 1 to 6 had to write into its own
summary: *"an in-memory double cannot prove a unique index rejects a
concurrent duplicate, because the double is the thing being trusted."*

**`fastdl.mongodb.org` is blocked in the environment these were authored
in (HTTP 403), so they have never been observed passing.** That is stated
here and in `HARDENING_REMAINING.md` rather than glossed. Run them before
trusting them; fallbacks for Windows and restricted networks are
documented in both.

Two modes, both verified:
- **default** — skips with a loud warning naming the fallbacks;
- **`REQUIRE_INTEGRATION_DB=true`** (which CI sets) — hard-fails, so an
  environment that is supposed to have a database cannot quietly stop
  running them.

> A design bug was caught here mid-implementation: the first gate used
> `harness ? describe : describe.skip`, evaluated at module load *before*
> `beforeAll` — so it would have skipped **even when a database was
> available**, reporting "21 skipped" forever while looking deliberate.
> Replaced with a `globalSetup` that publishes the URI before any spec
> loads.

## 3. E2E smoke — `tests/e2e/api-smoke.spec.ts`, 14 tests

Imports the **real** exported handlers and invokes them with a real
`NextRequest`, so `withAuth`, the permission check and the auth-context
resolver all execute. Proves: anonymous → 401, bogus token → 401,
protected **write** → 401 (a wrapper applied to GET and forgotten on POST
is a live write endpoint), unset `CRON_SECRET` → 500, unset
`METRICS_SCRAPE_TOKEN` → not 200, and that no refusal echoes a secret or
a stack trace.

**No new dependency.** What was needed was a Jest transform: `jose` v6 is
ESM-only with no CommonJS build, so any test importing a handler that
reaches the auth chain died on `Unexpected token 'export'`. `jest.config.js`
now transforms `jose` and `@panva` **only** — every other node_modules
package is still skipped, so the cost does not fall on the whole suite.

This is API-contract level, not over HTTP — stated plainly in the file
header and in `HARDENING_REMAINING.md`.

## 4. Performance smoke — `tests/performance/hot-path-budgets.spec.ts`, 12 tests

Budgets set **20–50× above measured local figures**, because a tight
budget on a shared CI runner produces a flaky test, and a flaky
performance test trains everyone to re-run the pipeline — the exact habit
that lets a real regression through.

Covers the paths the audit identified as per-ping or per-record: geofence
prefilter (500 geofences × 1000 pings), the warm-cache path, timestamp
and numeric normalisation, rollup aggregation for a vehicle-day and a
50-vehicle day (linear, not quadratic), the odometer guard, idempotency
key construction, and that the backup writer stays lazy.

One is a security check in disguise: a malformed timestamp must parse in
the same order of magnitude as a valid one, guarding against catastrophic
regex backtracking on hostile input.

No benchmark framework added — Jest plus `performance.now()` answers "did
this get 100× worse", which is the question.

## 5. CI — `.github/workflows/ci.yml`

**The pipeline could not pass.** `npm run lint` runs `next lint`, which
exits 1 with 23 pre-existing errors, and it sat **before** the test steps
— so type-check and tests never ran at all. A green-looking pipeline that
has never executed a test is worse than none, because it is mistaken for
coverage.

Also: `pull_request` was scoped to `branches: [main]`, so a PR into
`develop` ran nothing; and it ran `test:unit` rather than `npm test`.

Now: PRs to **main and develop**, running `npm ci` → `type-check` →
`npm test` → `test:security` → `test:performance`, all blocking. Lint
retained but **non-blocking** so its output stays visible without gating
merges on 23 pre-existing errors.

Integration tests run in a **separate job, allowed to fail**, with
`REQUIRE_INTEGRATION_DB=true` and a binary cache — a network-dependent
step must never block a merge on an infrastructure hiccup, and must not
be deleted either.

**No secret values are hardcoded.** The unit/security suites need none,
so a fork PR with no secrets access still gets a real signal.

## 6. Error monitoring

`fleet_unhandled_errors_total` was registered in Phase 7 and **never
called** — so it read zero forever, and an operator watching it would
have concluded the platform never errored. It is now incremented in
`withAuth`'s 5xx path, which is the one place every API error passes
through. `source: 'api'` is coarse by design: a route or message label
would be unbounded cardinality and would put error text where it cannot
be redacted.

`/api/observability/summary` now exposes unhandled / provider / database
error counts, telematics sync failures and stale vehicles, and outbox
`dead_letter` + `pending`. A `sumLabelled` helper was needed because the
existing `sumMetric` adds *every* series for a name — which for
`fleet_outbox_backlog` would have totalled pending + processing +
processed + dead_letter into one meaningless figure and made a healthy
backlog look like a crisis.

Authorization unchanged: summary on `Permission.JOB_VIEW`, the
cross-tenant surfaces on `PLATFORM_VIEW`.

---

## Files

**New (8)**
```
tests/security/route-auth-conformance.spec.ts        16 tests — closes S-1
tests/e2e/api-smoke.spec.ts                          14 tests
tests/performance/hot-path-budgets.spec.ts           12 tests
tests/integration/persistence-invariants.spec.ts     21 tests (skip-guarded)
tests/integration/support/mongo-harness.ts           connection + race helper
tests/integration/support/global-setup.ts            starts mongod before specs load
tests/integration/support/global-teardown.ts         stops it
jest.integration.config.js                           separate config + longer timeout
HARDENING_SUMMARY.md, HARDENING_REMAINING.md
```

**Modified (5)**
```
.github/workflows/ci.yml                 tests now actually run, on PRs to main and develop
jest.config.js                           narrow ESM transform for jose/@panva
package.json                             test:e2e, test:performance, test:integration wired up
server/middleware/with-auth.ts           increments the unhandled-error counter on 5xx
app/api/observability/summary/route.ts   error / telematics / outbox counts
```

---

## Manual steps

1. `npm ci`
2. **Run the integration tests somewhere with a database** — they have
   never been observed passing (see `HARDENING_REMAINING.md`).
3. Set `METRICS_SCRAPE_TOKEN` in every environment; the metrics endpoint
   fails closed without it.
4. For OTel export, set `OTEL_EXPORTER_OTLP_ENDPOINT` and
   `OTEL_EXPORTER_OTLP_HEADERS`. No endpoint is fabricated here.

No database migration, no index change, no backfill.

---

## Remaining

`HARDENING_REMAINING.md` has seven items. The ones worth naming:

- **Integration tests unverified here** (item 2 above).
- **23 lint errors** — made non-blocking, not fixed; fixing them means
  editing unrelated business logic.
- **No test asserts a *successful* authenticated request** — the E2E
  suite proves refusals, which is the higher-risk half, but minting a
  valid credential needs a seeded database.
- **`OBSERVABILITY_VIEW` is still unmerged**; the summary endpoint
  borrows `JOB_VIEW`. It *is* gated — the gap is that the permission is
  borrowed.

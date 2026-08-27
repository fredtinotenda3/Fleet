# Findings outside Phase 7

Recorded during Phase 7 and **deliberately not implemented**.

---

## Found during Phase 7

### P7-N1 · `/api/observability/metrics` has a FAIL-OPEN token check
**Severity: MEDIUM · Not fixed — needs your decision**

```ts
const requiredToken = process.env.METRICS_SCRAPE_TOKEN;
if (requiredToken) { /* check */ }
```

This is the **same shape as the Phase 0 `CRON_SECRET` bug**: when the
variable is unset the check is skipped entirely and the endpoint is open.
The file's own comment acknowledges it ("if unset, the endpoint is open
— fine behind a private network only").

Not fixed here, deliberately, because unlike the cron routes this is a
**live scrape path**: making it fail closed would immediately break a
working Prometheus setup that relies on the tokenless mode, and Phase 7
should not take telemetry collection down while adding observability.

Severity is genuinely lower than the cron finding — metrics carry no
tenant or vehicle data by construction (that is enforced by a test), so
what leaks is operational shape, not customer data. But it does expose
request rates, queue depths, error counts and now provider availability
to anyone who can reach the endpoint.

**Recommended:** set `METRICS_SCRAPE_TOKEN` in every environment, then
make the check fail closed in a follow-up once you have confirmed every
scraper presents it. I did not make that change for you because the
sequencing matters and only you know what is scraping it.

### P7-N2 · Stale-vehicle count is not yet populated
**Severity: LOW · Partially complete**

`fleet_telematics_stale_vehicles{provider}` is registered and
`recordStaleVehicles()` works, but nothing calls it on a schedule.

Computing it means a per-provider aggregation over `tbltelematics_devices`
comparing `lastFixAt` against a staleness horizon — cheap, but it needs a
scheduled job and a decision about the horizon (the live map uses 60
minutes; a metric might reasonably use something else). That is a small
job, not a design problem, and it belongs with whoever decides the alert
threshold.

The other five audit questions are answered without it.

### P7-N3 · Provider error category on the health endpoint is coarse
**Severity: LOW · Deliberate**

`lastErrorCategory` reports `'provider_error'` rather than the specific
Phase 2 category (`authentication_failed`, `rate_limited`, …) for a
tenant's most recent failure.

The reason is that the config document stores only `lastSyncStatus:
'error'` plus a vendor error STRING — the neutral category is computed at
the adapter boundary and never persisted. Surfacing the specific category
per tenant means storing it on the config at sync time, which is a schema
change to a collection Phase 7 otherwise does not touch.

The **metric** does carry the specific category
(`fleet_telematics_provider_errors_total{provider,category}`), so the
information is available platform-wide — it is only the per-tenant
breakdown on the endpoint that is coarse.

### P7-N4 · No OTel span attributes added for telematics
**Severity: LOW · Not fixed**

OpenTelemetry is initialised (`initObservability()`) and creates a root
span per `withAuth` request, but provider syncs run in workers outside
that path and produce no spans.

Not fixed because tracing a sync usefully means propagating context
through the queue into the worker, and this codebase has no trace
propagation across the BullMQ boundary. The metrics added here answer the
audit's questions; distributed tracing across the queue is a larger piece
of work with its own design decisions.

---

## Audit findings Phase 7 does not address

| ID | Finding | Severity |
|---|---|---|
| F-8 | Rate limiting is an in-memory `Map`, per-instance, reset on cold start | HIGH |
| F-9 | Query cache is invalidate-only and keyed by tenant, not org unit | HIGH |
| F-17 | Live map is a poll, presented as real-time | MEDIUM |
| S-1 | `middleware.ts` excludes non-versioned `/api/*` | **ARCHITECTURAL** |
| N-3 (Ph0) | `createAlert` writes no `orgUnitId` while the scoped read filters on it | MEDIUM |
| P3-N1 (Ph3) | `NotificationHandler` / `WebhookDispatchHandler` non-idempotent | MEDIUM |
| P4-N1 (Ph4) | Reports read raw telemetry, not rollups | MEDIUM |
| P6-N2 (Ph6) | AI services do not yet emit the evidence envelope | MEDIUM |
| P6-N3 (Ph6) | Attention dispatch has no persistence wiring or registered executors | MEDIUM |

**S-1 remains the highest-leverage remaining item**, and Phase 7 is a
reminder of why: the two new endpoints are protected only because I
wrapped them. Nothing structurally prevents the next one from being
added unwrapped, and `/api/observability/metrics` (P7-N1) is a live
example of an observability endpoint that is not.

---

## Testing gaps

- **The endpoints are asserted structurally, not driven.** The tests
  check that both call `withAuth` with `PLATFORM_VIEW` and are not bare
  handlers, and that `PLATFORM_VIEW` is genuinely platform-only. They do
  not issue an HTTP request as an unauthorized user, because the repo has
  no route-level integration harness (`test:integration` still runs
  `--passWithNoTests`).
- **Provider health is tested against synthetic sync states**, not a real
  Mongo config collection.

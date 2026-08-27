# Phase 7 — Observability for Telematics

Implemented on top of Phases 0–6.

## Status

| Item | Result |
|---|---|
| Provider health | **FIXED** |
| Telematics metrics | **FIXED** |
| Cron heartbeat | **FIXED** |
| Error surface | **FIXED** |
| Outbox operational surface | **FIXED** |
| Health check extensions | **FIXED** |
| Phase 0–6 regression | **PASSED** |

## Verification

| Check | Result |
|---|---|
| `npm ci` | succeeds |
| `npm run type-check` | **0 errors** |
| `npm test` | **1286 passed / 1286, 75 suites** |
| Baseline 1252 / 74 | **+34 tests, 0 regressions** |
| Phase 0–6 regression (13 suites) | **383 passed / 383** |
| New Phase 7 suite | **34 passed** |

---

## The six questions

| Question | Answered by |
|---|---|
| Is ingestion working? | `fleet_telematics_ingest_total`, `fleet_telematics_sync_total` |
| Which provider is failing? | `fleet_telematics_provider_available`, `GET /api/observability/telematics/providers` |
| Which vehicles are stale? | `fleet_telematics_stale_vehicles{provider}` — metric registered, **not yet populated** (P7-N2) |
| Which jobs are failing? | `fleet_scheduled_job_runs_total`, `fleet_scheduled_job_last_run_timestamp` |
| Which tenants are affected? | Provider health endpoint (**counts**) — deliberately not a metric label |
| How long has a provider been down? | `unavailableForMs` on the endpoint; availability gauge over time |

Five of six are fully answered. The stale-vehicle metric exists and works
but nothing calls it on a schedule yet — see **Remaining**.

---

## What changed

### Cardinality is the design constraint

`tenantId` and `vehicleId` appear in **no metric**. A 1,000-vehicle fleet
labelled by vehicle creates 1,000 series per metric per provider, and
Prometheus retains every series it has seen for the whole retention
window — a fleet that churns vehicles grows the scrape target without
bound. That is the failure mode where adding observability takes down the
thing being watched.

A test extracts every `labelNames` array in the registry and asserts none
names a high-cardinality dimension. "Which tenant?" is answered by the
**endpoint** instead: authorized, on demand, never a retained series.

### Cron heartbeat is a timestamp, not a counter

A counter cannot express "stopped running" — a job that stops simply
stops incrementing, indistinguishable from one that never ran.
`time() - fleet_scheduled_job_last_run_timestamp > 600` is alertable.

This is the metric that would have surfaced the **Phase 4 daily-cron
finding**: nothing errored, nothing was misconfigured in a way any health
check could see, and telemetry just stopped arriving.

### Provider health distinguishes degraded from unavailable

Eagle Track is deployed **per customer**, so each tenant points at a
different host. One tenant failing is a tenant problem; every tenant
failing is a vendor problem. A single boolean would conflate them and
page the wrong person.

`unknown` for configured-but-never-run — reporting *healthy* for
something that has never proven it works is the same class of lie as a
fabricated zero.

Downtime is measured **from the last success**, because the first failure
is not recorded anywhere (the config holds one overwritten `lastSyncAt`),
and time since the last known-good result is the length of the gap in
data — which is the figure an operator wants.

### Health checks degrade safely

Telematics and outbox are reported on `/api/health/ready` but do **not**
gate readiness. Failing readiness on a third party's outage would pull
every instance out of the load-balancer pool and convert a vendor
incident into a **total outage** — the failure mode where the health
check causes the incident it was meant to reveal.

Both informational checks return `ready` even from their catch blocks.
The readiness contract for existing consumers is unchanged.

### No credential or payload leaks

- Provider health never touches a token — no code path to a decrypted
  credential. Asserted by a test.
- `lastSyncError` (a vendor string that can carry response text) is
  **omitted entirely**, not half-redacted. A redaction that has to be
  right every time eventually is not.
- The outbox endpoint returns **counts only** — an outbox row stores the
  full domain event, and this is a cross-tenant surface.
- Error metrics use the Phase 2 **neutral category** (9 closed values),
  never the vendor's own code.

Both new endpoints require **`PLATFORM_VIEW`**, a platform-only
permission filtered out of every tenant-level role — the correct gate for
a cross-tenant surface.

---

## Files

**New (5)**
```
modules/telematics/services/telematics-observability.service.ts  recorder + health calculation
modules/telematics/services/provider-health.service.ts           cross-tenant aggregation
app/api/observability/telematics/providers/route.ts              PLATFORM_VIEW
app/api/observability/outbox/route.ts                            PLATFORM_VIEW
docs/TELEMATICS_OBSERVABILITY.md                                 architecture + alert queries

tests/security/telematics-observability.spec.ts                  34 tests
```

**Modified (3)**
```
infrastructure/observability/metrics.registry.ts   10 new metrics
workers/telemetry.worker.ts                        instruments sync + records heartbeat
app/api/health/ready/route.ts                      informational telematics + outbox checks
```

No database or index changes were needed.

---

## Manual steps

1. `npm ci`
2. Deploy. **No migration, no index, no backfill** — metrics accumulate
   from process start and the endpoints read existing collections.
3. Add the alert rules from `docs/TELEMATICS_OBSERVABILITY.md`.
4. **Set `METRICS_SCRAPE_TOKEN`** — see P7-N1 below.

---

## Remaining

`PHASE_7_REMAINING_FINDINGS.md` has the full list. Two worth naming:

**P7-N1 — `/api/observability/metrics` has a fail-open token check.**
Same shape as the Phase 0 `CRON_SECRET` bug: unset variable means the
endpoint is open. I did **not** fix it, deliberately — unlike the cron
routes this is a live scrape path, and making it fail closed would break
a working Prometheus setup that relies on tokenless mode. Severity is
lower (metrics carry no tenant or vehicle data, enforced by a test), but
it exposes request rates, queue depths and now provider availability.
**Set `METRICS_SCRAPE_TOKEN` everywhere, confirm every scraper presents
it, then make it fail closed in a follow-up.** The sequencing matters and
only you know what is scraping it.

**P7-N2 — the stale-vehicle gauge is registered but not populated.**
Needs a scheduled aggregation over `tbltelematics_devices` and a decision
about the staleness horizon (the live map uses 60 minutes). Small job,
but the threshold is an operational choice.

Also: **S-1 remains the highest-leverage architectural item**, and Phase
7 illustrates why. The two new endpoints are protected only because I
wrapped them; nothing structurally prevents the next one from being added
unwrapped — and `/api/observability/metrics` is a live example of one
that is not.

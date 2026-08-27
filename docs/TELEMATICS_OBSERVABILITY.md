# Telematics Observability

The audit's operational finding was that an operator could not answer six
questions. Here is where each is answered now.

| Question | Answered by |
|---|---|
| Is telematics ingestion working? | `fleet_telematics_ingest_total{provider}`, `fleet_telematics_sync_total{provider,status}` |
| Which provider is failing? | `fleet_telematics_provider_available{provider}`, `GET /api/observability/telematics/providers` |
| Which vehicles are stale? | `fleet_telematics_stale_vehicles{provider}` (count); the live map already flags individual vehicles |
| Which jobs are failing? | `fleet_scheduled_job_runs_total{job,status}`, `fleet_scheduled_job_last_run_timestamp{job}` |
| Which tenants are affected? | The **provider health endpoint** (counts) — deliberately not a metric label |
| How long has a provider been unavailable? | `unavailableForMs` on the health endpoint; `fleet_telematics_provider_available` over time |

Before Phase 7 there was **not one telematics metric**. The subsystem
doing the most external I/O, against the least reliable dependency, was
the least observable part of the platform.

---

## Cardinality is the design constraint

`provider` is a safe label — the registry holds two and a deployment
might reach five. `status` and `category` are small closed sets.

**`tenantId` and `vehicleId` are absent from every metric.** A
1,000-vehicle fleet labelled by vehicle creates 1,000 series per metric
per provider, and Prometheus retains every series it has seen for the
whole retention window — so a fleet that churns vehicles grows the scrape
target without bound. That is the failure mode where adding
observability takes down the thing being watched.

"Which tenant is affected?" is answered by the **endpoint**: authorized,
queried on demand, never retained as a time series. Metrics answer *is
something wrong and for how long*; the endpoint answers *for whom*.

A test asserts this: every `labelNames` array in the registry is checked
for `tenantId`, `vehicleId` and `externalDeviceId`.

---

## Metrics

```
fleet_telematics_sync_total{provider,status}
fleet_telematics_sync_duration_ms{provider}      histogram
fleet_telematics_ingest_total{provider}
fleet_telematics_stale_vehicles{provider}        gauge
fleet_telematics_provider_available{provider}    gauge, 1|0
fleet_telematics_provider_errors_total{provider,category}
fleet_scheduled_job_last_run_timestamp{job,status}  gauge, Unix seconds
fleet_scheduled_job_runs_total{job,status}
fleet_unhandled_errors_total{source}
fleet_outbox_backlog{status}                     gauge
```

Duration buckets straddle **15s** because that is the Eagle Track
client's own timeout — "we timed out" shows as a distinct step rather
than disappearing into a catch-all bucket.

`category` is the **Phase 2 neutral taxonomy** (9 closed values), never
the vendor's own code — that set is unbounded and would put vendor
internals into a label where they cannot be redacted.

### A partial sync counts as success

A sweep with per-vehicle errors is recorded `success`: the provider
responded and we ingested. Counting it as failure would make
`provider_available` flap to 0 on one bad vehicle and train an operator
to ignore the signal.

---

## Cron heartbeat

`fleet_scheduled_job_last_run_timestamp` is a **timestamp, not a
counter**. The alert that matters is:

```promql
time() - fleet_scheduled_job_last_run_timestamp{job="eagletrack-sync"} > 600
```

A counter cannot express that. A job that stops running simply stops
incrementing, which is indistinguishable from one that never ran, and
both look like a flat line.

This is the metric that would have surfaced the Phase 4 finding where
the Eagle Track cron was scheduled **daily** while the code expected
per-minute: nothing errored, nothing was misconfigured in any way a
health check could see, and telemetry just stopped arriving.

---

## Provider health

```
GET /api/observability/telematics/providers      requires PLATFORM_VIEW
```

```jsonc
{
  "aggregate": { "status": "degraded", "providers": 2, "unhealthy": 1 },
  "providers": [{
    "providerId": "eagletrack",
    "status": "degraded",
    "lastSuccessfulSyncAt": "2026-08-27T08:00:00.000Z",
    "lastSyncStatus": "error",
    "lastErrorCategory": "provider_error",
    "unavailableForMs": null,
    "configuredTenantCount": 12,
    "failingTenantCount": 3,
    "capabilities": ["live_position", "..."]
  }]
}
```

### healthy / degraded / unavailable / unknown

The distinction is operationally real. **Eagle Track is deployed per
customer**, so each tenant points at a different host:

- **degraded** — some tenants failing. A tenant problem (expired token,
  their box is down).
- **unavailable** — every tenant failing. A vendor or integration
  problem.
- **unknown** — configured but never run. Reporting *healthy* for
  something that has never proven it works is the same class of lie as a
  fabricated zero.

A single boolean would conflate degraded and unavailable and page the
wrong person.

**Downtime is measured from the last SUCCESS**, not the first failure —
the first failure is not recorded anywhere (the config holds one
overwritten `lastSyncAt`), and time since the last known-good result is
both computable and the figure an operator wants: the length of the gap
in data.

### What the response never contains

- **Tenant identifiers.** Counts only. An operator diagnosing a vendor
  outage needs to know how widespread it is, not which customers to name
  in a dashboard that may be screenshared.
- **Credentials.** There is no code path from the health service to a
  decrypted token. Asserted by a test.
- **Vendor messages.** `lastSyncError` on the config is a vendor string
  that can carry response text; it is **omitted entirely** rather than
  half-redacted — a redaction that has to be right every time eventually
  is not.

`PLATFORM_VIEW` is a **platform-only** permission (filtered out of every
tenant-level role in `PLATFORM_ONLY_PERMISSIONS`), which is the correct
gate for a cross-tenant surface: no organization owner can reach it
however many roles they hold.

---

## Outbox surface

```
GET /api/observability/outbox      requires PLATFORM_VIEW
```

Phase 3 built `countByStatus()` and nothing exposed it. `dead_letter` is
the number that matters: non-zero and non-decreasing means domain events
are being **permanently lost** — exactly the failure Phase 3 existed to
prevent, and exactly the one nobody notices without a surface.

Counts are also published to `fleet_outbox_backlog` on read, so it can
be alerted on rather than only looked at. Refreshed on inspection rather
than on every processor poll, so the cost is proportional to how often
anybody asks.

**Counts only, never payloads** — an outbox row stores the full domain
event, which can contain vehicle positions and driver identifiers, and
this is a cross-tenant surface.

---

## Error surface

`@sentry/nextjs` was removed and `sentry.ts` is a documented no-op, so
there is no error-monitoring backend. The brief rules out adding a paid
SaaS dependency, so this is the lightweight internal substitute:
`fleet_unhandled_errors_total{source}` plus
`fleet_telematics_provider_errors_total{provider,category}` on the
registry that already exists.

`source` is a coarse subsystem label (a closed set) — never a stack frame
or a message, either of which would be unbounded cardinality and would
put error text into a label where it cannot be redacted.

---

## Health checks

`/api/health/ready` now reports telematics and outbox **informationally**.
They do **not** gate readiness.

That distinction is the whole design. A readiness probe answers one
question: should the load balancer send this instance traffic? Mongo and
Redis are hard dependencies — down means the instance cannot serve
anything.

A telematics vendor being unreachable is not that. The platform still
serves vehicles, drivers, expenses and reporting; only live positions are
stale. **Failing readiness on a third party's outage would pull every
instance out of the pool and convert a vendor incident into a total
outage** — the failure mode where the health check causes the incident it
was meant to reveal.

The same applies to a dead-letter backlog: events are queued, not lost,
and taking the app offline would stop the processor draining them.

Both informational checks return `ready` even from their own catch
blocks, so a failure to *read* health can never fail the probe. The
readiness contract for existing consumers is unchanged.

---

## Logging

Provider operations log `providerId`, `tenantId`, `durationMs`,
`status`, `ingested` and — for a `ProviderError` — the neutral
`errorCategory`.

They never log tokens, passwords, authorization headers or full vendor
URLs. That holds because `ProviderError.providerDetail` is already
redacted at the Phase 2 adapter boundary (tokens stripped, endpoint-only
URLs, errno-code-only transport messages), so including a category here
cannot leak a credential.

`recordSync` never throws. An observability failure must not fail the
sync it is observing — that converts a monitoring bug into an outage.

---

## Suggested alerts

```promql
# A provider has been down for 10 minutes
fleet_telematics_provider_available == 0

# A scheduled job has stopped running
time() - fleet_scheduled_job_last_run_timestamp > 600

# Events are being permanently dropped
fleet_outbox_backlog{status="dead_letter"} > 0

# Credentials need rotating (not a vendor outage — do not wait it out)
increase(fleet_telematics_provider_errors_total{category="authentication_failed"}[15m]) > 0
```

The last one is the point of the neutral taxonomy: the category tells an
operator *what to do*, where a vendor string would send them to read
vendor documentation.

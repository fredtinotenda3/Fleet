import client from 'prom-client';

const register = new client.Registry();
client.collectDefaultMetrics({ register, prefix: 'fleet_' });

const httpRequestDuration = new client.Histogram({
  name: 'fleet_http_request_duration_seconds',
  help: 'Duration of HTTP API requests in seconds',
  labelNames: ['method', 'route', 'status'],
  buckets: [0.01, 0.025, 0.05, 0.1, 0.25, 0.5, 1, 2.5, 5, 10],
  registers: [register],
});

const httpRequestsTotal = new client.Counter({
  name: 'fleet_http_requests_total',
  help: 'Total number of HTTP API requests',
  labelNames: ['method', 'route', 'status'],
  registers: [register],
});

const dbQueryDuration = new client.Histogram({
  name: 'fleet_db_query_duration_seconds',
  help: 'Duration of MongoDB commands in seconds',
  labelNames: ['collection', 'operation'],
  buckets: [0.001, 0.005, 0.01, 0.025, 0.05, 0.1, 0.25, 0.5, 1, 2.5, 5],
  registers: [register],
});

const dbSlowQueriesTotal = new client.Counter({
  name: 'fleet_db_slow_queries_total',
  help: 'Total number of MongoDB commands exceeding the slow-query threshold',
  labelNames: ['collection', 'operation'],
  registers: [register],
});

const dbErrorsTotal = new client.Counter({
  name: 'fleet_db_errors_total',
  help: 'Total number of failed MongoDB commands',
  labelNames: ['collection', 'operation'],
  registers: [register],
});

const queueJobDuration = new client.Histogram({
  name: 'fleet_queue_job_duration_seconds',
  help: 'Duration of queue job processing in seconds',
  labelNames: ['jobType', 'status'],
  buckets: [0.05, 0.1, 0.5, 1, 2.5, 5, 10, 30, 60, 120],
  registers: [register],
});

const queueJobTotal = new client.Counter({
  name: 'fleet_queue_job_total',
  help: 'Total number of processed queue jobs',
  labelNames: ['jobType', 'status'],
  registers: [register],
});

const queueDepthGauge = new client.Gauge({
  name: 'fleet_queue_depth',
  help: 'Current depth of a queue by state (waiting/active/delayed/completed/failed/paused)',
  labelNames: ['queue', 'state'],
  registers: [register],
});

const workflowStepDuration = new client.Histogram({
  name: 'fleet_workflow_step_duration_seconds',
  help: 'Duration between a workflow step becoming active and being resolved',
  labelNames: ['workflowId', 'action'],
  buckets: [1, 5, 30, 60, 300, 1800, 3600, 86400],
  registers: [register],
});

const workflowInstancesTotal = new client.Counter({
  name: 'fleet_workflow_instances_total',
  help: 'Total number of workflow instances by terminal/transition status',
  labelNames: ['workflowId', 'status'],
  registers: [register],
});

const workflowActiveInstances = new client.Gauge({
  name: 'fleet_workflow_active_instances',
  help: 'Current count of in-progress workflow instances',
  labelNames: ['workflowId'],
  registers: [register],
});


// ─── PHASE 7: TELEMATICS OBSERVABILITY ────────────────────────────────
//
// The audit's operational finding was that an operator could not answer
// six questions: is ingestion working, which provider is failing, which
// vehicles are stale, which jobs are failing, which tenants are
// affected, and how long a provider has been down. There was not one
// telematics metric anywhere -- the subsystem doing the most external
// I/O, against the least reliable dependency, was the least observable
// part of the platform.
//
// CARDINALITY IS THE DESIGN CONSTRAINT HERE.
//
// `provider` is a safe label: the registry holds two, and a deployment
// might reach five. `status` and `category` are small closed sets.
//
// `tenantId` and `vehicleId` are DELIBERATELY ABSENT from every metric
// below. A 1,000-vehicle fleet would create 1,000 time series per
// metric per provider, and Prometheus keeps every series it has ever
// seen in memory for the retention window -- a fleet churning vehicles
// would grow the scrape target without bound. That is the failure mode
// where adding observability takes down the thing it was watching.
//
// "Which tenant is affected?" is answered by the provider-health
// ENDPOINT, which is authorized, queried on demand, and not retained as
// a time series. That split is the point: metrics answer "is something
// wrong and for how long", the endpoint answers "for whom".

const telematicsSyncTotal = new client.Counter({
  name: 'fleet_telematics_sync_total',
  help: 'Total provider sync cycles, by provider and outcome',
  labelNames: ['provider', 'status'],
  registers: [register],
});

const telematicsSyncDuration = new client.Histogram({
  name: 'fleet_telematics_sync_duration_ms',
  help: 'Duration of a provider sync cycle in milliseconds',
  labelNames: ['provider'],
  // Buckets chosen for VENDOR latency, not internal work: the Eagle
  // Track client's own timeout is 15s, so a bucket boundary sits either
  // side of it to make "we timed out" visible as a distinct step rather
  // than buried in a catch-all bucket.
  buckets: [100, 250, 500, 1000, 2500, 5000, 10_000, 15_000, 30_000, 60_000],
  registers: [register],
});

const telematicsIngestTotal = new client.Counter({
  name: 'fleet_telematics_ingest_total',
  help: 'Total telemetry readings ingested, by provider',
  labelNames: ['provider'],
  registers: [register],
});

const telematicsStaleVehicles = new client.Gauge({
  name: 'fleet_telematics_stale_vehicles',
  help: 'Vehicles whose most recent fix is older than the staleness horizon, by provider',
  labelNames: ['provider'],
  registers: [register],
});

const telematicsProviderAvailable = new client.Gauge({
  name: 'fleet_telematics_provider_available',
  help: '1 when the provider last responded successfully, 0 when it did not',
  labelNames: ['provider'],
  registers: [register],
});

const telematicsProviderErrorsTotal = new client.Counter({
  name: 'fleet_telematics_provider_errors_total',
  help: 'Provider failures by neutral error category (see provider.errors.ts)',
  // `category` is the Phase 2 taxonomy -- 9 closed values. Deliberately
  // NOT the vendor's own error code, which is unbounded and would put a
  // vendor's internals into a metric name.
  labelNames: ['provider', 'category'],
  registers: [register],
});

/**
 * PHASE 7 -- CRON HEARTBEAT.
 *
 * A Unix timestamp, not a counter. The question an operator asks is
 * "when did this last run", and the alert that matters is
 * `time() - fleet_scheduled_job_last_run_timestamp > threshold`.
 *
 * A counter cannot express that: a job that stops running simply stops
 * incrementing, which is indistinguishable from a job that never ran,
 * and both look identical to a graph showing a flat line. A timestamp
 * makes "stopped 4 hours ago" directly readable.
 *
 * This is the metric that would have caught the Phase 4 finding where
 * the Eagle Track cron was scheduled DAILY while the code expected
 * per-minute -- nothing was broken, nothing errored, and telemetry
 * simply stopped arriving.
 */
const scheduledJobLastRun = new client.Gauge({
  name: 'fleet_scheduled_job_last_run_timestamp',
  help: 'Unix timestamp (seconds) of the last completed run of a scheduled job',
  labelNames: ['job', 'status'],
  registers: [register],
});

const scheduledJobRunsTotal = new client.Counter({
  name: 'fleet_scheduled_job_runs_total',
  help: 'Total scheduled job runs by job and outcome',
  labelNames: ['job', 'status'],
  registers: [register],
});

/**
 * PHASE 7 -- ERROR SURFACE.
 *
 * `@sentry/nextjs` was removed and sentry.ts is a documented no-op, so
 * the platform has no error-monitoring backend. The brief rules out
 * adding a paid SaaS dependency, so this is the lightweight internal
 * substitute: counts, on the registry that already exists.
 *
 * `source` is a coarse subsystem label (a closed set), never a stack
 * frame or a message -- either would be unbounded cardinality and would
 * put error text into a metric label where it cannot be redacted.
 */
const unhandledErrorsTotal = new client.Counter({
  name: 'fleet_unhandled_errors_total',
  help: 'Unhandled errors by subsystem',
  labelNames: ['source'],
  registers: [register],
});

/**
 * PHASE 7 -- OUTBOX BACKLOG.
 *
 * Phase 3 built countByStatus() and nothing exposed it. `dead_letter`
 * is the number that matters: a non-zero, non-decreasing dead-letter
 * count means domain events are being permanently dropped, which is
 * exactly the failure Phase 3 existed to prevent and exactly the one
 * nobody notices without a gauge.
 */
const outboxBacklog = new client.Gauge({
  name: 'fleet_outbox_backlog',
  help: 'Outbox rows by status (pending/processing/processed/dead_letter)',
  labelNames: ['status'],
  registers: [register],
});

const genericMetric = new client.Gauge({
  name: 'fleet_generic_metric',
  help: 'Fallback gauge for ad-hoc monitoring.trackMetric() calls not yet promoted to a first-class metric',
  labelNames: ['name', 'tag1', 'tag2'],
  registers: [register],
});

class MetricsRegistry {
  readonly register = register;
  readonly httpRequestDuration = httpRequestDuration;
  readonly httpRequestsTotal = httpRequestsTotal;
  readonly dbQueryDuration = dbQueryDuration;
  readonly dbSlowQueriesTotal = dbSlowQueriesTotal;
  readonly dbErrorsTotal = dbErrorsTotal;
  readonly queueJobDuration = queueJobDuration;
  readonly queueJobTotal = queueJobTotal;
  readonly queueDepthGauge = queueDepthGauge;
  readonly workflowStepDuration = workflowStepDuration;
  readonly workflowInstancesTotal = workflowInstancesTotal;
  readonly workflowActiveInstances = workflowActiveInstances;

  // PHASE 7 -- telematics, scheduler, error and outbox surfaces.
  readonly telematicsSyncTotal = telematicsSyncTotal;
  readonly telematicsSyncDuration = telematicsSyncDuration;
  readonly telematicsIngestTotal = telematicsIngestTotal;
  readonly telematicsStaleVehicles = telematicsStaleVehicles;
  readonly telematicsProviderAvailable = telematicsProviderAvailable;
  readonly telematicsProviderErrorsTotal = telematicsProviderErrorsTotal;
  readonly scheduledJobLastRun = scheduledJobLastRun;
  readonly scheduledJobRunsTotal = scheduledJobRunsTotal;
  readonly unhandledErrorsTotal = unhandledErrorsTotal;
  readonly outboxBacklog = outboxBacklog;

  observeGeneric(name: string, value: number, tags?: Record<string, string>): void {
    try {
      const values = tags ? Object.values(tags) : [];
      genericMetric.set({ name, tag1: values[0] || '', tag2: values[1] || '' }, value);
    } catch {
      // Metrics recording must never break the caller
    }
  }

  async expose(): Promise<string> {
    return register.metrics();
  }

  contentType(): string {
    return register.contentType;
  }
}

export const metricsRegistry = new MetricsRegistry();
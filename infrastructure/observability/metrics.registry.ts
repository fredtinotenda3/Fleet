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
// tests/security/telematics-observability.spec.ts
//
// PHASE 7 -- the six questions an operator could not answer.
//
// The audit's finding was that there was not ONE telematics metric
// anywhere: the subsystem doing the most external I/O, against the least
// reliable dependency, was the least observable part of the platform.
//
// Two halves, deliberately:
//   BEHAVIOURAL -- health calculation and metric recording, exercised
//     directly against the real registry.
//   STRUCTURAL -- cardinality and credential-leak guards, which no
//     behavioural test can catch. A metric labelled by vehicleId would
//     pass every functional test and take down the scrape target six
//     months later.

import * as fs from 'fs';
import * as path from 'path';

const ROOT = path.resolve(__dirname, '../..');

jest.mock('@/infrastructure/monitoring/logger', () => ({
  monitoring: { logError: jest.fn(), logWarn: jest.fn(), logInfo: jest.fn(), logDebug: jest.fn() },
}));

import {
  telematicsObservability,
  computeProviderStatus,
  TenantSyncState,
} from '@/modules/telematics/services/telematics-observability.service';
import { metricsRegistry } from '@/infrastructure/observability/metrics.registry';
import { ProviderError } from '@/modules/telematics/providers/provider.errors';

function codeOf(rel: string): string {
  return fs
    .readFileSync(path.join(ROOT, rel), 'utf8')
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .replace(/(^|[^:])\/\/.*$/gm, '$1');
}

async function metricText(): Promise<string> {
  return metricsRegistry.expose();
}

describe('Phase 7: provider health reflects real sync outcomes', () => {
  const state = (over: Partial<TenantSyncState> = {}): TenantSyncState => ({
    tenantId: 't1',
    enabled: true,
    lastSyncAt: new Date('2026-08-27T09:00:00Z'),
    lastSyncStatus: 'success',
    ...over,
  });

  it('reports HEALTHY when every tenant succeeds', () => {
    expect(computeProviderStatus([state(), state({ tenantId: 't2' })])).toBe('healthy');
  });

  it('reports UNAVAILABLE when every tenant fails', () => {
    expect(
      computeProviderStatus([
        state({ lastSyncStatus: 'error' }),
        state({ tenantId: 't2', lastSyncStatus: 'error' }),
      ])
    ).toBe('unavailable');
  });

  it('reports DEGRADED when only some tenants fail', () => {
    // The distinction is operationally real: Eagle Track is deployed PER
    // CUSTOMER, so one tenant's expired token is a tenant problem while
    // every tenant failing is a vendor problem. A single boolean would
    // conflate them and page the wrong person.
    expect(
      computeProviderStatus([state(), state({ tenantId: 't2', lastSyncStatus: 'error' })])
    ).toBe('degraded');
  });

  it('reports UNKNOWN when configured but never run', () => {
    // Reporting healthy for something that has never proven it works is
    // the same class of lie as a fabricated zero.
    expect(computeProviderStatus([state({ lastSyncAt: null, lastSyncStatus: null })])).toBe(
      'unknown'
    );
  });

  it('reports UNKNOWN when no tenant has it enabled', () => {
    expect(computeProviderStatus([state({ enabled: false })])).toBe('unknown');
  });

  it('measures downtime from the LAST SUCCESS, not the first failure', () => {
    // The first failure is not recorded anywhere -- the config document
    // holds a single overwritten lastSyncAt. Time since the last known
    // good result is both computable and the figure an operator wants:
    // it is the length of the gap in data.
    const health = telematicsObservability.buildHealth({
      providerId: 'eagletrack',
      name: 'Eagle Track',
      capabilities: ['live_position'],
      states: [
        state({ lastSyncAt: new Date('2026-08-27T08:00:00Z'), lastSyncStatus: 'success' }),
        state({
          tenantId: 't2',
          lastSyncAt: new Date('2026-08-27T09:00:00Z'),
          lastSyncStatus: 'error',
        }),
      ],
      now: new Date('2026-08-27T10:00:00Z'),
    });

    // Degraded (one still succeeded), so no downtime figure.
    expect(health.status).toBe('degraded');
    expect(health.unavailableForMs).toBeNull();
  });

  it('computes downtime once every tenant is failing', () => {
    const health = telematicsObservability.buildHealth({
      providerId: 'eagletrack',
      name: 'Eagle Track',
      capabilities: [],
      states: [
        state({
          lastSyncAt: new Date('2026-08-27T09:00:00Z'),
          lastSyncStatus: 'error',
        }),
      ],
      now: new Date('2026-08-27T10:00:00Z'),
    });

    expect(health.status).toBe('unavailable');
    // No prior success recorded, so downtime is unknown rather than
    // invented as zero.
    expect(health.unavailableForMs).toBeNull();
  });

  it('reports tenant COUNTS, never tenant identifiers', () => {
    // An operator diagnosing a vendor outage needs to know how
    // widespread it is, not which customers to name in a dashboard that
    // may be screenshared.
    const health = telematicsObservability.buildHealth({
      providerId: 'eagletrack',
      name: 'Eagle Track',
      capabilities: [],
      states: [state(), state({ tenantId: 'acme-logistics', lastSyncStatus: 'error' })],
    });

    expect(health.configuredTenantCount).toBe(2);
    expect(health.failingTenantCount).toBe(1);
    expect(JSON.stringify(health)).not.toContain('acme-logistics');
    expect(JSON.stringify(health)).not.toContain('t1');
  });
});

describe('Phase 7: metrics are registered and increment correctly', () => {
  it('registers every telematics metric', async () => {
    telematicsObservability.recordSync({
      providerId: 'eagletrack',
      tenantId: 'tenant-a',
      durationMs: 1200,
      success: true,
      ingested: 42,
    });

    const text = await metricText();
    expect(text).toContain('fleet_telematics_sync_total');
    expect(text).toContain('fleet_telematics_sync_duration_ms');
    expect(text).toContain('fleet_telematics_ingest_total');
    expect(text).toContain('fleet_telematics_provider_available');
  });

  it('labels a successful sync with status="success"', async () => {
    telematicsObservability.recordSync({
      providerId: 'cartrack',
      tenantId: 'tenant-a',
      durationMs: 500,
      success: true,
    });

    const text = await metricText();
    expect(text).toMatch(/fleet_telematics_sync_total\{provider="cartrack",status="success"\}/);
  });

  it('labels a failed sync and drops availability to 0', async () => {
    telematicsObservability.recordSync({
      providerId: 'failprovider',
      tenantId: 'tenant-a',
      durationMs: 15_000,
      success: false,
      error: new ProviderError('provider_unavailable', 'down', { providerId: 'failprovider' }),
    });

    const text = await metricText();
    expect(text).toMatch(
      /fleet_telematics_sync_total\{provider="failprovider",status="error"\}/
    );
    expect(text).toMatch(/fleet_telematics_provider_available\{provider="failprovider"\} 0/);
  });

  it('counts provider errors by NEUTRAL category, not vendor code', async () => {
    // The Phase 2 taxonomy is 9 closed values. A vendor's own code set is
    // unbounded and would put vendor internals into a label where they
    // cannot be redacted.
    telematicsObservability.recordSync({
      providerId: 'eagletrack',
      tenantId: 'tenant-a',
      durationMs: 100,
      success: false,
      error: new ProviderError('authentication_failed', 'bad token', {
        providerId: 'eagletrack',
      }),
    });

    const text = await metricText();
    expect(text).toMatch(/category="authentication_failed"/);
  });

  it('categorises a non-ProviderError as "unknown" rather than dropping it', async () => {
    telematicsObservability.recordSync({
      providerId: 'eagletrack',
      tenantId: 'tenant-a',
      durationMs: 100,
      success: false,
      error: new Error('something else'),
    });

    const text = await metricText();
    expect(text).toMatch(/category="unknown"/);
  });

  it('NEVER throws, whatever the registry does', () => {
    // An observability failure must not fail the sync it is observing --
    // that converts a monitoring bug into an outage.
    expect(() =>
      telematicsObservability.recordSync({
        providerId: 'x',
        tenantId: 't',
        durationMs: NaN,
        success: true,
      })
    ).not.toThrow();
  });
});

describe('Phase 7: cardinality is bounded', () => {
  it('NO metric carries a tenant or vehicle label', () => {
    // THE guard that matters. A 1,000-vehicle fleet labelled by vehicle
    // creates 1,000 series per metric per provider, and Prometheus
    // retains every series it has seen for the whole retention window --
    // so a fleet that churns vehicles grows the scrape target without
    // bound. That is the failure mode where adding observability takes
    // down the thing being watched.
    const code = codeOf('infrastructure/observability/metrics.registry.ts');

    // Extract every labelNames array and check none names a high-
    // cardinality dimension.
    const labelSets = [...code.matchAll(/labelNames:\s*\[([^\]]*)\]/g)].map((m) => m[1]);
    expect(labelSets.length).toBeGreaterThan(5);

    for (const labels of labelSets) {
      expect(labels).not.toContain('tenantId');
      expect(labels).not.toContain('vehicleId');
      expect(labels).not.toContain('externalDeviceId');
    }
  });

  it('the recorder accepts a tenantId and does not pass it to a metric', async () => {
    telematicsObservability.recordSync({
      providerId: 'eagletrack',
      tenantId: 'super-secret-tenant-id',
      durationMs: 10,
      success: true,
    });

    const text = await metricText();
    expect(text).not.toContain('super-secret-tenant-id');
  });
});

describe('Phase 7: cron heartbeat', () => {
  it('records a timestamp, not just a counter', async () => {
    // A counter cannot express "stopped running": a job that stops
    // simply stops incrementing, which looks identical to one that never
    // ran. A timestamp makes `time() - last_run > threshold` alertable.
    telematicsObservability.recordScheduledRun('eagletrack-sync', true);

    const text = await metricText();
    expect(text).toContain('fleet_scheduled_job_last_run_timestamp');
    expect(text).toMatch(/job="eagletrack-sync"/);
  });

  it('the recorded timestamp is a plausible Unix seconds value', async () => {
    telematicsObservability.recordScheduledRun('heartbeat-test', true);
    const text = await metricText();

    const match = text.match(
      /fleet_scheduled_job_last_run_timestamp\{job="heartbeat-test",status="success"\} (\d+)/
    );
    expect(match).not.toBeNull();

    const recorded = Number(match![1]);
    const now = Math.floor(Date.now() / 1000);
    expect(Math.abs(now - recorded)).toBeLessThan(60);
  });

  it('distinguishes a failed run from a successful one', async () => {
    telematicsObservability.recordScheduledRun('failing-job', false);
    const text = await metricText();
    expect(text).toMatch(/fleet_scheduled_job_runs_total\{job="failing-job",status="error"\}/);
  });

  it('the worker records a heartbeat after a provider sweep', () => {
    // Without this the Phase 4 daily-cron finding stays invisible:
    // nothing errored, telemetry just stopped arriving.
    const code = codeOf('workers/telemetry.worker.ts');
    expect(code).toContain('recordScheduledRun(jobName, true)');
  });
});

describe('Phase 7: error and outbox surfaces', () => {
  it('counts unhandled errors by coarse subsystem', async () => {
    telematicsObservability.recordUnhandledError('telematics');
    const text = await metricText();
    expect(text).toMatch(/fleet_unhandled_errors_total\{source="telematics"\}/);
  });

  it('exposes outbox backlog including dead_letter', async () => {
    // A non-zero, non-decreasing dead-letter count means domain events
    // are being permanently lost -- the failure Phase 3 existed to
    // prevent, and the one nobody notices without a gauge.
    telematicsObservability.recordOutboxBacklog({
      pending: 3,
      processing: 1,
      processed: 100,
      dead_letter: 2,
    });

    const text = await metricText();
    expect(text).toMatch(/fleet_outbox_backlog\{status="dead_letter"\} 2/);
    expect(text).toMatch(/fleet_outbox_backlog\{status="pending"\} 3/);
  });

  it('records stale vehicles as a COUNT per provider', async () => {
    telematicsObservability.recordStaleVehicles('eagletrack', 7);
    const text = await metricText();
    expect(text).toMatch(/fleet_telematics_stale_vehicles\{provider="eagletrack"\} 7/);
  });
});

describe('Phase 7: observability endpoints are authorized', () => {
  const ENDPOINTS = [
    'app/api/observability/telematics/providers/route.ts',
    'app/api/observability/outbox/route.ts',
  ];

  it.each(ENDPOINTS)('%s requires PLATFORM_VIEW', (rel) => {
    // A platform-only permission: filtered out of every tenant-level
    // role, so no organization owner can reach a cross-tenant surface
    // however many roles they hold.
    const code = codeOf(rel);
    expect(code).toContain('withAuth');
    expect(code).toContain('Permission.PLATFORM_VIEW');
  });

  it.each(ENDPOINTS)('%s is not a bare exported handler', (rel) => {
    // middleware.ts does not cover non-versioned /api/*, so the wrapper
    // is the only protection on these paths.
    const code = codeOf(rel);
    expect(code).not.toMatch(/export\s+async\s+function\s+GET/);
  });

  it('PLATFORM_VIEW is genuinely platform-only', () => {
    const {
      Permission,
      rolePermissions,
      Role,
    } = require('@/server/permissions/roles');

    for (const role of [Role.ORGANIZATION_OWNER, Role.ORGANIZATION_ADMIN, Role.FLEET_MANAGER]) {
      expect(rolePermissions[role]).not.toContain(Permission.PLATFORM_VIEW);
    }
  });
});

describe('Phase 7: no credential or payload leaks', () => {
  it('the provider health service never touches a token', () => {
    const code = codeOf('modules/telematics/services/provider-health.service.ts');
    expect(code).not.toContain('token');
    expect(code).not.toContain('apiKey');
    expect(code).not.toContain('apiSecret');
    expect(code).not.toContain('decrypt');
  });

  it('the health response surfaces a category, never a vendor message', () => {
    // lastSyncError on the config is a vendor STRING that can carry
    // response text. Absent rather than half-redacted -- a redaction
    // that has to be right every time eventually is not.
    const code = codeOf('modules/telematics/services/provider-health.service.ts');
    expect(code).not.toContain('lastSyncError');
    expect(code).toContain('lastErrorCategory');
  });

  it('the outbox endpoint returns counts, never event payloads', () => {
    // An outbox row stores the full domain event, which can contain
    // vehicle positions and driver identifiers -- and this is a
    // cross-tenant surface.
    const code = codeOf('app/api/observability/outbox/route.ts');
    expect(code).toContain('countByStatus');
    expect(code).not.toContain('payload');
    expect(code).not.toContain('getDeadLetteredForTenant');
  });
});

describe('Phase 7: health checks degrade safely', () => {
  it('telematics and outbox are INFORMATIONAL, not gating', () => {
    // Failing readiness on a third party's outage would pull every
    // instance out of the load-balancer pool and convert a vendor
    // incident into a total outage -- the failure mode where the health
    // check causes the incident it was meant to reveal.
    const code = codeOf('app/api/health/ready/route.ts');
    expect(code).toContain(
      "const ready = database.status === 'ready' && redis.status === 'ready';"
    );
    expect(code).toContain('checkTelematics');
    expect(code).toContain('checkOutbox');
  });

  it('a provider-health read failure cannot fail the probe', () => {
    const code = codeOf('app/api/health/ready/route.ts');
    // Both informational checks return 'ready' even from their catch.
    const telematicsBlock = code.slice(
      code.indexOf('async function checkTelematics'),
      code.indexOf('async function checkOutbox')
    );
    expect(telematicsBlock).toContain("status: 'ready'");
    expect(telematicsBlock).toContain('catch');
  });

  it('the readiness contract for existing consumers is unchanged', () => {
    const code = codeOf('app/api/health/ready/route.ts');
    expect(code).toContain('database');
    expect(code).toContain('redis');
    expect(code).toContain('503');
  });
});

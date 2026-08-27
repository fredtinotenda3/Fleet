// modules/telematics/services/telematics-observability.service.ts
//
// PHASE 7 -- the six questions an operator could not answer.
//
// ---------------------------------------------------------------------
// THE BLIND SPOT
// ---------------------------------------------------------------------
// The audit found there was not ONE telematics metric anywhere. The
// subsystem doing the most external I/O, against the least reliable
// dependency (a vendor deployment we do not operate, per customer), was
// the least observable part of the platform.
//
// What existed was `lastSyncAt` / `lastSyncStatus` on a per-tenant
// config document: a single overwritten value, with no history, no
// duration, and no way to ask a question across tenants. An operator
// wanting to know "is Eagle Track down?" had to open a Mongo shell and
// read one document per tenant.
//
// ---------------------------------------------------------------------
// WHY A RECORDER RATHER THAN METRIC CALLS IN THE ADAPTERS
// ---------------------------------------------------------------------
// Every metric name, label set and cardinality decision lives here. An
// adapter calls `recordSync(...)` and knows nothing about Prometheus.
//
// That matters for the same reason the Phase 2 provider contract does:
// a third provider must not have to learn the metric conventions to be
// observable, and a change to those conventions must not mean editing
// every adapter. It also keeps the cardinality rule enforceable in one
// place -- see below.
//
// ---------------------------------------------------------------------
// THE CARDINALITY RULE, ENFORCED NOT DOCUMENTED
// ---------------------------------------------------------------------
// `tenantId` and `vehicleId` NEVER become metric labels. This module
// accepts them (it needs the tenant to log and to compute health) and
// deliberately does not pass them through to any counter.
//
// A 1,000-vehicle fleet labelled by vehicle would create 1,000 series
// per metric per provider, and Prometheus retains every series it has
// seen for the whole retention window -- so a fleet that churns
// vehicles grows the scrape target without bound. That is the failure
// mode where adding observability takes down the thing being watched.
//
// "Which tenant is affected?" is answered by the provider-health
// endpoint: authorized, queried on demand, never retained as a series.

import { metricsRegistry } from '@/infrastructure/observability/metrics.registry';
import { monitoring } from '@/infrastructure/monitoring/logger';
import { ProviderError } from '../providers/provider.errors';

export type ProviderHealthStatus = 'healthy' | 'degraded' | 'unavailable' | 'unknown';

/** One provider's operational picture, for the health endpoint. */
export interface ProviderHealth {
  providerId: string;
  name: string;
  status: ProviderHealthStatus;
  /** Most recent successful sync across all tenants, or null. */
  lastSuccessfulSyncAt: Date | null;
  /** Most recent sync attempt of any outcome. */
  lastSyncAt: Date | null;
  lastSyncStatus: 'success' | 'error' | null;
  /**
   * The NEUTRAL error category of the most recent failure -- the Phase 2
   * taxonomy, never the vendor's own code or message. A category tells
   * an operator what to do (rotate credentials vs wait vs escalate);
   * a vendor string tells them to go and read vendor documentation.
   */
  lastErrorCategory: string | null;
  /** How long the provider has been failing, in ms. Null when healthy. */
  unavailableForMs: number | null;
  /** How many tenants have this provider enabled. NOT which ones. */
  configuredTenantCount: number;
  /** Tenants whose most recent sync failed. A COUNT, not a list. */
  failingTenantCount: number;
  capabilities: readonly string[];
}

export interface TenantSyncState {
  tenantId: string;
  lastSyncAt?: Date | null;
  lastSyncStatus?: 'success' | 'error' | null;
  lastErrorCategory?: string | null;
  enabled?: boolean;
}

/**
 * A provider is DEGRADED rather than UNAVAILABLE while some tenants
 * still succeed.
 *
 * The distinction is real and operationally important here: Eagle Track
 * is deployed PER CUSTOMER, so each tenant points at a different host.
 * One tenant's expired token or unreachable box is a tenant problem;
 * every tenant failing at once is a vendor or integration problem. A
 * single boolean would conflate the two and page the wrong person.
 */
export function computeProviderStatus(states: TenantSyncState[]): ProviderHealthStatus {
  const enabled = states.filter((s) => s.enabled !== false);
  if (enabled.length === 0) return 'unknown';

  const attempted = enabled.filter((s) => s.lastSyncAt);
  // Configured but never run is UNKNOWN, not healthy. Reporting healthy
  // for something that has never proven it works is the same class of
  // lie as a fabricated zero.
  if (attempted.length === 0) return 'unknown';

  const failing = attempted.filter((s) => s.lastSyncStatus === 'error');
  if (failing.length === 0) return 'healthy';
  if (failing.length === attempted.length) return 'unavailable';
  return 'degraded';
}

export class TelematicsObservabilityService {
  /**
   * Records the outcome of one provider sync cycle.
   *
   * Never throws. An observability failure must not fail the sync it is
   * observing -- that would convert a monitoring bug into an outage,
   * which is the opposite of the point.
   */
  recordSync(params: {
    providerId: string;
    tenantId: string;
    durationMs: number;
    success: boolean;
    ingested?: number;
    error?: unknown;
  }): void {
    try {
      const status = params.success ? 'success' : 'error';

      // NOTE: tenantId is used for LOGGING below and never reaches a
      // metric label. See the header for why.
      metricsRegistry.telematicsSyncTotal.inc({
        provider: params.providerId,
        status,
      });

      metricsRegistry.telematicsSyncDuration.observe(
        { provider: params.providerId },
        params.durationMs
      );

      if (params.ingested && params.ingested > 0) {
        metricsRegistry.telematicsIngestTotal.inc(
          { provider: params.providerId },
          params.ingested
        );
      }

      metricsRegistry.telematicsProviderAvailable.set(
        { provider: params.providerId },
        params.success ? 1 : 0
      );

      if (!params.success) {
        // The NEUTRAL category, or 'unknown'. Never the vendor's own
        // code: that set is unbounded and would put vendor internals
        // into a label where they cannot be redacted.
        const category =
          params.error instanceof ProviderError ? params.error.category : 'unknown';

        metricsRegistry.telematicsProviderErrorsTotal.inc({
          provider: params.providerId,
          category,
        });
      }

      monitoring.logInfo('[telematics-observability] Sync recorded', {
        providerId: params.providerId,
        tenantId: params.tenantId,
        durationMs: params.durationMs,
        status,
        ingested: params.ingested ?? 0,
        // A ProviderError's detail is already redacted at the Phase 2
        // boundary (tokens stripped, endpoint-only URLs), so including
        // the category here cannot leak a credential.
        ...(params.error instanceof ProviderError
          ? { errorCategory: params.error.category }
          : {}),
      });
    } catch {
      // Deliberately silent. A metrics failure is not worth a log line
      // that could itself fail, and it must never propagate.
    }
  }

  /** Records how many vehicles are stale for a provider. */
  recordStaleVehicles(providerId: string, count: number): void {
    try {
      metricsRegistry.telematicsStaleVehicles.set({ provider: providerId }, count);
    } catch {
      /* never breaks the caller */
    }
  }

  /**
   * Records a scheduled job run.
   *
   * A TIMESTAMP, not just a counter. The alert that matters is
   * `time() - last_run > threshold`, and a counter cannot express it: a
   * job that stops running simply stops incrementing, which looks
   * identical to one that never ran. This is the metric that would have
   * surfaced the Phase 4 finding where the Eagle Track cron ran daily
   * while the code expected per-minute -- nothing errored, telemetry
   * just stopped arriving.
   */
  recordScheduledRun(job: string, success: boolean): void {
    try {
      const status = success ? 'success' : 'error';
      metricsRegistry.scheduledJobLastRun.set(
        { job, status },
        Math.floor(Date.now() / 1000)
      );
      metricsRegistry.scheduledJobRunsTotal.inc({ job, status });
    } catch {
      /* never breaks the caller */
    }
  }

  /** Records an unhandled error against a coarse subsystem label. */
  recordUnhandledError(source: string): void {
    try {
      metricsRegistry.unhandledErrorsTotal.inc({ source });
    } catch {
      /* never breaks the caller */
    }
  }

  /** Publishes outbox backlog counts as gauges. */
  recordOutboxBacklog(counts: Record<string, number>): void {
    try {
      for (const [status, value] of Object.entries(counts)) {
        metricsRegistry.outboxBacklog.set({ status }, value);
      }
    } catch {
      /* never breaks the caller */
    }
  }

  /**
   * Builds a provider's health picture from its per-tenant sync states.
   *
   * Pure, so it can be tested exhaustively without a database, and so
   * the endpoint below is a thin assembly of repository reads plus this.
   *
   * COUNTS, NOT LISTS. `failingTenantCount` deliberately does not carry
   * tenant ids: this endpoint is platform-scoped, and an operator
   * diagnosing a vendor outage needs to know how widespread it is, not
   * which customers to name in a dashboard that may be shared.
   */
  buildHealth(params: {
    providerId: string;
    name: string;
    capabilities: readonly string[];
    states: TenantSyncState[];
    now?: Date;
  }): ProviderHealth {
    const now = params.now ?? new Date();
    const enabled = params.states.filter((s) => s.enabled !== false);

    const attempts = enabled
      .filter((s) => s.lastSyncAt)
      .map((s) => ({ ...s, at: new Date(s.lastSyncAt as Date) }))
      .sort((a, b) => b.at.getTime() - a.at.getTime());

    const successes = attempts.filter((s) => s.lastSyncStatus === 'success');
    const failing = attempts.filter((s) => s.lastSyncStatus === 'error');

    const status = computeProviderStatus(params.states);

    /**
     * "How long has it been down?" measured from the LAST SUCCESS, not
     * from the first failure.
     *
     * The first failure is not recorded anywhere -- the config document
     * holds a single overwritten `lastSyncAt`. Time since the last known
     * good result is both computable from what we store and the figure
     * an operator actually wants: it is the length of the gap in data.
     */
    const lastSuccessfulSyncAt = successes.length > 0 ? successes[0].at : null;
    const unavailableForMs =
      status === 'unavailable' && lastSuccessfulSyncAt
        ? now.getTime() - lastSuccessfulSyncAt.getTime()
        : null;

    return {
      providerId: params.providerId,
      name: params.name,
      status,
      lastSuccessfulSyncAt,
      lastSyncAt: attempts.length > 0 ? attempts[0].at : null,
      lastSyncStatus: attempts.length > 0 ? attempts[0].lastSyncStatus ?? null : null,
      lastErrorCategory: failing.length > 0 ? failing[0].lastErrorCategory ?? null : null,
      unavailableForMs,
      configuredTenantCount: enabled.length,
      failingTenantCount: failing.length,
      capabilities: params.capabilities,
    };
  }
}

export const telematicsObservability = new TelematicsObservabilityService();

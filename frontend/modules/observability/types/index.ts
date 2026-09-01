// frontend/modules/observability/types/index.ts
//
// Mirrors the response of GET /api/observability/telematics/providers
// (see app/api/observability/telematics/providers/route.ts and
// modules/telematics/services/telematics-observability.service.ts)
// field-for-field. Do not add anything here that isn't already on the
// wire -- this module has no business inferring data the backend
// deliberately withholds (tenant identifiers, vendor payloads,
// credentials; see the backend route's own comment for why).

export type ProviderHealthStatus = 'healthy' | 'degraded' | 'unavailable' | 'unknown';

export interface ProviderHealth {
  providerId: string;
  name: string;
  status: ProviderHealthStatus;
  /** Most recent successful sync across all tenants, or null. ISO string over the wire. */
  lastSuccessfulSyncAt: string | null;
  /** Most recent sync attempt of any outcome. ISO string over the wire. */
  lastSyncAt: string | null;
  lastSyncStatus: 'success' | 'error' | null;
  /**
   * The neutral error category of the most recent failure (rotate vs
   * wait vs escalate). Never a vendor error string -- the backend
   * promises categories only.
   */
  lastErrorCategory: string | null;
  /** How long the provider has been failing, in ms. Null when not unavailable. */
  unavailableForMs: number | null;
  /** How many tenants have this provider enabled. NOT which ones. */
  configuredTenantCount: number;
  /** Tenants whose most recent sync failed. A count, not a list. */
  failingTenantCount: number;
  capabilities: readonly string[];
}

export interface ProviderHealthAggregate {
  status: ProviderHealthStatus;
  providers: number;
  unhealthy: number;
}

export interface ProviderHealthResponse {
  generatedAt: string;
  aggregate: ProviderHealthAggregate;
  providers: ProviderHealth[];
}

// ---------------------------------------------------------------------------
// Outbox operational summary -- mirrors GET /api/observability/outbox
// (app/api/observability/outbox/route.ts), which wraps
// OutboxRepository.countByStatus() in a plain (non-enveloped)
// NextResponse.json, same as the provider-health endpoint above. COUNTS
// ONLY, by design -- an outbox row holds the full domain event, which
// can carry vehicle positions and driver identifiers, and this is a
// cross-tenant surface.

export type OutboxStatus = 'pending' | 'processing' | 'processed' | 'dead_letter';

export type OutboxCounts = Record<OutboxStatus, number>;

export interface OutboxSummaryResponse {
  generatedAt: string;
  counts: OutboxCounts;
  /** Stated explicitly by the backend so a reader isn't left inferring it from a zero. */
  deadLetterRequiresOperator: boolean;
}

// ---------------------------------------------------------------------------
// Observability summary -- mirrors GET /api/observability/summary
// (app/api/observability/summary/route.ts). That route reads Prometheus
// text exposed by metricsRegistry.expose() and sums specific series, so
// every field here is a point-in-time counter total, not a snapshot of
// current state the way provider/outbox counts are.
//
// IMPORTANT PERMISSION NOTE: unlike the provider-health and outbox
// endpoints, this one is gated on Permission.JOB_VIEW, not
// PLATFORM_VIEW (see that route's own comment: an interim permission
// pending a dedicated OBSERVABILITY_VIEW permission). In today's role
// table both permissions are PLATFORM_ONLY and only Role.SUPER_ADMIN
// holds either, so nobody with page access can currently be missing
// JOB_VIEW -- but if a future role is granted PLATFORM_VIEW without
// JOB_VIEW, this specific fetch (and only this one) will 403. The
// dashboard treats that as a per-section fetch failure, not a reason to
// hide the whole page -- see OperationalDashboardPage.
//
// This route's response IS enveloped (successResponse -- { success,
// data, meta }), which apiClient.get() unwraps automatically, so the
// shape below is the inner `data` payload, matching how
// observabilityApi.getSummary() is typed.

export interface ObservabilitySummaryResponse {
  timestamp: string;
  http: { totalRequests: number };
  database: { slowQueries: number; errors: number };
  queue: { totalProcessed: number };
  workflow: { activeInstances: number };
  errors: {
    unhandled: number;
    providerErrors: number;
    databaseErrors: number;
  };
  telematics: {
    syncFailures: number;
    staleVehicles: number;
  };
  outbox: {
    deadLetteredEvents: number;
    pending: number;
  };
  note: string;
}

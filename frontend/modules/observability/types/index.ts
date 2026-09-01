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

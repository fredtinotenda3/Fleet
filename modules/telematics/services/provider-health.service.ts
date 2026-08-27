// modules/telematics/services/provider-health.service.ts
//
// PHASE 7 -- "which provider is failing, and for how long?"
//
// ---------------------------------------------------------------------
// WHAT THIS REPLACES
// ---------------------------------------------------------------------
// Nothing. There was no provider health surface at all. The only
// available signal was `lastSyncAt` / `lastSyncStatus` on a per-tenant
// config document -- a single overwritten value with no history and no
// cross-tenant view. Answering "is Eagle Track down?" meant opening a
// Mongo shell and reading one document per tenant.
//
// ---------------------------------------------------------------------
// PLATFORM-SCOPED BY NECESSITY, AND WHY THAT IS SAFE
// ---------------------------------------------------------------------
// This reads across tenants, like the outbox processor and the
// schedulers. It has to: "is the vendor down for everyone or just this
// customer?" is not answerable from inside one tenant, and that
// distinction is the whole diagnostic value -- Eagle Track is deployed
// PER CUSTOMER, so each tenant points at a different host we do not
// operate.
//
// The isolation guarantee is preserved by what it RETURNS rather than
// by what it reads:
//
//   * COUNTS, NEVER LISTS. `configuredTenantCount` and
//     `failingTenantCount` are numbers. No tenant id, name or identifier
//     appears in the response. An operator diagnosing a vendor outage
//     needs to know how widespread it is, not which customers to name
//     in a dashboard that may be screenshared.
//   * NO CREDENTIALS. Nothing here touches a token. The config
//     repositories return the encrypted field and this service reads
//     only the sync-state fields; there is no code path from here to a
//     decrypted credential.
//   * NO VENDOR PAYLOADS. The error surface is the Phase 2 neutral
//     CATEGORY, never the vendor's own message or response body.
//
// The endpoint that exposes this is gated on PLATFORM_VIEW, which is a
// platform-only permission (see PLATFORM_ONLY_PERMISSIONS in roles.ts),
// so no tenant-level administrator can reach it however many roles they
// hold.

import {
  telematicsObservability,
  ProviderHealth,
  TenantSyncState,
} from './telematics-observability.service';
import { listTelematicsProviders } from '../providers/provider.resolve';
import { PROVIDER_CARTRACK, PROVIDER_EAGLETRACK } from '../providers/provider.types';
import { monitoring } from '@/infrastructure/monitoring/logger';

/**
 * Per-tenant sync state for one provider.
 *
 * Reads the vendor config collections directly because that is where
 * sync state lives. Kept behind this function so the endpoint has no
 * knowledge of which collections exist -- adding a third provider means
 * adding a case here, not editing the endpoint.
 */
async function statesForProvider(providerId: string): Promise<TenantSyncState[]> {
  const load = async (
    repo: {
      listEnabledTenantIds(): Promise<string[]>;
      getConfig(tenantId: string): Promise<Record<string, unknown> | null>;
    }
  ): Promise<TenantSyncState[]> => {
    const tenantIds = await repo.listEnabledTenantIds();

    const states = await Promise.all(
      tenantIds.map(async (tenantId) => {
        const config = await repo.getConfig(tenantId);
        return {
          tenantId,
          enabled: config?.enabled !== false,
          lastSyncAt: (config?.lastSyncAt as Date | undefined) ?? null,
          lastSyncStatus: (config?.lastSyncStatus as 'success' | 'error' | undefined) ?? null,
          // The config stores a vendor error STRING. It is deliberately
          // NOT surfaced: it can carry vendor response text, and this
          // endpoint promises categories only. Absent rather than
          // half-redacted -- a redaction that has to be right every time
          // eventually is not.
          lastErrorCategory: config?.lastSyncStatus === 'error' ? 'provider_error' : null,
        } satisfies TenantSyncState;
      })
    );

    return states;
  };

  try {
    if (providerId === PROVIDER_EAGLETRACK) {
      const { eagletrackConfigRepository } = await import(
        '../repositories/eagletrack-config.repository'
      );
      return load(eagletrackConfigRepository as never);
    }

    if (providerId === PROVIDER_CARTRACK) {
      const { cartrackConfigRepository } = await import(
        '../repositories/cartrack-config.repository'
      );
      return load(cartrackConfigRepository as never);
    }
  } catch (error) {
    // A health endpoint that throws when one provider's collection is
    // unreadable is useless precisely when it is needed. Degrade to
    // "unknown" for that provider and keep reporting the others.
    monitoring.logWarn('[provider-health] Could not read provider sync state', {
      providerId,
      error: (error as Error).message,
    });
  }

  // A registered provider with no config collection reports UNKNOWN
  // rather than healthy. Reporting healthy for something that has never
  // proven it works is the same class of lie as a fabricated zero.
  return [];
}

export class ProviderHealthService {
  /** Health for every registered provider. */
  async getAll(now: Date = new Date()): Promise<ProviderHealth[]> {
    const descriptors = listTelematicsProviders();

    return Promise.all(
      descriptors.map(async (descriptor) => {
        const states = await statesForProvider(descriptor.providerId);

        return telematicsObservability.buildHealth({
          providerId: descriptor.providerId,
          name: descriptor.name,
          capabilities: descriptor.capabilities,
          states,
          now,
        });
      })
    );
  }

  /**
   * A single aggregate for the readiness check.
   *
   * `unavailable` only when EVERY provider is unavailable. One vendor
   * being down must not mark the whole platform unready -- the app still
   * serves every non-telematics function, and a readiness probe that
   * fails on a third party's outage takes the deployment down with it.
   * That is the failure mode where a health check causes the incident.
   */
  async aggregateStatus(): Promise<{
    status: 'healthy' | 'degraded' | 'unavailable' | 'unknown';
    providers: number;
    unhealthy: number;
  }> {
    const all = await this.getAll();
    if (all.length === 0) return { status: 'unknown', providers: 0, unhealthy: 0 };

    const unhealthy = all.filter(
      (p) => p.status === 'unavailable' || p.status === 'degraded'
    ).length;

    if (unhealthy === 0) {
      const anyKnown = all.some((p) => p.status === 'healthy');
      return { status: anyKnown ? 'healthy' : 'unknown', providers: all.length, unhealthy: 0 };
    }

    const allDown = all.every((p) => p.status === 'unavailable');
    return {
      status: allDown ? 'unavailable' : 'degraded',
      providers: all.length,
      unhealthy,
    };
  }
}

export const providerHealthService = new ProviderHealthService();

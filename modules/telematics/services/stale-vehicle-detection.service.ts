// modules/telematics/services/stale-vehicle-detection.service.ts
//
// PHASE 7 FOLLOW-UP -- populates fleet_telematics_stale_vehicles{provider}.
//
// The gauge and the recorder (recordStaleVehicles) already existed from
// Phase 7; nothing ever called it, so it sat at zero forever -- which
// reads identically to "every vehicle is reporting fine" on a dashboard.
// This module is what workers/telemetry.worker.ts's scheduled sweep
// calls to actually compute and publish the count.
//
// PURE ORCHESTRATION, INJECTABLE DEPENDENCIES. Same reasoning as
// telematics-observability.service.ts's buildHealth: keeping the DB
// read, the metric write and the provider list behind small interfaces
// means this can be exercised exhaustively with fakes, with no Mongo and
// no BullMQ in the test process, and the real worker wires the real
// singletons in exactly one place.
//
// CARDINALITY: this deliberately calls the repository once PER PROVIDER
// and passes only `providerId` to the recorder -- never a tenantId or a
// vehicleId. See metrics.registry.ts's Phase 7 header for why: a
// 1,000-vehicle fleet labelled per-vehicle would create 1,000 time
// series per metric per provider, and Prometheus never forgets a series
// it has seen. A COUNT per provider is the entire contract.
//
// ONE PROVIDER'S FAILURE DOES NOT ABORT THE SWEEP. A repository error
// for 'cartrack' must not prevent 'eagletrack' from being measured --
// same isolation principle as the per-tenant provider sync loop in
// workers/telemetry.worker.ts.

import { getStaleVehicleHorizonMinutes } from './stale-vehicle.config';
import { listTelematicsProviders } from '../providers/provider.resolve';
import { telematicsRepository } from '../repositories/telematics.repository';
import { telematicsObservability } from './telematics-observability.service';
import { monitoring } from '@/infrastructure/monitoring/logger';

/** The subset of TelematicsRepository this module depends on. */
export interface StaleVehicleCounter {
  countStaleDevicesByProvider(providerId: string, cutoff: Date): Promise<number>;
}

/** The subset of TelematicsObservabilityService this module depends on. */
export interface StaleVehicleRecorder {
  recordStaleVehicles(providerId: string, count: number): void;
}

/** Minimal provider-descriptor shape this module needs. */
export interface StaleVehicleProviderRef {
  providerId: string;
}

export interface DetectStaleVehiclesDeps {
  counter?: StaleVehicleCounter;
  recorder?: StaleVehicleRecorder;
  /** Defaults to every registered provider (listTelematicsProviders()). */
  listProviders?: () => StaleVehicleProviderRef[];
  /** Defaults to getStaleVehicleHorizonMinutes(). */
  horizonMinutes?: number;
  /** Defaults to `new Date()`. Injectable for deterministic tests. */
  now?: Date;
}

/**
 * Computes and publishes the stale-vehicle count for every registered
 * telematics provider.
 *
 * Returns the per-provider counts it computed, mainly so callers (and
 * tests) can assert on the result without re-deriving it from the
 * registry.
 */
export async function detectStaleVehicles(
  deps: DetectStaleVehiclesDeps = {}
): Promise<Record<string, number>> {
  const counter = deps.counter ?? telematicsRepository;
  const recorder = deps.recorder ?? telematicsObservability;
  const listProviders = deps.listProviders ?? listTelematicsProviders;
  const horizonMinutes = deps.horizonMinutes ?? getStaleVehicleHorizonMinutes();
  const now = deps.now ?? new Date();

  const cutoff = new Date(now.getTime() - horizonMinutes * 60_000);
  const providers = listProviders();

  const results: Record<string, number> = {};

  for (const provider of providers) {
    try {
      const count = await counter.countStaleDevicesByProvider(provider.providerId, cutoff);
      // NOTE: providerId only -- never tenantId or vehicleId. See the
      // module header.
      recorder.recordStaleVehicles(provider.providerId, count);
      results[provider.providerId] = count;
    } catch (error) {
      // One provider's DB failure must not stop the others from being
      // measured, and must never surface a stale (or fabricated) count
      // for the provider that failed -- recordStaleVehicles is simply
      // not called for it this cycle.
      monitoring.logError(
        '[stale-vehicle-detection] Failed to compute stale vehicle count',
        error as Error,
        { providerId: provider.providerId }
      );
    }
  }

  return results;
}

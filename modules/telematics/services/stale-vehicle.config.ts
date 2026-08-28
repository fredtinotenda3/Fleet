// modules/telematics/services/stale-vehicle.config.ts
//
// PHASE 7 FOLLOW-UP -- how stale is "stale" for
// fleet_telematics_stale_vehicles{provider}.
//
// The metric was registered in Phase 7 (metrics.registry.ts) and the
// recorder existed (telematics-observability.service.ts's
// recordStaleVehicles), but nothing ever called it: the gauge sat at
// zero forever, which is indistinguishable from "every vehicle is
// reporting fine" -- the same class of silent lie Phase 7's own header
// comment warns against for provider health.
//
// STALE_VEHICLE_HORIZON_MINUTES is the caller-facing horizon: a device
// whose `lastFixAt` (the PROVIDER's own reported fix time -- see
// telematics.types.ts on why this, not `lastPingAt`, is the correct
// baseline) is older than this many minutes counts as stale. Configurable
// per deployment because different fleets have different expected poll
// cadences and different tolerance for a gap before it's worth paging
// someone about.

export const DEFAULT_STALE_VEHICLE_HORIZON_MINUTES = 60;

/** The shortest horizon that will be accepted. Guards against a
 * fat-fingered `STALE_VEHICLE_HORIZON_MINUTES=0` making every device
 * with any fix at all appear stale on every run. */
export const MIN_STALE_VEHICLE_HORIZON_MINUTES = 1;

export class StaleVehicleConfigError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'StaleVehicleConfigError';
  }
}

/**
 * Resolves the configured staleness horizon, in minutes.
 *
 * Refused, not silently defaulted, on an invalid value -- an operator
 * who set an unparseable value would otherwise never learn their
 * setting was ignored.
 */
export function getStaleVehicleHorizonMinutes(): number {
  const raw = process.env.STALE_VEHICLE_HORIZON_MINUTES;
  if (raw === undefined || raw.trim() === '') return DEFAULT_STALE_VEHICLE_HORIZON_MINUTES;

  const parsed = Number(raw);
  if (
    !Number.isFinite(parsed) ||
    !Number.isInteger(parsed) ||
    parsed < MIN_STALE_VEHICLE_HORIZON_MINUTES
  ) {
    throw new StaleVehicleConfigError(
      `STALE_VEHICLE_HORIZON_MINUTES must be an integer >= ${MIN_STALE_VEHICLE_HORIZON_MINUTES}. ` +
        `Received: ${JSON.stringify(raw)}`
    );
  }
  return parsed;
}

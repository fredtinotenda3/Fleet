// shared/types/anomaly.tenancy-addendum.ts
//
// Adds the org-unit dimension to detected anomalies.
//
// An anomaly is derived from a vehicle's fuel, trip and expense history
// and names the vehicle (licensePlate) in its payload. A derived record
// cannot be less protected than its inputs, or the analytics layer
// becomes a clean bypass of the scoping applied to the source
// collections: the fuel logs are hidden, but "unusual fuel spend on
// AHA2127" is not.
//
// BACKFILL: from the vehicle identified by Anomaly.licensePlate.

import '@/shared/types/anomaly.types';

declare module '@/shared/types/anomaly.types' {
  interface Anomaly {
    /** Inherited from the vehicle the anomaly was detected on. */
    orgUnitId?: string;
  }
}

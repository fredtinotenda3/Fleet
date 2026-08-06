// modules/telematics/types/telematics.tenancy-addendum.ts
//
// Adds the org-unit dimension to telematics.
//
// This is the most privacy-sensitive collection in the product. A
// TelematicsData row is a timestamped GPS fix for a named vehicle; in
// aggregate the collection is a movement history of identifiable
// employees. Alerts name the vehicle and the behaviour (speeding, harsh
// braking). Geofences reveal customer sites and depot locations.
//
// All four collections inherit the scope of the vehicle they describe,
// except geofences, which are defined against a location rather than a
// vehicle and are therefore scoped to the org unit that owns the site.
//
// BACKFILL: from the referenced vehicle. Geofences created before this
// field must be assigned explicitly -- there is no vehicle to join to,
// so scripts/backfill-org-units.ts reports them and refuses to guess.

import '../types/telematics.types';

declare module '../types/telematics.types' {
  interface TelematicsData {
    /** Inherited from the vehicle this fix belongs to. */
    orgUnitId?: string;
  }

  interface TelematicsAlert {
    /** Inherited from the vehicle that raised the alert. */
    orgUnitId?: string;
  }

  interface TelematicsDevice {
    /** Inherited from the vehicle the device is installed in. */
    orgUnitId?: string;
  }

  interface Geofence {
    /**
     * The org unit that owns this geographic zone. NOT vehicle-derived:
     * a geofence is a place, not a vehicle, so it must be assigned
     * explicitly at creation. A geofence with no orgUnitId is treated as
     * organization-wide and is visible to every member -- which is the
     * correct default for a shared depot boundary, and the reason the
     * backfill will not invent one.
     */
    orgUnitId?: string;
  }
}

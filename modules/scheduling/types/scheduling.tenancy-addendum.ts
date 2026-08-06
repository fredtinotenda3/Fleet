// modules/scheduling/types/scheduling.tenancy-addendum.ts
//
// Adds the org-unit dimension to driver shifts.
//
// A shift rosters one driver, optionally onto one vehicle. Rosters are a
// branch/department operational concern: they reveal staffing levels,
// individual working patterns, and who is on duty when. A Department
// Manager scoped to one department must not see another department's
// roster, and DEPARTMENT_MANAGER holds SCHEDULE_SHIFT_MANAGE -- so
// leaving this unscoped let any department manager edit any other
// department's shifts, not merely read them.
//
// BACKFILL: from the driver (driverId), falling back to the vehicle
// (vehicleId) when the driver has no org unit yet.

import '../types/scheduling.types';

declare module '../types/scheduling.types' {
  interface DriverShift {
    /** Inherited from the rostered driver; falls back to the assigned vehicle. */
    orgUnitId?: string;
  }

  interface DriverShiftCreateDTO {
    /** Optional explicit override; normally derived from the driver at creation. */
    orgUnitId?: string;
  }
}

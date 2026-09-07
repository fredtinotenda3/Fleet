// modules/dispatch/types/dispatch.tenancy-addendum.ts
//
// Phase B: dispatch jobs assign a vehicle+driver out of a specific
// fleet, so a Fleet Manager scoped to their assigned fleet(s) needs the
// dispatch board filtered the same way vehicles already are. Same
// additive module-augmentation pattern as the other
// *.tenancy-addendum.ts files in this pass.

import '../types/dispatch.types';

declare module '../types/dispatch.types' {
  interface DispatchJob {
    /** The fleet (or branch) org unit this dispatch job belongs to. */
    orgUnitId?: string;
  }

  interface DispatchJobCreateDTO {
    /**
     * The fleet or branch org unit raising this dispatch job. Optional:
     * when omitted, DispatchService.create derives it from the
     * SUBMITTER's own assignment (resolveCreationOrgUnitId).
     *
     * CORRECTED: this comment previously promised the unit "falls back
     * to the assigned vehicle's orgUnitId once assigned". No such
     * fallback was ever implemented, and it is deliberately not
     * implemented now -- re-homing a live job to another branch at
     * assignment time would remove it from the board of the dispatcher
     * actively running it. The assignment path validates the vehicle is
     * in scope instead.
     */
    orgUnitId?: string;
  }
}
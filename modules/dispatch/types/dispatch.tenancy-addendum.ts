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
    /** The fleet org unit raising this dispatch job. Optional: falls back to the assigned vehicle's orgUnitId once assigned (see DispatchService). */
    orgUnitId?: string;
  }
}
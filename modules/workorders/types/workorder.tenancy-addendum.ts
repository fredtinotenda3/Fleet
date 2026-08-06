// modules/workorders/types/workorder.tenancy-addendum.ts
//
// Phase B: work orders are the primary record a Workshop Manager works
// against day-to-day, so this is the highest-priority gap closed in
// this pass. Same additive module-augmentation pattern as
// workshop.tenancy-addendum.ts -- does not touch workorder.types.ts.

import '../types/workorder.types';

declare module '../types/workorder.types' {
  interface WorkOrder {
    /**
     * The workshop org unit this work order was raised against.
     * Optional for backward compatibility with rows written before this
     * field existed.
     */
    orgUnitId?: string;
  }

  interface WorkOrderCreateDTO {
    /** The workshop org unit raising this work order. Optional: falls back to the vehicle's own orgUnitId when omitted (see WorkOrderService.create). */
    orgUnitId?: string;
  }
}
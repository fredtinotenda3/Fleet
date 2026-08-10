// modules/workorders/types/workorder.dvir-addendum.ts
//
// Additive module augmentation (same pattern as
// workorder.tenancy-addendum.ts) so a work order auto-created from a
// DVIR defect carries a back-reference to the inspection/driver/photo
// that raised it, without touching workorder.types.ts directly.

import '../types/workorder.types';

declare module '../types/workorder.types' {
  interface WorkOrder {
    /** 'dvir' when auto-created from a driver inspection defect; undefined/'manual' otherwise. */
    source?: 'dvir' | 'manual' | 'reminder';
    /** The DVIRInspection._id this work order was raised from, when source === 'dvir'. */
    dvirInspectionId?: string;
    /** The driver who reported the defect, when source === 'dvir'. */
    driverId?: string;
    /** Signed URL of the defect photo captured at inspection time, when provided. */
    photoUrl?: string;
  }

  interface WorkOrderCreateDTO {
    source?: 'dvir' | 'manual' | 'reminder';
    dvirInspectionId?: string;
    driverId?: string;
    photoUrl?: string;
  }
}

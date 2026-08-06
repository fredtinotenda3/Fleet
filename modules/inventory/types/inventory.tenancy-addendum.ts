// modules/inventory/types/inventory.tenancy-addendum.ts
//
// Phase B: spare parts and their stock movements are physically held at
// a workshop, so a Workshop Manager scoped to a single workshop needs
// both filtered by orgUnitId the same way WorkOrder now is. Same
// additive module-augmentation pattern as the other *.tenancy-addendum
// files in this pass.

import '../types/inventory.types';

declare module '../types/inventory.types' {
  interface SparePart {
    /** The workshop org unit this part's stock is held at. */
    orgUnitId?: string;
  }

  interface StockMovement {
    /**
     * Denormalized from the parent SparePart's orgUnitId at write time
     * so movement history can be scope-filtered directly without a join
     * -- same denormalization rationale as orgUnitId already being
     * stamped onto FuelLog/Expense/Trip/Reminder rather than derived
     * from the vehicle at read time.
     */
    orgUnitId?: string;
  }

  interface SparePartCreateDTO {
    /** The workshop org unit this part's stock is held at. Optional: a part created without one is only visible to org-wide roles until assigned. */
    orgUnitId?: string;
  }
}
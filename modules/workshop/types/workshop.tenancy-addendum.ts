// modules/workshop/types/workshop.tenancy-addendum.ts
//
// Phase B (repository/analytics scoping completeness): WorkshopBay and
// MechanicAssignment previously had no org-unit dimension at all, so a
// Workshop Manager's UserScopeAssignment (role: 'workshop_manager',
// orgUnitId: <workshop org unit>) had nothing to filter these two
// collections by -- "Workshop Manager can ONLY see their assigned
// workshop" was unenforceable for bays/mechanic assignments even though
// it already worked for work orders' sibling data.
//
// Follows the same module-augmentation pattern used by
// modules/vehicles/types/vehicle.tenancy-addendum.ts (see the reference
// comment in server/repositories/tenant-scoped.repository.ts) instead of
// editing workshop.types.ts directly, so this is purely additive and
// cannot regress anything currently importing WorkshopBay/
// MechanicAssignment.

import '../types/workshop.types';

declare module '../types/workshop.types' {
  interface WorkshopBay {
    /**
     * The workshop org unit (OrgUnitType 'workshop') this bay physically
     * belongs to. Optional for backward compatibility with existing rows
     * written before this field existed -- those rows are simply
     * invisible to scope-narrowed Workshop Managers until backfilled
     * (see the accompanying backfill note in the migration guide),
     * exactly like the same backward-compat design already accepted for
     * Vehicle/FuelLog/Expense/Reminder/Trip's orgUnitId.
     */
    orgUnitId?: string;
  }

  interface MechanicAssignment {
    /**
     * The workshop org unit the assignment is scoped to. Populated from
     * the parent WorkshopBay's orgUnitId at creation time by
     * WorkshopService.assignMechanic (see workshop.service.ts).
     */
    orgUnitId?: string;
  }

  interface WorkshopBayCreateDTO {
    /** The workshop org unit this bay belongs to. Optional: a bay created without one is only visible to org-wide roles until assigned. */
    orgUnitId?: string;
  }
}
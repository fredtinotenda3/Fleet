// shared/types/driver.tenancy-addendum.ts
//
// Phase B: drivers are assigned to a branch/department, so a Branch
// Manager or Department Manager scoped via UserScopeAssignment needs
// the driver roster filtered the same way vehicles already are. Same
// additive module-augmentation pattern as the other
// *.tenancy-addendum.ts files in this pass -- does not touch
// driver.types.ts.
//
// Note (confirmed from a live tbldrivers document): most existing
// driver rows currently carry only { tenantId, name, driver_code,
// isDeleted, createdAt, updatedAt } -- no orgUnitId, and (per
// driver.repository.ts's own buildStatusCondition() comment) often no
// `status` either. Exactly like Vehicle/FuelLog/Expense/Reminder/Trip
// before them, unbackfilled drivers are simply invisible to a
// scope-narrowed Branch/Department Manager until assigned to an org
// unit -- org-wide roles (owner/admin/super admin) are unaffected since
// they get accessibleOrgUnitIds === null.

import '@/shared/types/driver.types';

declare module '@/shared/types/driver.types' {
  interface Driver {
    /** The branch or department org unit this driver is assigned to. */
    orgUnitId?: string;
  }
}
// modules/compliance/types/compliance.tenancy-addendum.ts
//
// Adds the org-unit dimension to compliance RECORDS only.
//
// The split matters and is deliberate:
//
//   ComplianceRule   -- "every vehicle needs a valid roadworthiness
//                       certificate". An organization-wide policy. If it
//                       were scoped, the same vehicle would be judged
//                       compliant in one branch and non-compliant in
//                       another. NOT scoped.
//
//   ComplianceRecord -- evidence about one specific vehicle or driver:
//                       licence numbers, expiry dates, inspection
//                       outcomes, and often a scanned document
//                       reference. Inherits the subject's scope.
//                       SCOPED.
//
// BACKFILL: from the referenced entity (vehicle or driver) via the
// record's entityType/entityId pair.

import '../types/compliance.types';

declare module '../types/compliance.types' {
  interface ComplianceRecord {
    /** Inherited from the vehicle or driver this record is evidence about. */
    orgUnitId?: string;
  }
}

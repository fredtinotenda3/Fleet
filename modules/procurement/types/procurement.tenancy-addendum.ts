// modules/procurement/types/procurement.tenancy-addendum.ts
//
// Adds the org-unit dimension to purchase requests and purchase orders.
//
// This one is a segregation-of-duties fix, not merely a visibility fix.
// BRANCH_MANAGER holds Permission.PROCUREMENT_APPROVE. With procurement
// unscoped, any branch manager could approve any other branch's spend --
// the approval endpoint looks up the request by id within the tenant,
// and the tenant is the whole organization. Scoping the request is what
// makes "approver must belong to the requesting unit" enforceable.
//
// BACKFILL: purchase requests carry no vehicle or driver reference, so
// there is nothing to join to. scripts/backfill-org-units.ts REPORTS
// these and refuses to assign them -- guessing a budget owner would be
// worse than leaving the row org-wide-invisible until an operator says
// where it belongs.

import '../types/procurement.types';

declare module '../types/procurement.types' {
  interface PurchaseRequest {
    /** The branch/workshop whose budget this request draws on. Set at creation. */
    orgUnitId?: string;
  }

  interface PurchaseOrder {
    /** Inherited from the originating purchase request. */
    orgUnitId?: string;
  }
}

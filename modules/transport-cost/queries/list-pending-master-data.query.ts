// modules/transport-cost/queries/list-pending-master-data.query.ts
//
// GAP-CLOSURE PASS, Objectives 1/3/5. Lists TransportPartner/
// ContractedVehicle rows with reviewStatus: 'needs-review' -- the
// resolution queue for request-new-transporter.command.ts /
// request-new-vehicle.command.ts. Reuses each repository's own
// findNeedingReview(), which existed but had no caller before this
// pass (see those repositories' own header comments).
//
// No pagination parameter, matching findNeedingReview's own signature:
// capped at 1000 rows per kind, which the O2 spec's own volume note
// (~141 distinct transporter names platform-wide) says is generous
// headroom for this queue specifically.

import { BaseQuery } from '@/server/cqrs/query';

export class ListPendingMasterDataQuery extends BaseQuery {
  static readonly queryName = 'ListPendingMasterDataQuery';

  constructor(public readonly tenantId: string) {
    super(ListPendingMasterDataQuery.queryName);
  }
}

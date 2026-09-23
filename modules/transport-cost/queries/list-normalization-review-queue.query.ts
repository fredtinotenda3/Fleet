// modules/transport-cost/queries/list-normalization-review-queue.query.ts
//
// Phase O2's review queue listing -- organization-level (plain
// tenantId, not TenantContext/org-unit scoping: TransportPartner/
// ContractedVehicle/NormalizationReviewItem carry no orgUnitId, see
// their own type headers), unlike GetTransportCostSourceRecordsQuery.

import { BaseQuery } from '@/server/cqrs/query';
import { NormalizationKind } from '@/shared/types/normalization-review.types';
import { PaginationParams } from '@/shared/types/common.types';

export class ListNormalizationReviewQueueQuery extends BaseQuery {
  static readonly queryName = 'ListNormalizationReviewQueueQuery';

  constructor(
    public readonly tenantId: string,
    public readonly pagination: PaginationParams,
    /** Omit to list both kinds together. */
    public readonly kind?: NormalizationKind
  ) {
    super(ListNormalizationReviewQueueQuery.queryName);
  }
}

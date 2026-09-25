// modules/transport-cost/services/transport-cost-query.service.ts

import { queryBus } from '@/server/cqrs/query-bus';
import { GetTransportCostSourceRecordsQuery } from '../queries/get-transport-cost-source-records.query';
import {
  TransportCostSourceRecord,
  TransportCostSourceRecordFilters,
} from '@/shared/types/transport-cost.types';
import { PaginatedResponse, PaginationParams } from '@/shared/types/common.types';
import type { TenantContext } from '@/modules/tenancy/services/tenant-context.service';

import { ListNormalizationReviewQueueQuery } from '../queries/list-normalization-review-queue.query';
import { NormalizationKind, NormalizationReviewItem } from '@/shared/types/normalization-review.types';

// GAP-CLOSURE PASS, Objectives 1/3/5.
import { ListPendingMasterDataQuery } from '../queries/list-pending-master-data.query';
import type { PendingMasterDataResult } from '../queries/handlers/list-pending-master-data.handler';

export class TransportCostQueryService {
  async getSourceRecords(
    filters: TransportCostSourceRecordFilters,
    pagination: PaginationParams,
    context: TenantContext
  ): Promise<PaginatedResponse<TransportCostSourceRecord>> {
    return queryBus.execute<PaginatedResponse<TransportCostSourceRecord>>(
      new GetTransportCostSourceRecordsQuery(filters, pagination, context)
    );
  }

  /** Phase O2. Organization-level -- bare tenantId, not TenantContext. */
  async listNormalizationReviewQueue(
    tenantId: string,
    pagination: PaginationParams,
    kind?: NormalizationKind
  ): Promise<PaginatedResponse<NormalizationReviewItem>> {
    return queryBus.execute<PaginatedResponse<NormalizationReviewItem>>(
      new ListNormalizationReviewQueueQuery(tenantId, pagination, kind)
    );
  }

  /** GAP-CLOSURE PASS, Objectives 1/3/5. Organization-level, same reasoning as listNormalizationReviewQueue above. */
  async listPendingMasterData(tenantId: string): Promise<PendingMasterDataResult> {
    return queryBus.execute<PendingMasterDataResult>(new ListPendingMasterDataQuery(tenantId));
  }
}

export const transportCostQueryService = new TransportCostQueryService();

// modules/transport-cost/services/transport-cost-query.service.ts

import { queryBus } from '@/server/cqrs/query-bus';
import { GetTransportCostSourceRecordsQuery } from '../queries/get-transport-cost-source-records.query';
import {
  TransportCostSourceRecord,
  TransportCostSourceRecordFilters,
} from '@/shared/types/transport-cost.types';
import { PaginatedResponse, PaginationParams } from '@/shared/types/common.types';
import type { TenantContext } from '@/modules/tenancy/services/tenant-context.service';

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
}

export const transportCostQueryService = new TransportCostQueryService();

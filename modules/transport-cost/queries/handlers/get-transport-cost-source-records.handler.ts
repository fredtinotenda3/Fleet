// modules/transport-cost/queries/handlers/get-transport-cost-source-records.handler.ts

import { IQueryHandler } from '@/server/cqrs/query';
import { GetTransportCostSourceRecordsQuery } from '../get-transport-cost-source-records.query';
import { TransportCostSourceRecordRepository } from '@/modules/transport-cost/repositories/transport-cost-source-record.repository';
import { TransportCostSourceRecord } from '@/shared/types/transport-cost.types';
import { PaginatedResponse } from '@/shared/types/common.types';
import { Filter } from 'mongodb';

export class GetTransportCostSourceRecordsHandler
  implements IQueryHandler<GetTransportCostSourceRecordsQuery, PaginatedResponse<TransportCostSourceRecord>>
{
  constructor(private readonly repo: TransportCostSourceRecordRepository) {}

  async execute(
    query: GetTransportCostSourceRecordsQuery
  ): Promise<PaginatedResponse<TransportCostSourceRecord>> {
    const { sheetFamily, importBatchId, registration, startDate, endDate } = query.filters;

    const filter: Filter<TransportCostSourceRecord> = {};
    if (sheetFamily) filter.sheetFamily = sheetFamily;
    if (importBatchId) filter.importBatchId = importBatchId;
    if (registration) {
      // Matches the handler's own normalization (uppercased, whitespace
      // collapsed) so a caller can filter using the plate as printed on
      // the vehicle without separately re-implementing that rule here.
      filter.registration = registration.replace(/\s+/g, '').toUpperCase();
    }
    if (startDate || endDate) {
      filter.date = {
        ...(startDate ? { $gte: startDate } : {}),
        ...(endDate ? { $lte: endDate } : {}),
      } as Filter<TransportCostSourceRecord>['date'];
    }

    return this.repo.findInScope(filter, query.pagination, query.context);
  }
}

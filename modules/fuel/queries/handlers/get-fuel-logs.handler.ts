// modules/fuel/queries/handlers/get-fuel-logs.handler.ts

import { IQueryHandler } from '@/server/cqrs/query';
import { GetFuelLogsQuery } from '../get-fuel-logs.query';
import { FuelRepository } from '@/modules/fuel/repositories/fuel.repository';
import { FuelLog } from '@/shared/types/fuel.types';
import { PaginatedResponse } from '@/shared/types/common.types';

export class GetFuelLogsHandler
  implements IQueryHandler<GetFuelLogsQuery, PaginatedResponse<FuelLog>>
{
  constructor(private readonly fuelRepo: FuelRepository) {}

  async execute(query: GetFuelLogsQuery): Promise<PaginatedResponse<FuelLog>> {
    return this.fuelRepo.getFilteredLogs(
      query.filters,
      query.tenantId,
      query.pagination
    );
  }
}
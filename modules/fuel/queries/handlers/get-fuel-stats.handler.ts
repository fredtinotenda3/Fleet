// modules/fuel/queries/handlers/get-fuel-stats.handler.ts

import { IQueryHandler } from '@/server/cqrs/query';
import { GetFuelStatsQuery } from '../get-fuel-stats.query';
import { FuelRepository } from '@/modules/fuel/repositories/fuel.repository';
import { FuelStats } from '@/shared/types/fuel.types';

export class GetFuelStatsHandler
  implements IQueryHandler<GetFuelStatsQuery, FuelStats>
{
  constructor(private readonly fuelRepo: FuelRepository) {}

  async execute(query: GetFuelStatsQuery): Promise<FuelStats> {
    return this.fuelRepo.getFuelStats(query.tenantId, query.dateRange);
  }
}
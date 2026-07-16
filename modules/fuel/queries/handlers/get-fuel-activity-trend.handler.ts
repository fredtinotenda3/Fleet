//modules/fuel/queries/handlers/get-fuel-activity-trend.handler.ts

import { IQueryHandler } from '@/server/cqrs/query';
import { GetFuelActivityTrendQuery } from '../get-fuel-activity-trend.query';
import { FuelRepository } from '@/modules/fuel/repositories/fuel.repository';
import { FuelActivityTrendPoint } from '@/shared/types/fuel.types';

export class GetFuelActivityTrendHandler
  implements IQueryHandler<GetFuelActivityTrendQuery, FuelActivityTrendPoint[]>
{
  constructor(private readonly fuelRepo: FuelRepository) {}

  async execute(query: GetFuelActivityTrendQuery): Promise<FuelActivityTrendPoint[]> {
    return this.fuelRepo.getFuelActivityTrend(query.tenantId, query.granularity, query.dateRange);
  }
}
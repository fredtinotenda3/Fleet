//modules/fuel/queries/handlers/get-average-fuel-price-trend.handler.ts

import { IQueryHandler } from '@/server/cqrs/query';
import { GetAverageFuelPriceTrendQuery } from '../get-average-fuel-price-trend.query';
import { FuelRepository } from '@/modules/fuel/repositories/fuel.repository';
import { FuelPriceTrendPoint } from '@/shared/types/fuel.types';

export class GetAverageFuelPriceTrendHandler
  implements IQueryHandler<GetAverageFuelPriceTrendQuery, FuelPriceTrendPoint[]>
{
  constructor(private readonly fuelRepo: FuelRepository) {}

  async execute(query: GetAverageFuelPriceTrendQuery): Promise<FuelPriceTrendPoint[]> {
    return this.fuelRepo.getAverageFuelPriceTrend(query.tenantId, query.dateRange, query.granularity);
  }
}
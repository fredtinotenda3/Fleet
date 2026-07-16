//modules/fuel/queries/handlers/get-fuel-cost-distribution.handler.ts

import { IQueryHandler } from '@/server/cqrs/query';
import { GetFuelCostDistributionQuery } from '../get-fuel-cost-distribution.query';
import { FuelRepository } from '@/modules/fuel/repositories/fuel.repository';
import { FuelCostDistributionBucket } from '@/shared/types/fuel.types';

export class GetFuelCostDistributionHandler
  implements IQueryHandler<GetFuelCostDistributionQuery, FuelCostDistributionBucket[]>
{
  constructor(private readonly fuelRepo: FuelRepository) {}

  async execute(query: GetFuelCostDistributionQuery): Promise<FuelCostDistributionBucket[]> {
    return this.fuelRepo.getFuelCostDistribution(query.tenantId, query.dateRange);
  }
}
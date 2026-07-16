//modules/fuel/queries/handlers/get-fuel-type-distribution.handler.ts

import { IQueryHandler } from '@/server/cqrs/query';
import { GetFuelTypeDistributionQuery } from '../get-fuel-type-distribution.query';
import { FuelRepository } from '@/modules/fuel/repositories/fuel.repository';
import { FuelTypeDistributionRow } from '@/shared/types/fuel.types';

export class GetFuelTypeDistributionHandler
  implements IQueryHandler<GetFuelTypeDistributionQuery, FuelTypeDistributionRow[]>
{
  constructor(private readonly fuelRepo: FuelRepository) {}

  async execute(query: GetFuelTypeDistributionQuery): Promise<FuelTypeDistributionRow[]> {
    return this.fuelRepo.getFuelTypeDistribution(query.tenantId, query.dateRange);
  }
}
// modules/fuel/queries/handlers/get-fuel-by-driver.handler.ts

import { IQueryHandler } from '@/server/cqrs/query';
import { GetFuelByDriverQuery } from '../get-fuel-by-driver.query';
import { FuelRepository } from '@/modules/fuel/repositories/fuel.repository';
import { DriverFuelConsumptionRow } from '@/shared/types/fuel.types';

export class GetFuelByDriverHandler
  implements IQueryHandler<GetFuelByDriverQuery, DriverFuelConsumptionRow[]>
{
  constructor(private readonly fuelRepo: FuelRepository) {}

  async execute(query: GetFuelByDriverQuery): Promise<DriverFuelConsumptionRow[]> {
    return this.fuelRepo.getFuelByDriver(query.tenantId, query.dateRange, query.limit, query.sortBy);
  }
}
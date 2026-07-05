// modules/fuel/queries/handlers/get-monthly-fuel-consumption.handler.ts

import { IQueryHandler } from '@/server/cqrs/query';
import { GetMonthlyFuelConsumptionQuery } from '../get-monthly-fuel-consumption.query';
import { FuelRepository } from '@/modules/fuel/repositories/fuel.repository';

export class GetMonthlyFuelConsumptionHandler
  implements IQueryHandler<GetMonthlyFuelConsumptionQuery, Array<{ month: string; fuel: number; cost: number }>>
{
  constructor(private readonly fuelRepo: FuelRepository) {}

  async execute(
    query: GetMonthlyFuelConsumptionQuery
  ): Promise<Array<{ month: string; fuel: number; cost: number }>> {
    return this.fuelRepo.getMonthlyFuelConsumption(query.tenantId, query.months);
  }
}
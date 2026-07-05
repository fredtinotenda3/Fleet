// modules/fuel/queries/handlers/get-top-fuel-consumers.handler.ts

import { IQueryHandler } from '@/server/cqrs/query';
import { GetTopFuelConsumersQuery } from '../get-top-fuel-consumers.query';
import { FuelRepository } from '@/modules/fuel/repositories/fuel.repository';

export class GetTopFuelConsumersHandler
  implements IQueryHandler<GetTopFuelConsumersQuery, Array<{ license_plate: string; totalFuel: number; totalCost: number }>>
{
  constructor(private readonly fuelRepo: FuelRepository) {}

  async execute(
    query: GetTopFuelConsumersQuery
  ): Promise<Array<{ license_plate: string; totalFuel: number; totalCost: number }>> {
    return this.fuelRepo.getTopFuelConsumers(query.tenantId, query.limit);
  }
}
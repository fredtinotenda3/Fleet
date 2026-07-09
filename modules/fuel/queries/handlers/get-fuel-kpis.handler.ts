// modules/fuel/queries/handlers/get-fuel-kpis.handler.ts

import { IQueryHandler } from '@/server/cqrs/query';
import { GetFuelKpisQuery } from '../get-fuel-kpis.query';
import { FuelRepository } from '@/modules/fuel/repositories/fuel.repository';
import { FuelKpis } from '@/shared/types/fuel.types';

export class GetFuelKpisHandler implements IQueryHandler<GetFuelKpisQuery, FuelKpis> {
  constructor(private readonly fuelRepo: FuelRepository) {}

  async execute(query: GetFuelKpisQuery): Promise<FuelKpis> {
    return this.fuelRepo.getFuelKpis(query.tenantId, query.dateRange);
  }
}


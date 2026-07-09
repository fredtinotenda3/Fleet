
// modules/fuel/queries/handlers/get-abnormal-fuel-consumption.handler.ts

import { IQueryHandler } from '@/server/cqrs/query';
import { GetAbnormalFuelConsumptionQuery } from '../get-abnormal-fuel-consumption.query';
import { FuelRepository } from '@/modules/fuel/repositories/fuel.repository';
import { AbnormalFuelConsumptionRow } from '@/shared/types/fuel.types';

export class GetAbnormalFuelConsumptionHandler
  implements IQueryHandler<GetAbnormalFuelConsumptionQuery, AbnormalFuelConsumptionRow[]>
{
  constructor(private readonly fuelRepo: FuelRepository) {}

  async execute(query: GetAbnormalFuelConsumptionQuery): Promise<AbnormalFuelConsumptionRow[]> {
    return this.fuelRepo.getAbnormalConsumption(query.tenantId, query.threshold);
  }
}
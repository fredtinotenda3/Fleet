//modules/fuel/queries/handlers/get-fueling-frequency-by-vehicle.handler.ts

import { IQueryHandler } from '@/server/cqrs/query';
import { GetFuelingFrequencyByVehicleQuery } from '../get-fueling-frequency-by-vehicle.query';
import { FuelRepository } from '@/modules/fuel/repositories/fuel.repository';
import { FuelFrequencyByVehicleRow } from '@/shared/types/fuel.types';

export class GetFuelingFrequencyByVehicleHandler
  implements IQueryHandler<GetFuelingFrequencyByVehicleQuery, FuelFrequencyByVehicleRow[]>
{
  constructor(private readonly fuelRepo: FuelRepository) {}

  async execute(query: GetFuelingFrequencyByVehicleQuery): Promise<FuelFrequencyByVehicleRow[]> {
    return this.fuelRepo.getFuelingFrequencyByVehicle(query.tenantId, query.dateRange, query.limit);
  }
}
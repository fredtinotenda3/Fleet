// modules/vehicles/queries/handlers/get-vehicle-stats.handler.ts

import { IQueryHandler } from '@/server/cqrs/query';
import { GetVehicleStatsQuery } from '../get-vehicle-stats.query';
import { VehicleRepository } from '@/modules/vehicles/repositories/vehicle.repository';
import { VehicleStats } from '@/shared/types/vehicle.types';

export class GetVehicleStatsHandler
  implements IQueryHandler<GetVehicleStatsQuery, VehicleStats>
{
  constructor(private readonly vehicleRepo: VehicleRepository) {}

  async execute(query: GetVehicleStatsQuery): Promise<VehicleStats> {
    return this.vehicleRepo.getVehicleStats(query.tenantId);
  }
}
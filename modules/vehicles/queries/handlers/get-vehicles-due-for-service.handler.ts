// modules/vehicles/queries/handlers/get-vehicles-due-for-service.handler.ts

import { IQueryHandler } from '@/server/cqrs/query';
import { GetVehiclesDueForServiceQuery } from '../get-vehicles-due-for-service.query';
import { VehicleRepository } from '@/modules/vehicles/repositories/vehicle.repository';
import { Vehicle } from '@/shared/types/vehicle.types';

export class GetVehiclesDueForServiceHandler
  implements IQueryHandler<GetVehiclesDueForServiceQuery, Vehicle[]>
{
  constructor(private readonly vehicleRepo: VehicleRepository) {}

  async execute(query: GetVehiclesDueForServiceQuery): Promise<Vehicle[]> {
    return this.vehicleRepo.getVehiclesDueForService(
      query.mileageThreshold,
      query.tenantId
    );
  }
}
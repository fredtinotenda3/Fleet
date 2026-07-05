// modules/vehicles/queries/handlers/get-vehicle-by-license-plate.handler.ts

import { IQueryHandler } from '@/server/cqrs/query';
import { GetVehicleByLicensePlateQuery } from '../get-vehicle-by-license-plate.query';
import { VehicleRepository } from '@/modules/vehicles/repositories/vehicle.repository';
import { Vehicle } from '@/shared/types/vehicle.types';

export class GetVehicleByLicensePlateHandler
  implements IQueryHandler<GetVehicleByLicensePlateQuery, Vehicle | null>
{
  constructor(private readonly vehicleRepo: VehicleRepository) {}

  async execute(query: GetVehicleByLicensePlateQuery): Promise<Vehicle | null> {
    return this.vehicleRepo.findByLicensePlate(query.licensePlate, query.tenantId);
  }
}
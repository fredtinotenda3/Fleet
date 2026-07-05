// modules/vehicles/queries/handlers/get-vehicles-by-status.handler.ts

import { IQueryHandler } from '@/server/cqrs/query';
import { GetVehiclesByStatusQuery } from '../get-vehicles-by-status.query';
import { VehicleRepository } from '@/modules/vehicles/repositories/vehicle.repository';
import { Vehicle } from '@/shared/types/vehicle.types';
import { AppError } from '@/server/errors/app.errors';

const VALID_STATUSES = ['active', 'inactive', 'maintenance'];

export class GetVehiclesByStatusHandler
  implements IQueryHandler<GetVehiclesByStatusQuery, Vehicle[]>
{
  constructor(private readonly vehicleRepo: VehicleRepository) {}

  async execute(query: GetVehiclesByStatusQuery): Promise<Vehicle[]> {
    if (!VALID_STATUSES.includes(query.status)) {
      throw new AppError('Invalid status filter', 'INVALID_STATUS', 400);
    }
    return this.vehicleRepo.getVehiclesByStatus(query.status, query.tenantId);
  }
}
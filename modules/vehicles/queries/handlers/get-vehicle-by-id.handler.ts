// modules/vehicles/queries/handlers/get-vehicle-by-id.handler.ts

import { IQueryHandler } from '@/server/cqrs/query';
import { GetVehicleByIdQuery } from '../get-vehicle-by-id.query';
import { VehicleRepository } from '@/modules/vehicles/repositories/vehicle.repository';
import { Vehicle } from '@/shared/types/vehicle.types';
import { NotFoundError } from '@/server/errors/app.errors';

function isSuperAdminTenant(tenantId: string): boolean {
  return (
    tenantId === 'default' || tenantId === 'system' || tenantId === 'super_admin'
  );
}

export class GetVehicleByIdHandler
  implements IQueryHandler<GetVehicleByIdQuery, Vehicle>
{
  constructor(private readonly vehicleRepo: VehicleRepository) {}

  async execute(query: GetVehicleByIdQuery): Promise<Vehicle> {
    const vehicle = await this.vehicleRepo.findById(
      query.vehicleId,
      query.tenantId,
      false,
      isSuperAdminTenant(query.tenantId)
    );
    if (!vehicle) {
      throw new NotFoundError('Vehicle not found');
    }
    return vehicle;
  }
}
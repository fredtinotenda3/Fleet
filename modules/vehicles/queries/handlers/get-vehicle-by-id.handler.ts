import { resolveTenantScope } from '@/server/tenancy/tenant-scope';
// modules/vehicles/queries/handlers/get-vehicle-by-id.handler.ts

import { IQueryHandler } from '@/server/cqrs/query';
import { GetVehicleByIdQuery } from '../get-vehicle-by-id.query';
import { VehicleRepository } from '@/modules/vehicles/repositories/vehicle.repository';
import { Vehicle } from '@/shared/types/vehicle.types';
import { NotFoundError } from '@/server/errors/app.errors';

// Sentinel logic moved to server/tenancy/tenant-scope.ts (fail-closed).

export class GetVehicleByIdHandler
  implements IQueryHandler<GetVehicleByIdQuery, Vehicle>
{
  constructor(private readonly vehicleRepo: VehicleRepository) {}

  async execute(query: GetVehicleByIdQuery): Promise<Vehicle> {
    const vehicle = await this.vehicleRepo.findById(
      query.vehicleId,
      query.tenantId,
      false,
      resolveTenantScope(query.tenantId).kind === 'platform'
    );
    if (!vehicle) {
      throw new NotFoundError('Vehicle not found');
    }
    return vehicle;
  }
}
// modules/trips/queries/handlers/get-vehicle-utilization.handler.ts

import { IQueryHandler } from '@/server/cqrs/query';
import { GetVehicleUtilizationQuery } from '../get-vehicle-utilization.query';
import { TripRepository } from '@/modules/trips/repositories/trip.repository';
import { VehicleUtilizationRow } from '@/shared/types/trip.types';

export class GetVehicleUtilizationHandler
  implements IQueryHandler<GetVehicleUtilizationQuery, VehicleUtilizationRow[]>
{
  constructor(private readonly tripRepo: TripRepository) {}

  async execute(query: GetVehicleUtilizationQuery): Promise<VehicleUtilizationRow[]> {
    return this.tripRepo.getVehicleUtilization(
      query.tenantId,
      query.dateRange,
      query.limit,
      query.sortBy
    );
  }
}
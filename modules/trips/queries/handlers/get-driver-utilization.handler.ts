// modules/trips/queries/handlers/get-driver-utilization.handler.ts

import { IQueryHandler } from '@/server/cqrs/query';
import { GetDriverUtilizationQuery } from '../get-driver-utilization.query';
import { TripRepository } from '@/modules/trips/repositories/trip.repository';
import { DriverUtilizationRow } from '@/shared/types/trip.types';

export class GetDriverUtilizationHandler
  implements IQueryHandler<GetDriverUtilizationQuery, DriverUtilizationRow[]>
{
  constructor(private readonly tripRepo: TripRepository) {}

  async execute(query: GetDriverUtilizationQuery): Promise<DriverUtilizationRow[]> {
    return this.tripRepo.getDriverUtilization(
      query.tenantId,
      query.dateRange,
      query.limit,
      query.sortBy,
      query.licensePlate
    );
  }
}
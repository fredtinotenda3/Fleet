// modules/vehicles/queries/handlers/get-vehicle-analytics.handler.ts

import { Document } from 'mongodb';
import { IQueryHandler } from '@/server/cqrs/query';
import { GetVehicleAnalyticsQuery } from '../get-vehicle-analytics.query';
import { VehicleRepository } from '@/modules/vehicles/repositories/vehicle.repository';

export class GetVehicleAnalyticsHandler
  implements IQueryHandler<GetVehicleAnalyticsQuery, Document[]>
{
  constructor(private readonly vehicleRepo: VehicleRepository) {}

  async execute(query: GetVehicleAnalyticsQuery): Promise<Document[]> {
    return this.vehicleRepo.getVehicleAnalytics(
      query.tenantId,
      query.startDate,
      query.endDate
    );
  }
}
//modules/fuel/queries/handlers/get-vehicle-fuel-timeline.handler.ts

import { IQueryHandler } from '@/server/cqrs/query';
import { GetVehicleFuelTimelineQuery } from '../get-vehicle-fuel-timeline.query';
import { FuelRepository } from '@/modules/fuel/repositories/fuel.repository';
import { VehicleFuelTimelinePoint } from '@/shared/types/fuel.types';

export class GetVehicleFuelTimelineHandler
  implements IQueryHandler<GetVehicleFuelTimelineQuery, VehicleFuelTimelinePoint[]>
{
  constructor(private readonly fuelRepo: FuelRepository) {}

  async execute(query: GetVehicleFuelTimelineQuery): Promise<VehicleFuelTimelinePoint[]> {
    return this.fuelRepo.getVehicleFuelTimeline(query.tenantId, query.filters);
  }
}
//modules/fuel/queries/handlers/get-fuel-entry-heatmap.handler.ts

import { IQueryHandler } from '@/server/cqrs/query';
import { GetFuelEntryHeatmapQuery } from '../get-fuel-entry-heatmap.query';
import { FuelRepository } from '@/modules/fuel/repositories/fuel.repository';
import { FuelHeatmapCell } from '@/shared/types/fuel.types';

export class GetFuelEntryHeatmapHandler
  implements IQueryHandler<GetFuelEntryHeatmapQuery, FuelHeatmapCell[]>
{
  constructor(private readonly fuelRepo: FuelRepository) {}

  async execute(query: GetFuelEntryHeatmapQuery): Promise<FuelHeatmapCell[]> {
    return this.fuelRepo.getFuelEntryHeatmap(query.tenantId, query.dateRange);
  }
}
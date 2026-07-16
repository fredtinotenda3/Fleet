//modules/fuel/queries/handlers/get-fuel-by-station.handler.ts

import { IQueryHandler } from '@/server/cqrs/query';
import { GetFuelByStationQuery } from '../get-fuel-by-station.query';
import { FuelRepository } from '@/modules/fuel/repositories/fuel.repository';
import { FuelByStationRow } from '@/shared/types/fuel.types';

export class GetFuelByStationHandler implements IQueryHandler<GetFuelByStationQuery, FuelByStationRow[]> {
  constructor(private readonly fuelRepo: FuelRepository) {}

  async execute(query: GetFuelByStationQuery): Promise<FuelByStationRow[]> {
    return this.fuelRepo.getFuelByStation(query.tenantId, query.dateRange, query.limit);
  }
}
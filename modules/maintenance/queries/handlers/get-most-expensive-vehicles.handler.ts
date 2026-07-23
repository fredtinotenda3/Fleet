//modules/maintenance/queries/handlers/get-most-expensive-vehicles.handler.ts

import { IQueryHandler } from '@/server/cqrs/query';
import { GetMostExpensiveVehiclesQuery } from '../get-most-expensive-vehicles.query';
import { MaintenanceRepository } from '@/modules/maintenance/repositories/maintenance.repository';
import { MostExpensiveVehicleRow } from '@/shared/types/maintenance.types';

export class GetMostExpensiveVehiclesHandler
  implements IQueryHandler<GetMostExpensiveVehiclesQuery, MostExpensiveVehicleRow[]>
{
  constructor(private readonly maintenanceRepo: MaintenanceRepository) {}

  async execute(query: GetMostExpensiveVehiclesQuery): Promise<MostExpensiveVehicleRow[]> {
    return this.maintenanceRepo.getMostExpensiveVehicles(query.tenantId, query.limit);
  }
}
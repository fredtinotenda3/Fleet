// modules/maintenance/queries/handlers/get-vehicle-maintenance-insights.handler.ts

import { IQueryHandler } from '@/server/cqrs/query';
import { GetVehicleMaintenanceInsightsQuery } from '../get-vehicle-maintenance-insights.query';
import { MaintenanceRepository } from '@/modules/maintenance/repositories/maintenance.repository';
import { VehicleMaintenanceInsights } from '@/shared/types/maintenance.types';

export class GetVehicleMaintenanceInsightsHandler
  implements IQueryHandler<GetVehicleMaintenanceInsightsQuery, VehicleMaintenanceInsights>
{
  constructor(private readonly maintenanceRepo: MaintenanceRepository) {}

  async execute(query: GetVehicleMaintenanceInsightsQuery): Promise<VehicleMaintenanceInsights> {
    return this.maintenanceRepo.getVehicleMaintenanceInsights(query.tenantId, query.licensePlate);
  }
}

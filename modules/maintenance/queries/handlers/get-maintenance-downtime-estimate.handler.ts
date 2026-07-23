//modules/maintenance/queries/handlers/get-maintenance-downtime-estimate.handler.ts

import { IQueryHandler } from '@/server/cqrs/query';
import { GetMaintenanceDowntimeEstimateQuery } from '../get-maintenance-downtime-estimate.query';
import { MaintenanceRepository } from '@/modules/maintenance/repositories/maintenance.repository';
import { DowntimeEstimatePoint } from '@/shared/types/maintenance.types';

export class GetMaintenanceDowntimeEstimateHandler
  implements IQueryHandler<GetMaintenanceDowntimeEstimateQuery, DowntimeEstimatePoint[]>
{
  constructor(private readonly maintenanceRepo: MaintenanceRepository) {}

  async execute(query: GetMaintenanceDowntimeEstimateQuery): Promise<DowntimeEstimatePoint[]> {
    return this.maintenanceRepo.getDowntimeEstimate(query.tenantId, query.limit);
  }
}
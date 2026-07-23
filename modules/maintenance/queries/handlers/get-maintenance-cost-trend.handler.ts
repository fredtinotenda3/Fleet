//modules/maintenance/queries/handlers/get-maintenance-cost-trend.handler.ts

import { IQueryHandler } from '@/server/cqrs/query';
import { GetMaintenanceCostTrendQuery } from '../get-maintenance-cost-trend.query';
import { MaintenanceRepository } from '@/modules/maintenance/repositories/maintenance.repository';
import { MaintenanceCostTrendPoint } from '@/shared/types/maintenance.types';

export class GetMaintenanceCostTrendHandler
  implements IQueryHandler<GetMaintenanceCostTrendQuery, MaintenanceCostTrendPoint[]>
{
  constructor(private readonly maintenanceRepo: MaintenanceRepository) {}

  async execute(query: GetMaintenanceCostTrendQuery): Promise<MaintenanceCostTrendPoint[]> {
    return this.maintenanceRepo.getCostTrend(query.tenantId, query.months);
  }
}
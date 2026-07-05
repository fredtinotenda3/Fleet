// modules/maintenance/queries/handlers/get-maintenance-stats.handler.ts

import { IQueryHandler } from '@/server/cqrs/query';
import { GetMaintenanceStatsQuery } from '../get-maintenance-stats.query';
import { MaintenanceRepository } from '@/modules/maintenance/repositories/maintenance.repository';
import { MaintenanceStats } from '@/shared/types/maintenance.types';

export class GetMaintenanceStatsHandler
  implements IQueryHandler<GetMaintenanceStatsQuery, MaintenanceStats>
{
  constructor(private readonly maintenanceRepo: MaintenanceRepository) {}

  async execute(query: GetMaintenanceStatsQuery): Promise<MaintenanceStats> {
    return this.maintenanceRepo.getMaintenanceStats(query.tenantId);
  }
}
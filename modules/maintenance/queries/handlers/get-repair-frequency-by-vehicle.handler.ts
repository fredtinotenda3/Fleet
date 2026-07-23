//modules/maintenance/queries/handlers/get-repair-frequency-by-vehicle.handler.ts

import { IQueryHandler } from '@/server/cqrs/query';
import { GetRepairFrequencyByVehicleQuery } from '../get-repair-frequency-by-vehicle.query';
import { MaintenanceRepository } from '@/modules/maintenance/repositories/maintenance.repository';
import { RepairFrequencyByVehicleRow } from '@/shared/types/maintenance.types';

export class GetRepairFrequencyByVehicleHandler
  implements IQueryHandler<GetRepairFrequencyByVehicleQuery, RepairFrequencyByVehicleRow[]>
{
  constructor(private readonly maintenanceRepo: MaintenanceRepository) {}

  async execute(query: GetRepairFrequencyByVehicleQuery): Promise<RepairFrequencyByVehicleRow[]> {
    return this.maintenanceRepo.getRepairFrequencyByVehicle(query.tenantId, query.limit);
  }
}
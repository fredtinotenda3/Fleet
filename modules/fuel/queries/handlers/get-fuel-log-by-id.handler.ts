// modules/fuel/queries/handlers/get-fuel-log-by-id.handler.ts

import { IQueryHandler } from '@/server/cqrs/query';
import { GetFuelLogByIdQuery } from '../get-fuel-log-by-id.query';
import { FuelRepository } from '@/modules/fuel/repositories/fuel.repository';
import { FuelLog } from '@/shared/types/fuel.types';
import { NotFoundError } from '@/server/errors/app.errors';

export class GetFuelLogByIdHandler
  implements IQueryHandler<GetFuelLogByIdQuery, FuelLog>
{
  constructor(private readonly fuelRepo: FuelRepository) {}

  async execute(query: GetFuelLogByIdQuery): Promise<FuelLog> {
    const log = await this.fuelRepo.findById(query.fuelLogId, query.tenantId);
    if (!log) {
      throw new NotFoundError('Fuel log not found');
    }
    return log;
  }
}
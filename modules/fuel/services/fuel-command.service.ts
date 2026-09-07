// modules/fuel/services/fuel-command.service.ts

import { commandBus } from '@/server/cqrs/command-bus';
import { CreateFuelLogCommand } from '../commands/create-fuel-log.command';
import { UpdateFuelLogCommand } from '../commands/update-fuel-log.command';
import { DeleteFuelLogCommand } from '../commands/delete-fuel-log.command';
import { FuelLog } from '@/shared/types/fuel.types';
import { WriteScope, tenantIdOf } from '@/server/tenancy/write-scope';

export class FuelCommandService {
  /**
   * `scope` replaces the former `tenantId` parameter rather than joining
   * it: the tenant is derivable from the scope (tenantIdOf), and keeping
   * both would let a caller pass a tenantId that disagrees with the
   * scope's own -- a contradiction the handler would have to arbitrate.
   */
  async createFuelLog(
    rawData: unknown,
    scope: WriteScope,
    userId?: string
  ): Promise<FuelLog> {
    return commandBus.execute<FuelLog>(
      new CreateFuelLogCommand(rawData, tenantIdOf(scope), scope, userId)
    );
  }

  async updateFuelLog(
    fuelLogId: string,
    rawData: unknown,
    scope: WriteScope,
    userId?: string
  ): Promise<FuelLog> {
    return commandBus.execute<FuelLog>(
      new UpdateFuelLogCommand(fuelLogId, rawData, tenantIdOf(scope), scope, userId)
    );
  }

  async deleteFuelLog(
    fuelLogId: string,
    tenantId: string,
    userId?: string,
    soft: boolean = false
  ): Promise<void> {
    return commandBus.execute<void>(
      new DeleteFuelLogCommand(fuelLogId, tenantId, userId, soft)
    );
  }
}

export const fuelCommandService = new FuelCommandService();
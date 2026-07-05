// modules/fuel/services/fuel-command.service.ts

import { commandBus } from '@/server/cqrs/command-bus';
import { CreateFuelLogCommand } from '../commands/create-fuel-log.command';
import { UpdateFuelLogCommand } from '../commands/update-fuel-log.command';
import { DeleteFuelLogCommand } from '../commands/delete-fuel-log.command';
import { FuelLog } from '@/shared/types/fuel.types';

export class FuelCommandService {
  async createFuelLog(
    rawData: unknown,
    tenantId: string,
    userId?: string
  ): Promise<FuelLog> {
    return commandBus.execute<FuelLog>(
      new CreateFuelLogCommand(rawData, tenantId, userId)
    );
  }

  async updateFuelLog(
    fuelLogId: string,
    rawData: unknown,
    tenantId: string,
    userId?: string
  ): Promise<FuelLog> {
    return commandBus.execute<FuelLog>(
      new UpdateFuelLogCommand(fuelLogId, rawData, tenantId, userId)
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
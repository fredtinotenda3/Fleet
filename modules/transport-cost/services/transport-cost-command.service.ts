// modules/transport-cost/services/transport-cost-command.service.ts

import { commandBus } from '@/server/cqrs/command-bus';
import {
  ImportTransportCostCommand,
  TransportCostImportRow,
} from '../commands/import-transport-cost.command';
import type { ImportTransportCostResult } from '../commands/handlers/import-transport-cost.handler';
import { TransportCostSheetFamily } from '@/shared/types/transport-cost.types';
import { WriteScope, tenantIdOf } from '@/server/tenancy/write-scope';

export class TransportCostCommandService {
  /**
   * `scope` replaces a bare tenantId parameter (mirrors
   * ExpenseCommandService.importExpenses) so a caller cannot pass a
   * tenantId that contradicts the scope it is actually acting under.
   */
  async importTransportCost(
    sheetFamily: TransportCostSheetFamily,
    rows: TransportCostImportRow[],
    scope: WriteScope,
    sourceFileName: string,
    userId?: string
  ): Promise<ImportTransportCostResult> {
    return commandBus.execute<ImportTransportCostResult>(
      new ImportTransportCostCommand(sheetFamily, rows, tenantIdOf(scope), scope, sourceFileName, userId)
    );
  }
}

export const transportCostCommandService = new TransportCostCommandService();

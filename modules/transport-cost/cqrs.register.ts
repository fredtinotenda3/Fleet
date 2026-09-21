// modules/transport-cost/cqrs.register.ts

import { CommandBus } from '@/server/cqrs/command-bus';
import { QueryBus } from '@/server/cqrs/query-bus';
import { transportCostSourceRecordRepository } from './repositories/transport-cost-source-record.repository';

import { ImportTransportCostCommand } from './commands/import-transport-cost.command';
import { ImportTransportCostHandler } from './commands/handlers/import-transport-cost.handler';

import { GetTransportCostSourceRecordsQuery } from './queries/get-transport-cost-source-records.query';
import { GetTransportCostSourceRecordsHandler } from './queries/handlers/get-transport-cost-source-records.handler';

export function registerTransportCostCqrsHandlers(commandBus: CommandBus, queryBus: QueryBus): void {
  commandBus.register(
    ImportTransportCostCommand,
    new ImportTransportCostHandler(transportCostSourceRecordRepository)
  );

  queryBus.register(
    GetTransportCostSourceRecordsQuery,
    new GetTransportCostSourceRecordsHandler(transportCostSourceRecordRepository)
  );
}

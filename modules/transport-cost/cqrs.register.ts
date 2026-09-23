// modules/transport-cost/cqrs.register.ts

import { CommandBus } from '@/server/cqrs/command-bus';
import { QueryBus } from '@/server/cqrs/query-bus';
import { transportCostSourceRecordRepository } from './repositories/transport-cost-source-record.repository';
import { transportPartnerRepository } from './repositories/transport-partner.repository';
import { contractedVehicleRepository } from './repositories/contracted-vehicle.repository';
import { normalizationReviewRepository } from './repositories/normalization-review.repository';

import { ImportTransportCostCommand } from './commands/import-transport-cost.command';
import { ImportTransportCostHandler } from './commands/handlers/import-transport-cost.handler';

import { GetTransportCostSourceRecordsQuery } from './queries/get-transport-cost-source-records.query';
import { GetTransportCostSourceRecordsHandler } from './queries/handlers/get-transport-cost-source-records.handler';

// Phase O2: normalization review queue.
import { ConfirmReviewMatchCommand } from './commands/confirm-review-match.command';
import { ConfirmReviewMatchHandler } from './commands/handlers/confirm-review-match.handler';
import { ConfirmReviewNewCommand } from './commands/confirm-review-new.command';
import { ConfirmReviewNewHandler } from './commands/handlers/confirm-review-new.handler';
import { RejectReviewItemCommand } from './commands/reject-review-item.command';
import { RejectReviewItemHandler } from './commands/handlers/reject-review-item.handler';
import { ListNormalizationReviewQueueQuery } from './queries/list-normalization-review-queue.query';
import { ListNormalizationReviewQueueHandler } from './queries/handlers/list-normalization-review-queue.handler';

export function registerTransportCostCqrsHandlers(commandBus: CommandBus, queryBus: QueryBus): void {
  commandBus.register(
    ImportTransportCostCommand,
    new ImportTransportCostHandler(transportCostSourceRecordRepository)
  );

  queryBus.register(
    GetTransportCostSourceRecordsQuery,
    new GetTransportCostSourceRecordsHandler(transportCostSourceRecordRepository)
  );

  commandBus.register(
    ConfirmReviewMatchCommand,
    new ConfirmReviewMatchHandler(
      normalizationReviewRepository,
      transportPartnerRepository,
      contractedVehicleRepository,
      transportCostSourceRecordRepository
    )
  );
  commandBus.register(
    ConfirmReviewNewCommand,
    new ConfirmReviewNewHandler(
      normalizationReviewRepository,
      transportPartnerRepository,
      contractedVehicleRepository,
      transportCostSourceRecordRepository
    )
  );
  commandBus.register(RejectReviewItemCommand, new RejectReviewItemHandler(normalizationReviewRepository));

  queryBus.register(
    ListNormalizationReviewQueueQuery,
    new ListNormalizationReviewQueueHandler(normalizationReviewRepository)
  );
}

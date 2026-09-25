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

// GAP-CLOSURE PASS, Objectives 1/3/5: "add new master data" +
// "confirm/reject pending master data" (a second, non-import-derived
// creation/review path alongside the O2 queue above -- see
// request-new-transporter.command.ts for the full decision record).
import { RequestNewTransporterCommand } from './commands/request-new-transporter.command';
import { RequestNewTransporterHandler } from './commands/handlers/request-new-transporter.handler';
import { RequestNewVehicleCommand } from './commands/request-new-vehicle.command';
import { RequestNewVehicleHandler } from './commands/handlers/request-new-vehicle.handler';
import { ConfirmPendingMasterDataCommand } from './commands/confirm-pending-master-data.command';
import { ConfirmPendingMasterDataHandler } from './commands/handlers/confirm-pending-master-data.handler';
import { RejectPendingMasterDataCommand } from './commands/reject-pending-master-data.command';
import { RejectPendingMasterDataHandler } from './commands/handlers/reject-pending-master-data.handler';
import { ListPendingMasterDataQuery } from './queries/list-pending-master-data.query';
import { ListPendingMasterDataHandler } from './queries/handlers/list-pending-master-data.handler';

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

  // GAP-CLOSURE PASS, Objectives 1/3/5.
  commandBus.register(RequestNewTransporterCommand, new RequestNewTransporterHandler(transportPartnerRepository));
  commandBus.register(
    RequestNewVehicleCommand,
    new RequestNewVehicleHandler(contractedVehicleRepository, transportPartnerRepository)
  );
  commandBus.register(
    ConfirmPendingMasterDataCommand,
    new ConfirmPendingMasterDataHandler(transportPartnerRepository, contractedVehicleRepository)
  );
  commandBus.register(
    RejectPendingMasterDataCommand,
    new RejectPendingMasterDataHandler(transportPartnerRepository, contractedVehicleRepository)
  );
  queryBus.register(
    ListPendingMasterDataQuery,
    new ListPendingMasterDataHandler(transportPartnerRepository, contractedVehicleRepository)
  );
}

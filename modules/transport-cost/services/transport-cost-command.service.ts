// modules/transport-cost/services/transport-cost-command.service.ts

import { commandBus } from '@/server/cqrs/command-bus';
import {
  ImportTransportCostCommand,
  TransportCostImportRow,
} from '../commands/import-transport-cost.command';
import type { ImportTransportCostResult } from '../commands/handlers/import-transport-cost.handler';
import { TransportCostSheetFamily } from '@/shared/types/transport-cost.types';
import { WriteScope, tenantIdOf } from '@/server/tenancy/write-scope';

import { ConfirmReviewMatchCommand } from '../commands/confirm-review-match.command';
import type { ConfirmReviewMatchResult } from '../commands/handlers/confirm-review-match.handler';
import { ConfirmReviewNewCommand } from '../commands/confirm-review-new.command';
import type { ConfirmReviewNewResult } from '../commands/handlers/confirm-review-new.handler';
import { RejectReviewItemCommand } from '../commands/reject-review-item.command';
import { NormalizationReviewItem, NormalizationKind } from '@/shared/types/normalization-review.types';
import { BusinessStream } from '@/shared/types/contracted-vehicle.types';

// GAP-CLOSURE PASS, Objectives 1/3/5.
import { RequestNewTransporterCommand } from '../commands/request-new-transporter.command';
import type { RequestNewTransporterResult } from '../commands/handlers/request-new-transporter.handler';
import { RequestNewVehicleCommand } from '../commands/request-new-vehicle.command';
import type { RequestNewVehicleResult } from '../commands/handlers/request-new-vehicle.handler';
import { ConfirmPendingMasterDataCommand } from '../commands/confirm-pending-master-data.command';
import type { ConfirmPendingMasterDataResult } from '../commands/handlers/confirm-pending-master-data.handler';
import { RejectPendingMasterDataCommand } from '../commands/reject-pending-master-data.command';
import type { RejectPendingMasterDataResult } from '../commands/handlers/reject-pending-master-data.handler';

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
    userId?: string,
    /** Required, "YYYY-MM", when sheetFamily === 'vansales' -- see
     *  ImportTransportCostCommand's own doc comment. */
    periodMonth?: string
  ): Promise<ImportTransportCostResult> {
    return commandBus.execute<ImportTransportCostResult>(
      new ImportTransportCostCommand(sheetFamily, rows, tenantIdOf(scope), scope, sourceFileName, userId, periodMonth)
    );
  }

  /** Phase O2. */
  async confirmReviewMatch(
    reviewItemId: string,
    resolvedEntityId: string,
    tenantId: string,
    userId: string
  ): Promise<ConfirmReviewMatchResult> {
    return commandBus.execute<ConfirmReviewMatchResult>(
      new ConfirmReviewMatchCommand(reviewItemId, resolvedEntityId, tenantId, userId)
    );
  }

  async confirmReviewNew(
    reviewItemId: string,
    tenantId: string,
    userId: string,
    transporterPartnerId?: string,
    businessStream?: BusinessStream
  ): Promise<ConfirmReviewNewResult> {
    return commandBus.execute<ConfirmReviewNewResult>(
      new ConfirmReviewNewCommand(reviewItemId, tenantId, userId, transporterPartnerId, businessStream)
    );
  }

  async rejectReviewItem(
    reviewItemId: string,
    tenantId: string,
    userId: string,
    reason: string
  ): Promise<NormalizationReviewItem> {
    return commandBus.execute<NormalizationReviewItem>(
      new RejectReviewItemCommand(reviewItemId, tenantId, userId, reason)
    );
  }

  // ── GAP-CLOSURE PASS, Objectives 1/3/5 ──────────────────────────────

  async requestNewTransporter(
    rawName: string,
    tenantId: string,
    userId: string
  ): Promise<RequestNewTransporterResult> {
    return commandBus.execute<RequestNewTransporterResult>(
      new RequestNewTransporterCommand(rawName, tenantId, userId)
    );
  }

  async requestNewVehicle(
    rawRegistration: string,
    transporterPartnerId: string,
    tenantId: string,
    userId: string,
    businessStream?: BusinessStream,
    sourceRecordId?: string
  ): Promise<RequestNewVehicleResult> {
    return commandBus.execute<RequestNewVehicleResult>(
      new RequestNewVehicleCommand(rawRegistration, transporterPartnerId, tenantId, userId, businessStream, sourceRecordId)
    );
  }

  async confirmPendingMasterData(
    kind: NormalizationKind,
    id: string,
    tenantId: string,
    userId: string
  ): Promise<ConfirmPendingMasterDataResult> {
    return commandBus.execute<ConfirmPendingMasterDataResult>(
      new ConfirmPendingMasterDataCommand(kind, id, tenantId, userId)
    );
  }

  async rejectPendingMasterData(
    kind: NormalizationKind,
    id: string,
    tenantId: string,
    userId: string,
    reason: string
  ): Promise<RejectPendingMasterDataResult> {
    return commandBus.execute<RejectPendingMasterDataResult>(
      new RejectPendingMasterDataCommand(kind, id, tenantId, userId, reason)
    );
  }
}

export const transportCostCommandService = new TransportCostCommandService();

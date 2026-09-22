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
import { NormalizationReviewItem } from '@/shared/types/normalization-review.types';
import { BusinessStream } from '@/shared/types/contracted-vehicle.types';

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
}

export const transportCostCommandService = new TransportCostCommandService();

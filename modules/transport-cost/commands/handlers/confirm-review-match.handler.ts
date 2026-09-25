// modules/transport-cost/commands/handlers/confirm-review-match.handler.ts

import { ICommandHandler } from '@/server/cqrs/command';
import { ConfirmReviewMatchCommand } from '../confirm-review-match.command';
import { NormalizationReviewRepository } from '@/modules/transport-cost/repositories/normalization-review.repository';
import { TransportPartnerRepository } from '@/modules/transport-cost/repositories/transport-partner.repository';
import { ContractedVehicleRepository } from '@/modules/transport-cost/repositories/contracted-vehicle.repository';
import { TransportCostSourceRecordRepository } from '@/modules/transport-cost/repositories/transport-cost-source-record.repository';
import { NotFoundError, ConflictError } from '@/server/errors/app.errors';
import { NormalizationReviewItem } from '@/shared/types/normalization-review.types';
import { auditLog } from '@/infrastructure/monitoring/audit.logger';

/** GAP-CLOSURE PASS, Objective 3: "Record the decision in the existing audit trail." Shared by this handler and its confirm-new/reject siblings so all three review decisions are filed under the same entityType/queryable shape. */
export const NORMALIZATION_REVIEW_ENTITY_TYPE = 'transport_cost_normalization_review';

export interface ConfirmReviewMatchResult {
  reviewItem: NormalizationReviewItem;
  sourceRecordsUpdated: number;
}

export class ConfirmReviewMatchHandler
  implements ICommandHandler<ConfirmReviewMatchCommand, ConfirmReviewMatchResult>
{
  constructor(
    private readonly reviewRepo: NormalizationReviewRepository,
    private readonly partnerRepo: TransportPartnerRepository,
    private readonly vehicleRepo: ContractedVehicleRepository,
    private readonly sourceRecordRepo: TransportCostSourceRecordRepository
  ) {}

  async execute(command: ConfirmReviewMatchCommand): Promise<ConfirmReviewMatchResult> {
    const item = await this.reviewRepo.findById(command.reviewItemId, command.tenantId);
    if (!item) {
      throw new NotFoundError('Review item not found');
    }
    if (item.status !== 'pending') {
      // Append-adjacent discipline, not the ledger's own append-only
      // rule, but the same reasoning: a review decision, once made, is
      // not silently re-made by a second confirm call racing the
      // first. The reviewer sees a 409 and reloads the (now resolved)
      // item instead of the queue quietly double-processing it.
      throw new ConflictError(`Review item is already ${item.status}, not pending`);
    }

    let sourceRecordsUpdated: number;

    if (item.kind === 'transporter') {
      const partner = await this.partnerRepo.findById(command.resolvedEntityId, command.tenantId);
      if (!partner) throw new NotFoundError('Target transporter partner not found');
      if (partner.mergedIntoPartnerId) {
        throw new ConflictError(
          'This partner has been merged into another -- resolve against the surviving partner instead'
        );
      }

      await this.partnerRepo.addAlias(partner._id!, item.rawValue, command.tenantId);
      sourceRecordsUpdated = await this.sourceRecordRepo.bulkSetTransporterPartner(
        item.sourceRecordIds,
        partner._id!,
        command.tenantId
      );
    } else {
      const vehicle = await this.vehicleRepo.findById(command.resolvedEntityId, command.tenantId);
      if (!vehicle) throw new NotFoundError('Target contracted vehicle not found');

      sourceRecordsUpdated = await this.sourceRecordRepo.bulkSetContractedVehicle(
        item.sourceRecordIds,
        vehicle._id!,
        command.tenantId
      );
    }

    const updated = await this.reviewRepo.update(
      command.reviewItemId,
      {
        status: 'confirmed-match',
        resolvedEntityId: command.resolvedEntityId,
        resolvedBy: command.userId,
        resolvedAt: new Date(),
      },
      command.tenantId,
      command.userId
    );

    await auditLog.logUpdate(command.userId, command.tenantId, NORMALIZATION_REVIEW_ENTITY_TYPE, command.reviewItemId, item, {
      status: 'confirmed-match',
      resolvedEntityId: command.resolvedEntityId,
      wasAlternativeSelection: command.resolvedEntityId !== item.candidateEntityId,
      sourceRecordsUpdated,
    });

    return { reviewItem: updated!, sourceRecordsUpdated };
  }
}

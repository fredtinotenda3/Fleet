// modules/transport-cost/commands/handlers/confirm-review-new.handler.ts

import { ICommandHandler } from '@/server/cqrs/command';
import { ConfirmReviewNewCommand } from '../confirm-review-new.command';
import { NormalizationReviewRepository } from '@/modules/transport-cost/repositories/normalization-review.repository';
import { TransportPartnerRepository } from '@/modules/transport-cost/repositories/transport-partner.repository';
import { ContractedVehicleRepository } from '@/modules/transport-cost/repositories/contracted-vehicle.repository';
import { TransportCostSourceRecordRepository } from '@/modules/transport-cost/repositories/transport-cost-source-record.repository';
import { NotFoundError, ConflictError, ValidationError } from '@/server/errors/app.errors';
import { NormalizationReviewItem } from '@/shared/types/normalization-review.types';

export interface ConfirmReviewNewResult {
  reviewItem: NormalizationReviewItem;
  createdEntityId: string;
  sourceRecordsUpdated: number;
}

export class ConfirmReviewNewHandler
  implements ICommandHandler<ConfirmReviewNewCommand, ConfirmReviewNewResult>
{
  constructor(
    private readonly reviewRepo: NormalizationReviewRepository,
    private readonly partnerRepo: TransportPartnerRepository,
    private readonly vehicleRepo: ContractedVehicleRepository,
    private readonly sourceRecordRepo: TransportCostSourceRecordRepository
  ) {}

  async execute(command: ConfirmReviewNewCommand): Promise<ConfirmReviewNewResult> {
    const item = await this.reviewRepo.findById(command.reviewItemId, command.tenantId);
    if (!item) {
      throw new NotFoundError('Review item not found');
    }
    if (item.status !== 'pending') {
      throw new ConflictError(`Review item is already ${item.status}, not pending`);
    }

    let createdEntityId: string;
    let sourceRecordsUpdated: number;

    if (item.kind === 'transporter') {
      const created = await this.partnerRepo.create(
        {
          canonicalName: item.rawValue,
          aliases: [item.rawValue],
          reviewStatus: 'confirmed',
          confirmedBy: command.userId,
          confirmedAt: new Date(),
        },
        command.tenantId,
        command.userId
      );
      createdEntityId = created._id!;
      sourceRecordsUpdated = await this.sourceRecordRepo.bulkSetTransporterPartner(
        item.sourceRecordIds,
        createdEntityId,
        command.tenantId
      );
    } else {
      if (!command.transporterPartnerId) {
        throw new ValidationError(
          'transporterPartnerId is required to confirm a new contracted vehicle -- a vehicle cannot exist without a transporter'
        );
      }
      const transporter = await this.partnerRepo.findById(command.transporterPartnerId, command.tenantId);
      if (!transporter) throw new NotFoundError('transporterPartnerId does not resolve to an existing transporter');

      const created = await this.vehicleRepo.create(
        {
          registration: item.rawValue,
          registrationRaw: item.rawValue,
          transporterPartnerId: command.transporterPartnerId,
          businessStream: command.businessStream,
          isMultiPlate: item.isMultiPlate ?? false,
          plateComponents: item.plateComponents,
          reviewStatus: 'confirmed',
          confirmedBy: command.userId,
          confirmedAt: new Date(),
          firstSeenSourceRecordId: item.sourceRecordIds[0],
        },
        command.tenantId,
        command.userId
      );
      createdEntityId = created._id!;
      sourceRecordsUpdated = await this.sourceRecordRepo.bulkSetContractedVehicle(
        item.sourceRecordIds,
        createdEntityId,
        command.tenantId
      );
    }

    const updated = await this.reviewRepo.update(
      command.reviewItemId,
      {
        status: 'confirmed-new',
        resolvedEntityId: createdEntityId,
        resolvedBy: command.userId,
        resolvedAt: new Date(),
      },
      command.tenantId,
      command.userId
    );

    return { reviewItem: updated!, createdEntityId, sourceRecordsUpdated };
  }
}

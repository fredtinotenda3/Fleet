// modules/transport-cost/commands/handlers/confirm-pending-master-data.handler.ts
//
// GAP-CLOSURE PASS, Objectives 1/3/5. See confirm-pending-master-data
// .command.ts for why this exists as its own, separate checkpoint from
// NormalizationReviewItem's confirm-match/confirm-new.

import { ICommandHandler } from '@/server/cqrs/command';
import { ConfirmPendingMasterDataCommand } from '../confirm-pending-master-data.command';
import { TransportPartnerRepository } from '@/modules/transport-cost/repositories/transport-partner.repository';
import { ContractedVehicleRepository } from '@/modules/transport-cost/repositories/contracted-vehicle.repository';
import { TransportPartner } from '@/shared/types/transport-partner.types';
import { ContractedVehicle } from '@/shared/types/contracted-vehicle.types';
import { NotFoundError, ConflictError } from '@/server/errors/app.errors';
import { auditLog } from '@/infrastructure/monitoring/audit.logger';

export interface ConfirmPendingMasterDataResult {
  record: TransportPartner | ContractedVehicle;
}

export class ConfirmPendingMasterDataHandler
  implements ICommandHandler<ConfirmPendingMasterDataCommand, ConfirmPendingMasterDataResult>
{
  constructor(
    private readonly partnerRepo: TransportPartnerRepository,
    private readonly vehicleRepo: ContractedVehicleRepository
  ) {}

  async execute(command: ConfirmPendingMasterDataCommand): Promise<ConfirmPendingMasterDataResult> {
    if (command.kind === 'transporter') {
      const existing = await this.partnerRepo.findById(command.id, command.tenantId);
      if (!existing) throw new NotFoundError('Transporter not found.');
      if (existing.reviewStatus !== 'needs-review') {
        throw new ConflictError(`This transporter is already "${existing.reviewStatus}", not pending review.`);
      }
      const updated = await this.partnerRepo.update(
        command.id,
        { reviewStatus: 'confirmed', confirmedBy: command.userId, confirmedAt: new Date() },
        command.tenantId,
        command.userId
      );
      if (!updated) throw new NotFoundError('Transporter not found.');
      await auditLog.logUpdate(
        command.userId,
        command.tenantId,
        'transport-cost.transporter-partner',
        command.id,
        existing,
        updated
      );
      return { record: updated };
    }

    const existing = await this.vehicleRepo.findById(command.id, command.tenantId);
    if (!existing) throw new NotFoundError('Vehicle not found.');
    if (existing.reviewStatus !== 'needs-review') {
      throw new ConflictError(`This vehicle is already "${existing.reviewStatus}", not pending review.`);
    }
    const updated = await this.vehicleRepo.update(
      command.id,
      { reviewStatus: 'confirmed', confirmedBy: command.userId, confirmedAt: new Date() },
      command.tenantId,
      command.userId
    );
    if (!updated) throw new NotFoundError('Vehicle not found.');
    await auditLog.logUpdate(
      command.userId,
      command.tenantId,
      'transport-cost.contracted-vehicle',
      command.id,
      existing,
      updated
    );
    return { record: updated };
  }
}

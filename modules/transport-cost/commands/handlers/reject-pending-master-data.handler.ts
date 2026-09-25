// modules/transport-cost/commands/handlers/reject-pending-master-data.handler.ts
//
// GAP-CLOSURE PASS, Objectives 1/3/5. See confirm-pending-master-data
// .command.ts for the full context.
//
// Scope decision, documented rather than silently narrowed: rejecting a
// pending TransportPartner/ContractedVehicle only flips that row's own
// rejected/reviewStatus fields (mirrors RejectReviewItemHandler's own
// scope exactly -- it does not touch NormalizationReviewItem.
// sourceRecordIds either). It deliberately does NOT unlink/re-point any
// TransportCostSourceRecord that already selected this pending identity
// while it was awaiting review -- that would be a much larger, riskier
// operation (silently blanking a field on someone else's operation) and
// is left as an explicit, documented known limitation: a rejected
// identity's already-attributed cost rows keep pointing at the rejected
// row and must be corrected individually (via the existing Slice 5 Edit
// flow) if the rejection means the attribution itself was wrong, not
// just the master-data entry's existence.

import { ICommandHandler } from '@/server/cqrs/command';
import { RejectPendingMasterDataCommand } from '../reject-pending-master-data.command';
import { TransportPartnerRepository } from '@/modules/transport-cost/repositories/transport-partner.repository';
import { ContractedVehicleRepository } from '@/modules/transport-cost/repositories/contracted-vehicle.repository';
import { TransportPartner } from '@/shared/types/transport-partner.types';
import { ContractedVehicle } from '@/shared/types/contracted-vehicle.types';
import { NotFoundError, ConflictError, ValidationError } from '@/server/errors/app.errors';
import { auditLog } from '@/infrastructure/monitoring/audit.logger';

export interface RejectPendingMasterDataResult {
  record: TransportPartner | ContractedVehicle;
}

export class RejectPendingMasterDataHandler
  implements ICommandHandler<RejectPendingMasterDataCommand, RejectPendingMasterDataResult>
{
  constructor(
    private readonly partnerRepo: TransportPartnerRepository,
    private readonly vehicleRepo: ContractedVehicleRepository
  ) {}

  async execute(command: RejectPendingMasterDataCommand): Promise<RejectPendingMasterDataResult> {
    if (!command.reason || !command.reason.trim()) {
      throw new ValidationError('A rejection reason is required.');
    }

    if (command.kind === 'transporter') {
      const existing = await this.partnerRepo.findById(command.id, command.tenantId);
      if (!existing) throw new NotFoundError('Transporter not found.');
      if (existing.reviewStatus !== 'needs-review') {
        throw new ConflictError(`This transporter is already "${existing.reviewStatus}", not pending review.`);
      }
      const updated = await this.partnerRepo.update(
        command.id,
        { rejected: true, rejectedReason: command.reason },
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
      { rejected: true, rejectedReason: command.reason },
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

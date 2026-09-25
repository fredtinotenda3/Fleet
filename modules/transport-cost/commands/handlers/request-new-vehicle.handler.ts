// modules/transport-cost/commands/handlers/request-new-vehicle.handler.ts
//
// GAP-CLOSURE PASS, Objective 5. See request-new-transporter.command.ts
// for the full decision record (identical reasoning applies here).

import { ICommandHandler } from '@/server/cqrs/command';
import { RequestNewVehicleCommand } from '../request-new-vehicle.command';
import { TransportPartnerRepository } from '@/modules/transport-cost/repositories/transport-partner.repository';
import { ContractedVehicleRepository } from '@/modules/transport-cost/repositories/contracted-vehicle.repository';
import { ContractedVehicle } from '@/shared/types/contracted-vehicle.types';
import { NotFoundError, ValidationError, ConflictError } from '@/server/errors/app.errors';
import { normalizeRegistration } from '@/modules/transport-cost/utils/normalization.utils';
import { auditLog } from '@/infrastructure/monitoring/audit.logger';

export interface RequestNewVehicleResult {
  record: ContractedVehicle;
  /** false when an existing row (confirmed OR already-pending) matched this exact normalized registration -- see RequestNewTransporterResult.created for the identical reasoning. */
  created: boolean;
}

export class RequestNewVehicleHandler
  implements ICommandHandler<RequestNewVehicleCommand, RequestNewVehicleResult>
{
  constructor(
    private readonly vehicleRepo: ContractedVehicleRepository,
    private readonly partnerRepo: TransportPartnerRepository
  ) {}

  async execute(command: RequestNewVehicleCommand): Promise<RequestNewVehicleResult> {
    const { normalized, raw } = normalizeRegistration(command.rawRegistration);
    if (!normalized) {
      throw new ValidationError('A vehicle registration is required.');
    }

    // Same requirement ConfirmReviewNewHandler enforces for a
    // vehicle: the transporter must already exist, in scope, and not
    // have been merged away (resolving against a merged row's own id
    // would silently orphan the new vehicle from the surviving
    // partner every other reader now follows -- see
    // TransportPartner.mergedIntoPartnerId's own doc comment).
    const transporter = await this.partnerRepo.findById(command.transporterPartnerId, command.tenantId);
    if (!transporter) {
      throw new NotFoundError('transporterPartnerId does not resolve to an existing transporter.');
    }
    if (transporter.mergedIntoPartnerId) {
      throw new ConflictError(
        `This transporter was merged into another record (${transporter.mergedIntoPartnerId}) -- request the vehicle against that transporter instead.`
      );
    }

    const existing = await this.vehicleRepo.findByRegistration(normalized, command.tenantId);
    if (existing) {
      return { record: existing, created: false };
    }

    const created = await this.vehicleRepo.create(
      {
        registration: normalized,
        registrationRaw: raw,
        transporterPartnerId: command.transporterPartnerId,
        businessStream: command.businessStream,
        isMultiPlate: false,
        reviewStatus: 'needs-review',
        firstSeenSourceRecordId: command.sourceRecordId,
      },
      command.tenantId,
      command.userId
    );

    await auditLog.logCreate(command.userId, command.tenantId, 'transport-cost.contracted-vehicle', created._id!, {
      registration: created.registration,
      transporterPartnerId: created.transporterPartnerId,
      reviewStatus: created.reviewStatus,
      requestedManually: true,
    });

    return { record: created, created: true };
  }
}

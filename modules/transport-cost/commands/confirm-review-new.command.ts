// modules/transport-cost/commands/confirm-review-new.command.ts
//
// Phase O2. A human confirms that a pending NormalizationReviewItem's
// raw value is a genuinely NEW, distinct identity -- not a spelling
// variant of anything already on file. This is the ONLY command that
// creates a TransportPartner or ContractedVehicle row (the central rule
// -- see normalization-review.types.ts).

import { BaseCommand } from '@/server/cqrs/command';
import { BusinessStream } from '@/shared/types/contracted-vehicle.types';

export class ConfirmReviewNewCommand extends BaseCommand {
  static readonly commandName = 'ConfirmReviewNewCommand';

  constructor(
    public readonly reviewItemId: string,
    public readonly tenantId: string,
    public readonly userId: string,
    /**
     * Required when the review item's kind is 'vehicle' --
     * ContractedVehicle.transporterPartnerId is not optional (a
     * contracted vehicle always belongs to some transporter), and a
     * vehicle review item carries no inherent link to one. The
     * reviewing human supplies it as part of confirming the vehicle
     * (their own review UI would resolve the transporter first, or
     * alongside). Ignored for kind: 'transporter'.
     */
    public readonly transporterPartnerId?: string,
    /** Optional for kind: 'vehicle' -- see BusinessStream's own doc comment (not yet read by any report). Ignored for kind: 'transporter'. */
    public readonly businessStream?: BusinessStream
  ) {
    super(ConfirmReviewNewCommand.commandName);
  }
}

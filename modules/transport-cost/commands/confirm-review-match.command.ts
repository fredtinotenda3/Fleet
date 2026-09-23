// modules/transport-cost/commands/confirm-review-match.command.ts
//
// Phase O2. A human confirms that a pending NormalizationReviewItem's
// raw value IS the same identity as an EXISTING TransportPartner/
// ContractedVehicle -- either the suggested candidate, or a different
// one they picked themselves (the candidate is a suggestion, never
// binding -- see normalization-matcher.service.ts's header).

import { BaseCommand } from '@/server/cqrs/command';

export class ConfirmReviewMatchCommand extends BaseCommand {
  static readonly commandName = 'ConfirmReviewMatchCommand';

  constructor(
    public readonly reviewItemId: string,
    /** The TransportPartner/ContractedVehicle._id this raw value resolves to. Need not equal the item's own candidateEntityId. */
    public readonly resolvedEntityId: string,
    public readonly tenantId: string,
    public readonly userId: string
  ) {
    super(ConfirmReviewMatchCommand.commandName);
  }
}

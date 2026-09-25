// modules/transport-cost/commands/confirm-pending-master-data.command.ts
//
// GAP-CLOSURE PASS, Objectives 1/3/5. This is the "second, equally
// real human checkpoint" normalization-review.types.ts's updated header
// refers to: the resolution step for a TransportPartner/ContractedVehicle
// row created with reviewStatus: 'needs-review' by
// request-new-transporter.handler.ts / request-new-vehicle.handler.ts
// (a manually-requested identity, not an import-derived one -- those
// still resolve exclusively through NormalizationReviewItem, untouched).
//
// Deliberately a single command/handler for both kinds (mirrors
// NormalizationReviewItem's own "ONE collection shared by both kinds"
// reasoning) rather than two near-identical files.

import { BaseCommand } from '@/server/cqrs/command';
import { NormalizationKind } from '@/shared/types/normalization-review.types';

export class ConfirmPendingMasterDataCommand extends BaseCommand {
  static readonly commandName = 'ConfirmPendingMasterDataCommand';

  constructor(
    public readonly kind: NormalizationKind,
    public readonly id: string,
    public readonly tenantId: string,
    public readonly userId: string
  ) {
    super(ConfirmPendingMasterDataCommand.commandName);
  }
}

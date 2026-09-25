// modules/transport-cost/commands/reject-pending-master-data.command.ts
//
// GAP-CLOSURE PASS, Objectives 1/3/5. See confirm-pending-master-data
// .command.ts for the full context.

import { BaseCommand } from '@/server/cqrs/command';
import { NormalizationKind } from '@/shared/types/normalization-review.types';

export class RejectPendingMasterDataCommand extends BaseCommand {
  static readonly commandName = 'RejectPendingMasterDataCommand';

  constructor(
    public readonly kind: NormalizationKind,
    public readonly id: string,
    public readonly tenantId: string,
    public readonly userId: string,
    public readonly reason: string
  ) {
    super(RejectPendingMasterDataCommand.commandName);
  }
}

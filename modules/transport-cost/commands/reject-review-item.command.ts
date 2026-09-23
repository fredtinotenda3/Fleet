// modules/transport-cost/commands/reject-review-item.command.ts
//
// Phase O2. A human decides a pending review item's raw value should
// NOT resolve to any transporter/vehicle identity at all (e.g. a
// mis-entered label the O1 blocklist missed, or garbage data). Leaves
// every waiting source record unresolved -- rejection is a stop, not a
// silent fix; a human still has to correct the underlying data if that
// is what is actually needed.

import { BaseCommand } from '@/server/cqrs/command';

export class RejectReviewItemCommand extends BaseCommand {
  static readonly commandName = 'RejectReviewItemCommand';

  constructor(
    public readonly reviewItemId: string,
    public readonly tenantId: string,
    public readonly userId: string,
    public readonly reason: string
  ) {
    super(RejectReviewItemCommand.commandName);
  }
}

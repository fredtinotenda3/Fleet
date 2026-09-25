// modules/transport-cost/commands/request-new-vehicle.command.ts
//
// GAP-CLOSURE PASS, Objective 5. See request-new-transporter.command.ts
// for the full decision record (identical reasoning applies here).

import { BaseCommand } from '@/server/cqrs/command';
import { BusinessStream } from '@/shared/types/contracted-vehicle.types';

export class RequestNewVehicleCommand extends BaseCommand {
  static readonly commandName = 'RequestNewVehicleCommand';

  constructor(
    /** Raw, operator-typed registration. Normalized inside the handler via the exact same normalizeRegistration() the O1 import handler uses. */
    public readonly rawRegistration: string,
    /** Required -- ContractedVehicle.transporterPartnerId is not optional; a vehicle cannot exist without a transporter, same rule ConfirmReviewNewCommand enforces. The manual-entry form resolves the transporter first (search or its own request-new flow), then this. */
    public readonly transporterPartnerId: string,
    public readonly tenantId: string,
    public readonly userId: string,
    public readonly businessStream?: BusinessStream,
    /**
     * The TransportCostSourceRecord._id this request originated from,
     * when one already exists (e.g. requested from the Edit/Correct
     * dialog on an already-saved operation). Optional: a request made
     * from a not-yet-saved manual-entry form has no id yet -- see
     * ContractedVehicle.firstSeenSourceRecordId's updated doc comment.
     */
    public readonly sourceRecordId?: string
  ) {
    super(RequestNewVehicleCommand.commandName);
  }
}

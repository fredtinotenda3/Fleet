// modules/transport-cost/commands/request-new-transporter.command.ts
//
// GAP-CLOSURE PASS, Objective 5 ("Ability to add new master data").
//
// DECISION, REASONING, REVERSIBILITY (documented per the engagement's
// AUTONOMOUS DECISION RULE, since this revisits a call the codebase had
// already made once):
//
//   master-data.service.ts's own header explains at length why Slice 3
//   deliberately did NOT give Transporter/Vehicle a createTransporter()/
//   createVehicle() method, and explicitly names the rejected
//   alternative this command now implements: "a needs-review-status
//   ContractedVehicle created directly by this service... rejected [because]
//   nothing in the existing platform currently resolves a needs-review
//   row created outside the O2 matcher's own flow, so it would be
//   orphaned data requiring its own new review UI."
//
//   That blocking condition is exactly what this gap-closure pass now
//   removes: Objective 1/3's review-queue work in this same delivery
//   adds the missing resolution UI (see confirm-pending-master-data
//   .command.ts and the "Pending master data" tab on
//   NormalizationReviewQueuePage). With a real, working way to resolve
//   a needs-review row, the original rejection's own stated condition
//   no longer holds, so this command implements exactly the previously-
//   rejected alternative -- reversed on new evidence, not silently
//   swapped in. If the review UI in this same pass were ever removed,
//   this command should be removed with it (it would recreate the
//   orphaned-data risk the original decision was protecting against).
//
//   This command does NOT bypass the central "nothing treats an
//   unconfirmed identity as authoritative" rule (normalization-review
//   .types.ts): it creates with reviewStatus: 'needs-review', the exact
//   status TransportPartnerReviewStatus already reserved for this case
//   ("a possible future... master list entered outside the review
//   pipeline"). searchConfirmedByName/findAllForMatching (rejected:
//   {$ne:true}) both continue to exclude it until a human confirms it.

import { BaseCommand } from '@/server/cqrs/command';

export class RequestNewTransporterCommand extends BaseCommand {
  static readonly commandName = 'RequestNewTransporterCommand';

  constructor(
    /** Raw, operator-typed transporter name. Normalized inside the handler via the exact same normalizeTransporter() the O1 import handler uses, so a manually-requested transporter and an imported one always converge on the same canonicalName for the same real-world company. */
    public readonly rawName: string,
    public readonly tenantId: string,
    public readonly userId: string
  ) {
    super(RequestNewTransporterCommand.commandName);
  }
}

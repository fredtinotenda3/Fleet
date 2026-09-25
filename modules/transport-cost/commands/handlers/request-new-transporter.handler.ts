// modules/transport-cost/commands/handlers/request-new-transporter.handler.ts
//
// GAP-CLOSURE PASS, Objective 5. See request-new-transporter.command.ts
// for the full decision record on why this is safe to add now.

import { ICommandHandler } from '@/server/cqrs/command';
import { RequestNewTransporterCommand } from '../request-new-transporter.command';
import { TransportPartnerRepository } from '@/modules/transport-cost/repositories/transport-partner.repository';
import { TransportPartner } from '@/shared/types/transport-partner.types';
import { ValidationError } from '@/server/errors/app.errors';
import { normalizeTransporter } from '@/modules/transport-cost/utils/normalization.utils';
import { auditLog } from '@/infrastructure/monitoring/audit.logger';

export interface RequestNewTransporterResult {
  record: TransportPartner;
  /** false when an existing row (confirmed OR already-pending) matched this exact normalized name/alias -- the caller was NOT created; the existing row is returned so the UI selects it immediately instead of filing a duplicate pending request. */
  created: boolean;
}

export class RequestNewTransporterHandler
  implements ICommandHandler<RequestNewTransporterCommand, RequestNewTransporterResult>
{
  constructor(private readonly partnerRepo: TransportPartnerRepository) {}

  async execute(command: RequestNewTransporterCommand): Promise<RequestNewTransporterResult> {
    const { normalized, raw } = normalizeTransporter(command.rawName);
    if (!normalized) {
      throw new ValidationError('A transporter name is required.');
    }
    if (normalized.length > 200) {
      throw new ValidationError('A transporter name cannot exceed 200 characters.');
    }

    // Dedup layer 1 (see master-data.service.ts's findOrCreateNamed for
    // the identical reasoning): an exact match -- confirmed OR already
    // pending -- means there is nothing new to request. Deliberately
    // reuses findByExactNameOrAlias, the same lookup the O2 matcher's
    // own exact-match layer uses, so "already exists" means the same
    // thing here as it does at import time.
    const existing = await this.partnerRepo.findByExactNameOrAlias(normalized, command.tenantId);
    if (existing) {
      return { record: existing, created: false };
    }

    const created = await this.partnerRepo.create(
      {
        canonicalName: normalized,
        aliases: raw !== normalized ? [raw] : [],
        reviewStatus: 'needs-review',
      },
      command.tenantId,
      command.userId
    );

    // Dedup layer 2 -- a genuine unique-index race (two operators
    // requesting the same brand-new transporter within the same
    // moment) is left to the unique index on {tenantId, canonicalName}
    // if one exists; if it does not, per this collection's own
    // "NEVER auto-merged" rule (transport-partner.types.ts) a rare
    // concurrent duplicate is exactly the kind of thing the confirm/
    // reject review step (and the pre-existing merge machinery,
    // mergedIntoPartnerId) is already the platform's answer for -- not
    // a new mechanism this handler should invent.
    await auditLog.logCreate(command.userId, command.tenantId, 'transport-cost.transporter-partner', created._id!, {
      canonicalName: created.canonicalName,
      reviewStatus: created.reviewStatus,
      requestedManually: true,
    });

    return { record: created, created: true };
  }
}

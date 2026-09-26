// modules/transport-cost/repositories/contracted-vehicle.repository.ts
//
// Phase O2 ("Phase O2 Spec" tab). Plain BaseRepository -- same
// organization-level reasoning as transport-partner.repository.ts.
// Registration matching here is DETERMINISTIC ONLY (normalized exact
// match), never fuzzy: a plate is either the same plate or it isn't,
// unlike a free-text transporter name -- see normalization-matcher
// .service.ts.

import { Filter } from 'mongodb';
import { BaseRepository } from '@/server/repositories/base.repository';
import { ContractedVehicle } from '@/shared/types/contracted-vehicle.types';
import { containsMatch } from '@/shared/utils/regex.utils';

export class ContractedVehicleRepository extends BaseRepository<ContractedVehicle> {
  protected collectionName = 'tblcontractedvehicles';

  /**
   * OLIVINE LIVE OPERATING MODEL, SLICE 3. Case-insensitive "contains"
   * search over registration, CONFIRMED ONLY -- same reasoning as
   * TransportPartnerRepository.searchConfirmedByName: an unconfirmed
   * vehicle identity is not yet safe to offer for direct selection.
   * `transporterPartnerId` narrows to one transporter's own fleet when
   * supplied (the manual-entry form's likely usage -- pick the
   * transporter first, then only see that transporter's vehicles), but
   * is optional: omitted, this searches every confirmed vehicle in the
   * tenant.
   *
   * PRODUCTION FIX (Slice 1-5 verification pass): same defect and same
   * fix as TransportPartnerRepository.searchConfirmedByName -- see that
   * method's doc comment for the full reasoning. Fetches `limit + 1`
   * rows to detect truncation and returns `hasMore` instead of silently
   * capping at ~20 with no signal. Tenant scoping, the
   * `reviewStatus: 'confirmed'` filter, the optional
   * `transporterPartnerId` narrowing, and `containsMatch` regex-escaping
   * are unchanged. REVERSIBLE: callers using only `.results` see
   * identical row data to before.
   */
  async searchConfirmedByRegistration(
    query: string,
    tenantId: string,
    transporterPartnerId?: string,
    limit: number = 50
  ): Promise<{ results: ContractedVehicle[]; hasMore: boolean }> {
    const trimmed = query.trim().replace(/\s+/g, '').toUpperCase();
    const filter: Filter<ContractedVehicle> = {
      reviewStatus: 'confirmed',
      ...(transporterPartnerId ? { transporterPartnerId } : {}),
      ...(trimmed ? { registration: containsMatch(trimmed) } : {}),
    } as Filter<ContractedVehicle>;
    const rows = await this.findMany(filter, tenantId, {
      sortBy: 'registration',
      sortOrder: 'asc',
      limit: limit + 1,
    });
    const hasMore = rows.length > limit;
    return { results: hasMore ? rows.slice(0, limit) : rows, hasMore };
  }

  /**
   * Exact normalized-registration lookup. For a multi-plate cell, the
   * caller passes the full normalized multi-plate string (never a
   * single component) -- see isMultiPlate on the type and decision 4
   * of the O2 spec: multi-plate rows are never split or resolved to
   * one component plate, so they are never looked up by one either.
   */
  async findByRegistration(
    registration: string,
    tenantId: string
  ): Promise<ContractedVehicle | null> {
    return this.findOne(
      { registration } as Filter<ContractedVehicle>,
      tenantId
    );
  }

  async findByTransporterPartnerId(
    transporterPartnerId: string,
    tenantId: string
  ): Promise<ContractedVehicle[]> {
    return this.findMany(
      { transporterPartnerId } as Filter<ContractedVehicle>,
      tenantId,
      { limit: 5000 }
    );
  }

  /**
   * ADDED, Phase O3. Every CONFIRMED contracted vehicle -- the universe
   * TransportCostReportService joins Allocation Ledger postings against
   * to resolve a display registration/businessStream for the O4 Stream
   * -> Vehicle drill-down. Unlike findConfirmedByBusinessStream, no
   * businessStream filter: a posting can exist for a vehicle whose
   * businessStream was never captured at normalization time (see
   * contracted-vehicle.types.ts's header), and the report groups those
   * under an explicit "unattributed" bucket rather than dropping them.
   */
  async findAllConfirmed(tenantId: string): Promise<ContractedVehicle[]> {
    return this.findMany(
      { reviewStatus: 'confirmed' } as Filter<ContractedVehicle>,
      tenantId,
      { limit: 10000 }
    );
  }

  async findNeedingReview(tenantId: string): Promise<ContractedVehicle[]> {
    return this.findMany(
      { reviewStatus: 'needs-review' } as Filter<ContractedVehicle>,
      tenantId,
      { sortBy: 'createdAt', sortOrder: 'asc', limit: 1000 }
    );
  }

  /**
   * All vehicles for a given Business Stream, for the O4 drill-down
   * report's Stream -> Vehicle level. Only 'confirmed' rows -- a
   * needs-review vehicle has no business meaning to report against
   * yet (see O4's report design, which reads Allocation Ledger
   * postings, not this collection directly, but resolves display
   * names/streams through it).
   */
  async findConfirmedByBusinessStream(
    businessStream: string,
    tenantId: string
  ): Promise<ContractedVehicle[]> {
    return this.findMany(
      {
        businessStream,
        reviewStatus: 'confirmed',
      } as Filter<ContractedVehicle>,
      tenantId,
      { limit: 5000 }
    );
  }
}

export const contractedVehicleRepository = new ContractedVehicleRepository();

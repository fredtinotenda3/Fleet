// modules/transport-cost/services/master-data.service.ts
//
// OLIVINE LIVE OPERATING MODEL, SLICE 3. The "search existing, or +
// Add New" backend for Customer/Destination (write-capable, lightweight
// reference data this service owns) and Transporter/Vehicle (read-only
// search over the EXISTING, human-review-gated TransportPartner/
// ContractedVehicle master data -- see the header comments on those two
// repositories and on normalization-review.types.ts for why this
// service never writes to either).
//
// ---------------------------------------------------------------------
// WHY TRANSPORTER/VEHICLE HAVE NO createTransporter()/createVehicle()
// HERE
// ---------------------------------------------------------------------
// normalization-review.types.ts states the platform's own central rule
// verbatim: "nothing in Phase O2 ever writes a NEW TransportPartner/
// ContractedVehicle row... except through a confirmed review item."
// Every existing creation path (ConfirmReviewNewHandler) requires a
// PENDING NormalizationReviewItem to resolve -- which only exists once
// a row has already been imported and the O1 matcher found no
// confident match. A manual-entry "+ Add New Transporter" button, by
// definition, would have to create a CONFIRMED, ledger-postable
// identity from a value nobody has imported yet -- a second, review-
// free creation path for the exact two entities this codebase has
// gone to the most trouble to gate. That is precisely what the Slice 3
// brief says not to do ("do NOT silently create a confirmed/ledger-
// postable vehicle identity from arbitrary user input if the existing
// architecture requires human confirmation").
//
// So this service's transporter/vehicle methods are SEARCH ONLY. When
// nothing matches, the operator's typed text is left exactly where it
// already was pre-Slice-3: a plain string on the parent form, which
// flows through the completely unmodified O1 import / O2 normalization
// pipeline. A genuinely new transporter or vehicle is still created
// exactly as it is today -- confirmed by a human in the normalization
// review queue, never synchronously from this service. See the gap
// analysis's Section 6 "Family-scope DECISION" for the full record,
// including the explicitly considered and rejected alternative (a
// needs-review-status ContractedVehicle created directly by this
// service) and why it was rejected: nothing in the existing platform
// currently resolves a needs-review row created outside the O2
// matcher's own flow, so it would be orphaned data requiring its own
// new review UI -- out of this slice's scope, and a worse outcome than
// leaving the existing, working pipeline untouched.

import { customerRepository, CustomerRepository } from '../repositories/customer.repository';
import { destinationRepository, DestinationRepository } from '../repositories/destination.repository';
import { transportPartnerRepository, TransportPartnerRepository } from '../repositories/transport-partner.repository';
import { contractedVehicleRepository, ContractedVehicleRepository } from '../repositories/contracted-vehicle.repository';
import { normalizeMasterDataName } from '../utils/normalization.utils';
import { Customer } from '@/shared/types/customer.types';
import { Destination } from '@/shared/types/destination.types';
import { BaseEntity, PaginationParams, PaginatedResponse } from '@/shared/types/common.types';
import { ValidationError, ConflictError, NotFoundError } from '@/server/errors/app.errors';
import { auditLog } from '@/infrastructure/monitoring/audit.logger';

export interface MasterDataSearchResult {
  id: string;
  label: string;
}

export interface CreateMasterDataResult<T> {
  record: T;
  /** false when `findByNormalizedName` already had a match -- see findOrCreateNamed's header. The caller was NOT created; the existing record is returned so the UI can select it immediately, per the client's "already exists -- select the existing record" requirement. */
  created: boolean;
}

type NamedMasterDataEntity = BaseEntity & { name: string; normalizedName: string; active: boolean };

/** Structural shape both CustomerRepository and DestinationRepository satisfy -- see this file's findOrCreateNamed. */
interface NamedMasterDataRepository<T extends NamedMasterDataEntity> {
  findByNormalizedName(normalizedName: string, tenantId: string): Promise<T | null>;
  create(
    data: Omit<T, '_id' | 'createdAt' | 'updatedAt' | 'isDeleted' | 'deletedAt' | 'tenantId'>,
    tenantId: string,
    userId?: string
  ): Promise<T>;
  update(
    id: string,
    data: Partial<Omit<T, '_id' | 'tenantId' | 'createdAt' | 'createdBy'>>,
    tenantId: string,
    userId?: string
  ): Promise<T | null>;
}

export class MasterDataService {
  constructor(
    private readonly customerRepo: CustomerRepository = customerRepository,
    private readonly destinationRepo: DestinationRepository = destinationRepository,
    private readonly partnerRepo: TransportPartnerRepository = transportPartnerRepository,
    private readonly vehicleRepo: ContractedVehicleRepository = contractedVehicleRepository
  ) {}

  // ── Customer ──────────────────────────────────────────────────────

  async searchCustomers(query: string, tenantId: string): Promise<MasterDataSearchResult[]> {
    const rows = await this.customerRepo.search(query, tenantId);
    return rows.map((c) => ({ id: c._id!, label: c.name }));
  }

  async createCustomer(name: string, tenantId: string, userId: string): Promise<CreateMasterDataResult<Customer>> {
    return this.findOrCreateNamed(this.customerRepo, name, tenantId, userId, 'customer');
  }

  async listCustomers(
    tenantId: string,
    pagination: PaginationParams,
    activeOnly: boolean = false
  ): Promise<PaginatedResponse<Customer>> {
    return this.customerRepo.listPaginated(tenantId, pagination, activeOnly);
  }

  async deactivateCustomer(id: string, tenantId: string, userId: string): Promise<Customer> {
    return this.setActive(this.customerRepo, id, tenantId, userId, false, 'Customer');
  }

  async reactivateCustomer(id: string, tenantId: string, userId: string): Promise<Customer> {
    return this.setActive(this.customerRepo, id, tenantId, userId, true, 'Customer');
  }

  // ── Destination ───────────────────────────────────────────────────

  async searchDestinations(query: string, tenantId: string): Promise<MasterDataSearchResult[]> {
    const rows = await this.destinationRepo.search(query, tenantId);
    return rows.map((d) => ({ id: d._id!, label: d.name }));
  }

  async createDestination(name: string, tenantId: string, userId: string): Promise<CreateMasterDataResult<Destination>> {
    return this.findOrCreateNamed(this.destinationRepo, name, tenantId, userId, 'destination');
  }

  async listDestinations(
    tenantId: string,
    pagination: PaginationParams,
    activeOnly: boolean = false
  ): Promise<PaginatedResponse<Destination>> {
    return this.destinationRepo.listPaginated(tenantId, pagination, activeOnly);
  }

  async deactivateDestination(id: string, tenantId: string, userId: string): Promise<Destination> {
    return this.setActive(this.destinationRepo, id, tenantId, userId, false, 'Destination');
  }

  async reactivateDestination(id: string, tenantId: string, userId: string): Promise<Destination> {
    return this.setActive(this.destinationRepo, id, tenantId, userId, true, 'Destination');
  }

  // ── Transporter (search only -- see this file's header) ────────────

  async searchTransporters(query: string, tenantId: string): Promise<MasterDataSearchResult[]> {
    const rows = await this.partnerRepo.searchConfirmedByName(query, tenantId);
    return rows.map((p) => ({ id: p._id!, label: p.canonicalName }));
  }

  // ── Vehicle (search only -- see this file's header) ─────────────────

  /**
   * Result labels join in the vehicle's transporter name ("AGL8230 —
   * PRINORTH") so a registration that means nothing on its own is
   * identifiable in the dropdown. `transporterPartnerId`, when
   * supplied, narrows results to that one transporter's own fleet --
   * the manual-entry form's likely usage once a transporter has already
   * been picked.
   */
  async searchVehicles(
    query: string,
    tenantId: string,
    transporterPartnerId?: string
  ): Promise<MasterDataSearchResult[]> {
    const rows = await this.vehicleRepo.searchConfirmedByRegistration(query, tenantId, transporterPartnerId);
    if (rows.length === 0) return [];

    const partnerIds = Array.from(new Set(rows.map((v) => v.transporterPartnerId)));
    const partners = await Promise.all(partnerIds.map((id) => this.partnerRepo.findById(id, tenantId)));
    const partnerNameById = new Map(
      partners.filter((p): p is NonNullable<typeof p> => p !== null).map((p) => [p._id!, p.canonicalName])
    );

    return rows.map((v) => {
      const transporterName = partnerNameById.get(v.transporterPartnerId);
      return {
        id: v._id!,
        label: transporterName ? `${v.registration} — ${transporterName}` : v.registration,
      };
    });
  }

  // ── Shared helpers ───────────────────────────────────────────────

  /**
   * Search-existing-first, create-only-on-genuine-miss, for Customer/
   * Destination. Two layers of duplicate protection, deliberately
   * redundant:
   *
   *   1. This pre-check (`findByNormalizedName`) is what makes the
   *      COMMON path -- someone re-typing a name that already exists --
   *      cheap and gives a clean, non-error "here's the existing one"
   *      result rather than a 409 the caller has to recover from.
   *   2. The unique `{tenantId, normalizedName}` index (infrastructure/
   *      database/indexes.transport-cost-addendum.ts) is what makes the
   *      RACE case -- two requests for the same new name landing
   *      concurrently -- safe: the loser's `create()` throws
   *      ConflictError (BaseRepository.translateDuplicateKeyError), and
   *      this method catches specifically that and re-resolves via
   *      `findByNormalizedName`, returning the winner's row instead of
   *      propagating the 409. Without layer 2, two fast successive
   *      requests (e.g. the client double-submitting or two operators
   *      typing the same new destination in the same second) could both
   *      pass the layer-1 check before either write lands, and Mongo
   *      would happily hold two rows with the same normalized name --
   *      exactly the duplication this whole feature exists to prevent.
   */
  private async findOrCreateNamed<T extends NamedMasterDataEntity>(
    repo: NamedMasterDataRepository<T>,
    rawName: string,
    tenantId: string,
    userId: string,
    entityLabel: 'customer' | 'destination'
  ): Promise<CreateMasterDataResult<T>> {
    const name = rawName.trim();
    if (!name) {
      throw new ValidationError(`A ${entityLabel} name is required.`);
    }
    if (name.length > 200) {
      throw new ValidationError(`A ${entityLabel} name cannot exceed 200 characters.`);
    }
    const normalizedName = normalizeMasterDataName(name);

    const existing = await repo.findByNormalizedName(normalizedName, tenantId);
    if (existing) {
      return { record: existing, created: false };
    }

    try {
      const created = await repo.create(
        { name, normalizedName, active: true } as unknown as Omit<
          T,
          '_id' | 'createdAt' | 'updatedAt' | 'isDeleted' | 'deletedAt' | 'tenantId'
        >,
        tenantId,
        userId
      );
      await auditLog.logCreate(userId, tenantId, `transport-cost.${entityLabel}`, String(created._id), {
        name: created.name,
      });
      return { record: created, created: true };
    } catch (error) {
      // The race case -- see this method's header, layer 2.
      if (error instanceof ConflictError) {
        const winner = await repo.findByNormalizedName(normalizedName, tenantId);
        if (winner) return { record: winner, created: false };
      }
      throw error;
    }
  }

  private async setActive<T extends NamedMasterDataEntity>(
    repo: NamedMasterDataRepository<T> & { findById(id: string, tenantId: string): Promise<T | null> },
    id: string,
    tenantId: string,
    userId: string,
    active: boolean,
    entityLabel: string
  ): Promise<T> {
    const existing = await repo.findById(id, tenantId);
    if (!existing) {
      throw new NotFoundError(`${entityLabel} "${id}" not found.`);
    }
    const updated = await repo.update(id, { active } as Partial<Omit<T, '_id' | 'tenantId' | 'createdAt' | 'createdBy'>>, tenantId, userId);
    if (!updated) {
      throw new NotFoundError(`${entityLabel} "${id}" not found.`);
    }
    await auditLog.logUpdate(userId, tenantId, `transport-cost.${entityLabel.toLowerCase()}`, id, existing, updated);
    return updated;
  }
}

export const masterDataService = new MasterDataService();

// modules/finance/repositories/depreciation-profile.repository.ts

import { Filter } from 'mongodb';
import { TenantScopedRepository } from '@/server/repositories/tenant-scoped.repository';
import { VehicleDepreciationProfile } from '../types/depreciation.types';
import { ConflictError } from '@/server/errors/app.errors';
import { TenantContext } from '@/modules/tenancy/services/tenant-context.service';

/**
 * DELIBERATELY *NOT* APPEND-ONLY -- and this is a correction to the
 * build brief, not an oversight.
 *
 * The brief for this pass asked for "Depreciation repository
 * (TenantScopedRepository, append-only)". The types written in the
 * previous pass say the opposite, with a reason:
 * depreciation.types.ts's header states a profile is POLICY, not
 * evidence of a transaction, so it "can legitimately be corrected in
 * place (a typo'd acquisition cost fixed before the first depreciation
 * run)". Those two instructions cannot both be satisfied.
 *
 * The types win. Making a profile append-only would mean a fat-fingered
 * acquisition cost could never be fixed -- only superseded by a second
 * profile for the same vehicle, which then requires every reader to
 * work out which profile was in force on which date. That is
 * bi-temporal versioning; it is a real design, but it is a much larger
 * one than this pass, and nothing in the product needs it yet.
 *
 * What is append-only is the OUTPUT: every depreciation charge is a
 * posting in tblallocationledger, which is immutable. So the audit
 * trail is preserved where it matters -- you can always reconstruct
 * what was charged and when, even if the policy that produced it was
 * later corrected. DepreciationService additionally refuses to change
 * a financially material field (method, acquisitionCost,
 * acquisitionDate, salvageValue) once charges exist for the vehicle,
 * so a correction after the fact goes through a reversing posting like
 * any other ledger correction rather than silently restating history.
 *
 * hardDelete IS blocked: a physical delete would orphan the
 * depreciation postings that reference the profile, and there is no
 * legitimate reason to erase a policy record rather than soft-delete
 * it.
 */
export class DepreciationProfileRepository extends TenantScopedRepository<VehicleDepreciationProfile> {
  protected collectionName = 'tbldepreciationprofiles';

  /**
   * The active profile for one vehicle within the caller's scope, or
   * null. Scoped rather than tenant-only: a branch accountant must not
   * be able to read (or, via the service's write path, overwrite) the
   * depreciation policy of a vehicle in another branch.
   *
   * Returns the most recently created profile if more than one somehow
   * exists. The service enforces one-per-vehicle on write, but reading
   * defensively costs nothing and avoids a silent "which one?" if a
   * historical duplicate predates that rule.
   */
  async findByVehicleInScope(
    vehicleId: string,
    context: TenantContext
  ): Promise<VehicleDepreciationProfile | null> {
    const results = await this.findManyInScope(
      { vehicleId } as Filter<VehicleDepreciationProfile>,
      context,
      { sortBy: 'createdAt', sortOrder: 'desc', limit: 1 }
    );
    return results[0] ?? null;
  }

  /** Every profile the caller can see, newest first. */
  async findAllInScope(context: TenantContext): Promise<VehicleDepreciationProfile[]> {
    return this.findManyInScope({} as Filter<VehicleDepreciationProfile>, context, {
      sortBy: 'createdAt',
      sortOrder: 'desc',
    });
  }

  async hardDelete(): Promise<boolean> {
    throw new ConflictError(
      'tbldepreciationprofiles cannot be hard-deleted: depreciation postings in ' +
        'tblallocationledger reference the profile that produced them. Soft-delete instead.'
    );
  }
}

export const depreciationProfileRepository = new DepreciationProfileRepository();

// modules/transport-cost/repositories/transport-partner.repository.ts
//
// Phase O2 ("Phase O2 Spec" tab). Plain BaseRepository, NOT
// TenantScopedRepository -- TransportPartner carries no orgUnitId (see
// transport-partner.types.ts's header). Still fully tenant-scoped:
// every method below takes tenantId and BaseRepository's own
// getActiveFilter enforces it, exactly like modules/vendors/repositories/
// vendor.repository.ts, the model this file follows.

import { Filter } from 'mongodb';
import { BaseRepository } from '@/server/repositories/base.repository';
import { TransportPartner } from '@/shared/types/transport-partner.types';

export class TransportPartnerRepository extends BaseRepository<TransportPartner> {
  protected collectionName = 'tbltransportpartners';

  /**
   * Exact match only -- canonicalName or any confirmed alias. This is
   * the FIRST check the O2 matcher runs, before any fuzzy scoring: an
   * exact hit needs no human review (normalization-matcher.service.ts).
   * Excludes rows already merged elsewhere -- a merged row's own name
   * should resolve through the surviving partner, never re-create a
   * duplicate.
   */
  async findByExactNameOrAlias(
    normalizedName: string,
    tenantId: string
  ): Promise<TransportPartner | null> {
    return this.findOne(
      {
        $or: [{ canonicalName: normalizedName }, { aliases: normalizedName }],
        mergedIntoPartnerId: { $exists: false },
      } as Filter<TransportPartner>,
      tenantId
    );
  }

  /**
   * Every partner eligible to be a fuzzy-match candidate: not rejected,
   * not itself merged away. The matcher scores this list in memory
   * (Section K's ~141 distinct transporter names is well within a
   * single-tenant in-memory scan -- see the O2 spec's "why no search
   * index" note). Confirmed and auto-suggested rows are BOTH eligible:
   * an auto-suggested row is still a real candidate identity, just one
   * awaiting its own first confirmation.
   */
  async findAllForMatching(tenantId: string): Promise<TransportPartner[]> {
    return this.findMany(
      {
        rejected: { $ne: true },
        mergedIntoPartnerId: { $exists: false },
      } as Filter<TransportPartner>,
      tenantId,
      { limit: 5000 }
    );
  }

  async findNeedingReview(tenantId: string): Promise<TransportPartner[]> {
    return this.findMany(
      { reviewStatus: 'needs-review' } as Filter<TransportPartner>,
      tenantId,
      { sortBy: 'createdAt', sortOrder: 'asc', limit: 1000 }
    );
  }

  /**
   * Appends a confirmed alias without clobbering concurrent appends --
   * $addToSet, not a read-modify-write $set of the whole array. Used
   * when a review item is confirmed as "same company, new spelling"
   * (decision: aliases grow only through a confirmed review action).
   */
  async addAlias(id: string, alias: string, tenantId: string): Promise<void> {
    const collection = await this.getCollection();
    const filter: Record<string, unknown> = {
      ...this.getTenantFilter(tenantId),
      _id: this.toObjectId(id),
    };
    await collection.updateOne(
      filter as Filter<TransportPartner>,
      { $addToSet: { aliases: alias }, $set: { updatedAt: new Date() } } as any
    );
  }
}

export const transportPartnerRepository = new TransportPartnerRepository();

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
import { containsMatch } from '@/shared/utils/regex.utils';

export class TransportPartnerRepository extends BaseRepository<TransportPartner> {
  protected collectionName = 'tbltransportpartners';

  /**
   * OLIVINE LIVE OPERATING MODEL, SLICE 3. Case-insensitive "contains"
   * search over canonicalName, CONFIRMED ONLY -- the manual-entry
   * transporter search box's read path. Deliberately narrower than
   * findAllForMatching (which also returns 'auto-suggested' rows for the
   * O2 matcher's own fuzzy-scoring purposes): an unconfirmed identity is
   * not yet a safe thing to offer a data-entry operator for direct
   * selection onto a new row, since Phase O2's own central rule is that
   * NOTHING treats an unconfirmed row as authoritative. Does not search
   * `aliases` -- aliases exist to make an already-confirmed identity
   * MATCH more raw spellings automatically at import/review time (see
   * addAlias), not to be individually offered as separate search
   * results, which would surface the same transporter under multiple
   * rows in the dropdown.
   *
   * PRODUCTION FIX (Slice 1-5 verification pass): this used to return a
   * bare `TransportPartner[]` capped at `limit` with NO signal that more
   * rows existed beyond the cap -- opening the picker with an empty or
   * broad query silently showed only the alphabetically-first ~20 rows
   * and looked, to the operator, like "the complete list." The fix is
   * NOT simply raising the cap (a bigger fixed number has the identical
   * failure mode one row past it) -- it is fetching one row PAST the
   * page boundary (`limit + 1`) so the caller can tell there is more
   * without a second `countDocuments()` round trip, and surfacing that
   * as `hasMore` all the way to the UI (see SearchCreateSelect.tsx /
   * IdentityPicker.tsx), which now renders "keep typing to narrow" when
   * true. Tenant scoping, the `reviewStatus: 'confirmed'` filter, and
   * the `containsMatch` regex-escaping are unchanged -- this is a
   * transparency fix, not a scoping or search-algorithm change. The
   * default cap itself moved from 20 to 50 as a modest, secondary
   * headroom improvement; it is not itself the fix, `hasMore` is.
   * REVERSIBLE: callers that only destructure `.results` and ignore
   * `.hasMore` see identical row data to before.
   */
  async searchConfirmedByName(
    query: string,
    tenantId: string,
    limit: number = 50
  ): Promise<{ results: TransportPartner[]; hasMore: boolean }> {
    const trimmed = query.trim();
    const filter: Filter<TransportPartner> = {
      reviewStatus: 'confirmed',
      mergedIntoPartnerId: { $exists: false },
      ...(trimmed ? { canonicalName: containsMatch(trimmed) } : {}),
    } as Filter<TransportPartner>;
    const rows = await this.findMany(filter, tenantId, {
      sortBy: 'canonicalName',
      sortOrder: 'asc',
      limit: limit + 1,
    });
    const hasMore = rows.length > limit;
    return { results: hasMore ? rows.slice(0, limit) : rows, hasMore };
  }

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

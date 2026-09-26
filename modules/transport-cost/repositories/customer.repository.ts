// modules/transport-cost/repositories/customer.repository.ts
//
// OLIVINE LIVE OPERATING MODEL, SLICE 3. Plain BaseRepository, NOT
// TenantScopedRepository -- Customer carries no orgUnitId, same
// reasoning as transport-partner.repository.ts/contracted-vehicle.
// repository.ts (see customer.types.ts's header). Still fully
// tenant-scoped: every method takes tenantId and BaseRepository's own
// getActiveFilter enforces it.

import { Filter } from 'mongodb';
import { BaseRepository } from '@/server/repositories/base.repository';
import { Customer } from '@/shared/types/customer.types';
import { PaginationParams, PaginatedResponse } from '@/shared/types/common.types';
import { containsMatch } from '@/shared/utils/regex.utils';

export class CustomerRepository extends BaseRepository<Customer> {
  protected collectionName = 'tblcustomers';

  /**
   * Exact normalized-name lookup -- the duplicate-protection check run
   * before every create (see MasterDataService.createCustomer). Looks
   * across BOTH active and inactive rows: re-typing the name of a
   * customer someone previously deactivated should surface that
   * existing record, not create a second one that immediately shadows
   * it in every future search.
   */
  async findByNormalizedName(normalizedName: string, tenantId: string): Promise<Customer | null> {
    return this.findOne({ normalizedName } as Filter<Customer>, tenantId);
  }

  /**
   * Case-insensitive "contains" search, ACTIVE ONLY (client requirement:
   * an inactive record "should not normally appear in new-entry
   * results"). Bounded to a small limit -- this is a type-ahead result
   * list, not a report. Sorted by name for a stable, predictable
   * dropdown rather than createdAt (BaseRepository's default), which
   * would put the newest record first regardless of relevance.
   *
   * An empty query returns the first `limit` active customers
   * alphabetically, rather than nothing -- so opening the dropdown with
   * no typing yet still shows something to pick from, encouraging reuse
   * over free-text entry (the whole point of this slice).
   *
   * PRODUCTION FIX (Slice 1-5 verification pass): same "silent ~20 cap,
   * no signal more exist" defect reported for Transporter/Vehicle search
   * applies here too (identical `limit: number = 20` shape) -- fixed the
   * same way: fetch `limit + 1`, detect `hasMore`, return it alongside
   * the page instead of a bare array. See
   * TransportPartnerRepository.searchConfirmedByName's doc comment for
   * the full reasoning. `active: true` filtering and `containsMatch`
   * are unchanged.
   */
  async search(
    query: string,
    tenantId: string,
    limit: number = 50
  ): Promise<{ results: Customer[]; hasMore: boolean }> {
    const trimmed = query.trim();
    const filter: Filter<Customer> = {
      active: true,
      ...(trimmed ? { name: containsMatch(trimmed) } : {}),
    } as Filter<Customer>;
    const rows = await this.findMany(filter, tenantId, { sortBy: 'name', sortOrder: 'asc', limit: limit + 1 });
    const hasMore = rows.length > limit;
    return { results: hasMore ? rows.slice(0, limit) : rows, hasMore };
  }

  async listPaginated(
    tenantId: string,
    pagination: PaginationParams,
    activeOnly: boolean = false
  ): Promise<PaginatedResponse<Customer>> {
    const filter: Filter<Customer> = (activeOnly ? { active: true } : {}) as Filter<Customer>;
    return this.findWithPagination(filter, pagination, tenantId);
  }
}

export const customerRepository = new CustomerRepository();

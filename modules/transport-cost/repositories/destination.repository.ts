// modules/transport-cost/repositories/destination.repository.ts
//
// OLIVINE LIVE OPERATING MODEL, SLICE 3. Structurally identical to
// customer.repository.ts -- see that file's header for the full
// reasoning, which applies here unchanged.

import { Filter } from 'mongodb';
import { BaseRepository } from '@/server/repositories/base.repository';
import { Destination } from '@/shared/types/destination.types';
import { PaginationParams, PaginatedResponse } from '@/shared/types/common.types';
import { containsMatch } from '@/shared/utils/regex.utils';

export class DestinationRepository extends BaseRepository<Destination> {
  protected collectionName = 'tbldestinations';

  async findByNormalizedName(normalizedName: string, tenantId: string): Promise<Destination | null> {
    return this.findOne({ normalizedName } as Filter<Destination>, tenantId);
  }

  async search(query: string, tenantId: string, limit: number = 20): Promise<Destination[]> {
    const trimmed = query.trim();
    const filter: Filter<Destination> = {
      active: true,
      ...(trimmed ? { name: containsMatch(trimmed) } : {}),
    } as Filter<Destination>;
    return this.findMany(filter, tenantId, { sortBy: 'name', sortOrder: 'asc', limit });
  }

  async listPaginated(
    tenantId: string,
    pagination: PaginationParams,
    activeOnly: boolean = false
  ): Promise<PaginatedResponse<Destination>> {
    const filter: Filter<Destination> = (activeOnly ? { active: true } : {}) as Filter<Destination>;
    return this.findWithPagination(filter, pagination, tenantId);
  }
}

export const destinationRepository = new DestinationRepository();

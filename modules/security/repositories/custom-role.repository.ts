// modules/security/repositories/custom-role.repository.ts

import { Filter } from 'mongodb';
import { BaseRepository } from '@/server/repositories/base.repository';
import { CustomRole } from '../types/custom-role.types';

export class CustomRoleRepository extends BaseRepository<CustomRole> {
  protected collectionName = 'tblcustomroles';

  async findByOrganization(organizationId: string, activeOnly: boolean = true): Promise<CustomRole[]> {
    const filter = activeOnly ? ({ status: 'active' } as Filter<CustomRole>) : ({} as Filter<CustomRole>);
    return this.findMany(filter, organizationId, { sortBy: 'name', sortOrder: 'asc' });
  }

  async findByName(name: string, organizationId: string): Promise<CustomRole | null> {
    return this.findOne({ name } as Filter<CustomRole>, organizationId);
  }

  /**
   * Updates a custom role and bumps its version, mirroring how
   * modules/rules versions rule definitions, so audit/execution history
   * can record which definition of a role was in effect at a given time.
   */
  async bumpVersion(
    id: string,
    tenantId: string,
    updates: Partial<Omit<CustomRole, '_id' | 'tenantId' | 'createdAt' | 'createdBy'>>,
    userId?: string
  ): Promise<CustomRole | null> {
    const existing = await this.findById(id, tenantId);
    if (!existing) return null;
    return this.update(id, { ...updates, version: (existing.version || 1) + 1 }, tenantId, userId);
  }
}

export const customRoleRepository = new CustomRoleRepository();
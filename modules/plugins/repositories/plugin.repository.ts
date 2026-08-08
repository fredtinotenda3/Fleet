// modules/plugins/repositories/plugin.repository.ts

import { Filter } from 'mongodb';
import { BaseRepository } from '@/server/repositories/base.repository';
import { RegisteredPlugin } from '../types/plugin.types';
import { PLATFORM_OWNER_TENANT_ID } from '@/server/tenancy/tenant-scope';

/**
 * Catalogue of plugins available to install, analogous to an "app store"
 * listing. Not tenant-scoped (isSuperAdmin bypass is used throughout,
 * same rationale as OrganizationRepository.findBySlug) since the catalogue
 * itself is platform-global; only PluginInstallation (below) is
 * per-organization.
 */
export class PluginRepository extends BaseRepository<RegisteredPlugin> {
  protected collectionName = 'tblplugins';

  /**
   * Override create to auto-populate tenantId as PLATFORM_OWNER_TENANT_ID.
   * The plugin catalogue is platform-global — it doesn't belong to any
   * specific organization, so tenantId is always PLATFORM_OWNER_TENANT_ID.
   */
  async create(
    data: Omit<RegisteredPlugin, '_id' | 'tenantId' | 'createdAt' | 'updatedAt' | 'isDeleted' | 'deletedAt'>,
    tenantId: string,
    userId: string
  ): Promise<RegisteredPlugin> {
    return super.create(
      {
        ...data,
      },
      PLATFORM_OWNER_TENANT_ID,
      userId
    );
  }

  async findByPluginId(pluginId: string): Promise<RegisteredPlugin | null> {
    return this.findOne({ pluginId } as Filter<RegisteredPlugin>, PLATFORM_OWNER_TENANT_ID);
  }

  async listPublished(): Promise<RegisteredPlugin[]> {
    return this.findMany(
      { status: 'published' } as Filter<RegisteredPlugin>,
      PLATFORM_OWNER_TENANT_ID,
      { sortBy: 'createdAt', sortOrder: 'desc' },
      false,
      true
    );
  }

  async listAll(): Promise<RegisteredPlugin[]> {
    return this.findMany({} as Filter<RegisteredPlugin>, PLATFORM_OWNER_TENANT_ID, {}, false, true);
  }
}

export const pluginRepository = new PluginRepository();
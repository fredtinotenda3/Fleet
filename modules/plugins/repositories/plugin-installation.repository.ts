// modules/plugins/repositories/plugin-installation.repository.ts

import { Filter } from 'mongodb';
import { BaseRepository } from '@/server/repositories/base.repository';
import { PluginInstallation, PluginStatus } from '../types/plugin.types';

export class PluginInstallationRepository extends BaseRepository<PluginInstallation> {
  protected collectionName = 'tblplugininstallations';

  /**
   * Override create to auto-populate tenantId from organizationId.
   * This keeps the caller (PluginService) from needing to know that
   * tenantId and organizationId are the same value for installations.
   */
  async create(
    data: Omit<PluginInstallation, '_id' | 'tenantId' | 'createdAt' | 'updatedAt' | 'isDeleted' | 'deletedAt'>,
    organizationId: string,
    userId: string
  ): Promise<PluginInstallation> {
    return super.create(
      {
        ...data,
        tenantId: organizationId,
      },
      organizationId,
      userId
    );
  }

  async findByOrgAndPluginId(organizationId: string, pluginId: string): Promise<PluginInstallation | null> {
    return this.findOne({ pluginId } as Filter<PluginInstallation>, organizationId);
  }

  async listForOrganization(organizationId: string): Promise<PluginInstallation[]> {
    return this.findMany({} as Filter<PluginInstallation>, organizationId, {
      sortBy: 'createdAt',
      sortOrder: 'desc',
    });
  }

  async listActiveByOrgAndEvent(organizationId: string, eventName: string): Promise<PluginInstallation[]> {
    // Filters against the manifest's subscribedEvents, joined at query time
    // via the caller (PluginLoaderService) rather than denormalizing the
    // event list onto the installation record, since manifest is the
    // source of truth and can change between plugin versions.
    return this.findMany({ status: 'active' } as Filter<PluginInstallation>, organizationId);
  }

  async updateStatus(
    id: string,
    tenantId: string,
    status: PluginStatus,
    fields?: Partial<Pick<PluginInstallation, 'lastError' | 'lastActiveAt'>>
  ): Promise<PluginInstallation | null> {
    return this.update(id, { status, ...fields } as Partial<PluginInstallation>, tenantId);
  }
}

export const pluginInstallationRepository = new PluginInstallationRepository();
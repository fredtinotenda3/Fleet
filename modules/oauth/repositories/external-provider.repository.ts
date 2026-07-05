// modules/oauth/repositories/external-provider.repository.ts

import { Filter } from 'mongodb';
import { BaseRepository } from '@/server/repositories/base.repository';
import { ExternalProvider, ExternalProviderStatus } from '../types/external-provider.types';

export class ExternalProviderRepository extends BaseRepository<ExternalProvider> {
  protected collectionName = 'tblexternal_providers';

  async findByProviderId(providerId: string): Promise<ExternalProvider | null> {
    const collection = await this.getCollection();
    const filter = {
      providerId,
      isDeleted: { $ne: true },
    } as Filter<ExternalProvider>;
    return collection.findOne(filter);
  }

  async findByOrganization(organizationId: string): Promise<ExternalProvider[]> {
    return this.findMany({} as Filter<ExternalProvider>, organizationId, {
      sortBy: 'name',
      sortOrder: 'asc',
    });
  }

  async findActiveByOrganization(organizationId: string): Promise<ExternalProvider[]> {
    return this.findMany(
      { status: 'active' } as Filter<ExternalProvider>,
      organizationId,
      { sortBy: 'name', sortOrder: 'asc' }
    );
  }

  async findActiveByDomainHint(domain: string): Promise<ExternalProvider | null> {
    const collection = await this.getCollection();
    const filter = {
      domainHints: domain.toLowerCase(),
      status: 'active',
      isDeleted: { $ne: true },
    } as Filter<ExternalProvider>;
    return collection.findOne(filter);
  }

  async updateStatus(
    id: string,
    tenantId: string,
    status: ExternalProviderStatus
  ): Promise<ExternalProvider | null> {
    return this.update(id, { status } as Partial<ExternalProvider>, tenantId);
  }
}

export const externalProviderRepository = new ExternalProviderRepository();
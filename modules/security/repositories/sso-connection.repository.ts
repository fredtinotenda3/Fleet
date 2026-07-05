// modules/security/repositories/sso-connection.repository.ts

import { Filter } from 'mongodb';
import { BaseRepository } from '@/server/repositories/base.repository';
import { SsoConnection } from '../types/sso.types';

export class SsoConnectionRepository extends BaseRepository<SsoConnection> {
  protected collectionName = 'tblssoconnections';

  async findByOrganization(organizationId: string): Promise<SsoConnection[]> {
    return this.findMany({} as Filter<SsoConnection>, organizationId, { sortBy: 'createdAt', sortOrder: 'desc' });
  }

  /**
   * Looked up BEFORE authentication (from an email domain on the login
   * screen), so — like OrganizationRepository.findBySlug — this
   * deliberately bypasses the tenant filter via the collection directly
   * rather than going through BaseRepository's tenant-scoped helpers.
   */
  async findActiveByDomainHint(domain: string): Promise<SsoConnection | null> {
    const collection = await this.getCollection();
    return collection.findOne({
      domainHints: domain.toLowerCase(),
      status: 'active',
      isDeleted: { $ne: true },
    } as Filter<SsoConnection>);
  }

  async findByIdUnscoped(id: string): Promise<SsoConnection | null> {
    const collection = await this.getCollection();
    const { ObjectId } = await import('mongodb');
    if (!ObjectId.isValid(id)) return null;
    return collection.findOne({ _id: new ObjectId(id) as any, isDeleted: { $ne: true } } as Filter<SsoConnection>);
  }
}

export const ssoConnectionRepository = new SsoConnectionRepository();
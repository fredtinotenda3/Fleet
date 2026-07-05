// modules/oauth/repositories/oauth-client.repository.ts

import { Filter } from 'mongodb';
import { BaseRepository } from '@/server/repositories/base.repository';
import { OAuthClient, OAuthClientStatus } from '../types/oauth-client.types';

export class OAuthClientRepository extends BaseRepository<OAuthClient> {
  protected collectionName = 'tbloauth_clients';

  async findByClientId(clientId: string): Promise<OAuthClient | null> {
    const collection = await this.getCollection();
    const filter = {
      clientId,
      isDeleted: { $ne: true },
    } as Filter<OAuthClient>;
    return collection.findOne(filter);
  }

  async findByOrganization(
    organizationId: string,
    includeRevoked: boolean = false
  ): Promise<OAuthClient[]> {
    const filter = includeRevoked
      ? ({} as Filter<OAuthClient>)
      : ({ status: 'active' } as Filter<OAuthClient>);
    return this.findMany(filter, organizationId, {
      sortBy: 'createdAt',
      sortOrder: 'desc',
    });
  }

  async updateStatus(
    id: string,
    tenantId: string,
    status: OAuthClientStatus,
    reason?: string
  ): Promise<OAuthClient | null> {
    return this.update(
      id,
      { status, ...(reason && { metadata: { revocationReason: reason } }) } as Partial<OAuthClient>,
      tenantId
    );
  }

  async touchLastUsed(id: string, tenantId: string, ip?: string): Promise<void> {
    await this.update(
      id,
      { lastUsedAt: new Date(), lastUsedIp: ip } as Partial<OAuthClient>,
      tenantId
    );
  }

  async expireStaleClients(): Promise<number> {
    const collection = await this.getCollection();
    const result = await collection.updateMany(
      {
        status: 'active',
        // Use $exists and $lt instead of $ne: null
        expiresAt: { $exists: true, $lt: new Date() },
      } as Filter<OAuthClient>,
      { $set: { status: 'expired' as OAuthClientStatus, updatedAt: new Date() } }
    );
    return result.modifiedCount || 0;
  }
}

export const oauthClientRepository = new OAuthClientRepository();
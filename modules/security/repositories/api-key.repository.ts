// modules/security/repositories/api-key.repository.ts

import { Filter, ObjectId } from 'mongodb';
import { BaseRepository } from '@/server/repositories/base.repository';
import { ApiKey, ApiKeyStatus } from '../types/api-key.types';

export class ApiKeyRepository extends BaseRepository<ApiKey> {
  protected collectionName = 'tblapikeys';

  /**
   * Bypasses tenant scoping by design: at authentication time we don't
   * yet know which organization issued the presented key, so lookup must
   * happen purely by the key's unique prefix, mirroring
   * OrganizationRepository.findBySlug's rationale for the same pattern.
   */
  async findByPrefix(keyPrefix: string): Promise<ApiKey | null> {
    const collection = await this.getCollection();
    return collection.findOne({
      keyPrefix,
      isDeleted: { $ne: true },
    } as Filter<ApiKey>);
  }

  async findByOrganization(organizationId: string, includeRevoked: boolean = false): Promise<ApiKey[]> {
    const filter: Filter<ApiKey> = includeRevoked
      ? ({} as Filter<ApiKey>)
      : ({ status: 'active' } as Filter<ApiKey>);
    return this.findMany(filter, organizationId, { sortBy: 'createdAt', sortOrder: 'desc' }, false, true);
  }

  async touchLastUsed(id: string, tenantId: string, ip?: string): Promise<void> {
    if (!ObjectId.isValid(id)) return;
    const collection = await this.getCollection();
    const filter: any = {
      ...this.getActiveFilter(tenantId, false, true),
      _id: new ObjectId(id),
    };
    await collection.updateOne(
      filter as Filter<ApiKey>,
      { $set: { lastUsedAt: new Date(), lastUsedIp: ip, updatedAt: new Date() } }
    );
  }

  async revoke(id: string, tenantId: string, revokedBy: string, reason?: string): Promise<boolean> {
    if (!ObjectId.isValid(id)) return false;
    const collection = await this.getCollection();
    const filter: any = {
      ...this.getActiveFilter(tenantId, false, true),
      _id: new ObjectId(id),
      status: 'active',
    };
    const result = await collection.updateOne(
      filter as Filter<ApiKey>,
      {
        $set: {
          status: 'revoked' as ApiKeyStatus,
          revokedAt: new Date(),
          revokedBy,
          revokedReason: reason,
          updatedAt: new Date(),
        },
      }
    );
    return result.modifiedCount > 0;
  }

  async expireStaleKeys(): Promise<number> {
    const collection = await this.getCollection();
    const result = await collection.updateMany(
      { status: 'active', expiresAt: { $ne: null, $lt: new Date() } } as Filter<ApiKey>,
      { $set: { status: 'expired' as ApiKeyStatus, updatedAt: new Date() } }
    );
    return result.modifiedCount;
  }
}

export const apiKeyRepository = new ApiKeyRepository();
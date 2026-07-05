// modules/oauth/repositories/oauth-token.repository.ts

import { Filter } from 'mongodb';
import { BaseRepository } from '@/server/repositories/base.repository';
import { OAuthToken, OAuthTokenStatus, OAuthTokenType } from '../types/oauth-token.types';

export class OAuthTokenRepository extends BaseRepository<OAuthToken> {
  protected collectionName = 'tbloauth_tokens';

  async findByTokenHash(tokenHash: string): Promise<OAuthToken | null> {
    const collection = await this.getCollection();
    const filter = { tokenHash } as Filter<OAuthToken>;
    return collection.findOne(filter);
  }

  async findByClient(clientId: string, tenantId: string): Promise<OAuthToken[]> {
    return this.findMany({ clientId } as Filter<OAuthToken>, tenantId, {
      sortBy: 'issuedAt',
      sortOrder: 'desc',
    });
  }

  async findByUser(userId: string, tenantId: string): Promise<OAuthToken[]> {
    return this.findMany({ userId } as Filter<OAuthToken>, tenantId, {
      sortBy: 'issuedAt',
      sortOrder: 'desc',
    });
  }

  async revokeToken(id: string, tenantId: string, reason?: string): Promise<boolean> {
    return this.softDelete(id, tenantId);
  }

  async revokeAllForClient(clientId: string, tenantId: string, reason?: string): Promise<number> {
    const collection = await this.getCollection();
    const filter = {
      ...this.getActiveFilter(tenantId),
      clientId,
      status: { $in: ['active', 'issued'] },
    } as Filter<OAuthToken>;
    const result = await collection.updateMany(
      filter,
      {
        $set: {
          status: 'revoked' as OAuthTokenStatus,
          revokedAt: new Date(),
          revokedReason: reason,
          updatedAt: new Date(),
        },
      }
    );
    return result.modifiedCount || 0;
  }

  async revokeAllForUser(userId: string, tenantId: string, reason?: string): Promise<number> {
    const collection = await this.getCollection();
    const filter = {
      ...this.getActiveFilter(tenantId),
      userId,
      status: { $in: ['active', 'issued'] },
    } as Filter<OAuthToken>;
    const result = await collection.updateMany(
      filter,
      {
        $set: {
          status: 'revoked' as OAuthTokenStatus,
          revokedAt: new Date(),
          revokedReason: reason,
          updatedAt: new Date(),
        },
      }
    );
    return result.modifiedCount || 0;
  }

  async deleteExpiredTokens(tenantId: string): Promise<number> {
    const collection = await this.getCollection();
    const filter = {
      ...this.getActiveFilter(tenantId),
      expiresAt: { $lt: new Date() },
    } as Filter<OAuthToken>;
    const result = await collection.deleteMany(filter);
    return result.deletedCount || 0;
  }

  async getActiveTokenCount(clientId: string, tenantId: string): Promise<number> {
    const collection = await this.getCollection();
    const filter = {
      ...this.getActiveFilter(tenantId),
      clientId,
      status: { $in: ['active', 'issued'] },
      expiresAt: { $gt: new Date() },
    } as Filter<OAuthToken>;
    return collection.countDocuments(filter);
  }
}

export const oauthTokenRepository = new OAuthTokenRepository();
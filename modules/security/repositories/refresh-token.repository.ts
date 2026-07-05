// modules/security/repositories/refresh-token.repository.ts

import { Filter, ObjectId } from 'mongodb';
import { BaseRepository } from '@/server/repositories/base.repository';
import { RefreshToken, RefreshTokenStatus } from '../types/refresh-token.types';

export class RefreshTokenRepository extends BaseRepository<RefreshToken> {
  protected collectionName = 'tblrefreshtokens';

  async createToken(
    data: Omit<RefreshToken, '_id' | 'createdAt' | 'updatedAt' | 'isDeleted' | 'deletedAt'>,
    tenantId: string
  ): Promise<RefreshToken> {
    return this.create(data, tenantId, data.userId);
  }

  async findByHash(tokenHash: string, tenantId: string): Promise<RefreshToken | null> {
    return this.findOne({ tokenHash } as Filter<RefreshToken>, tenantId, false, true);
  }

  async findByFamily(familyId: string, tenantId: string): Promise<RefreshToken[]> {
    return this.findMany({ familyId } as Filter<RefreshToken>, tenantId, {}, false, true);
  }

  /**
   * Marks a refresh token as rotated (its one-time use has been
   * consumed) and returns the updated document so the caller can read
   * its `familyId` to mint the next token in the same rotation chain.
   */
  async markRotated(id: string, tenantId: string): Promise<RefreshToken | null> {
    if (!ObjectId.isValid(id)) return null;
    const collection = await this.getCollection();
    const filter: any = {
      ...this.getActiveFilter(tenantId, false, true),
      _id: new ObjectId(id),
      status: 'active',
    };
    const result = await collection.findOneAndUpdate(
      filter as Filter<RefreshToken>,
      { $set: { status: 'rotated' as RefreshTokenStatus, rotatedAt: new Date(), updatedAt: new Date() } },
      { returnDocument: 'after' }
    );
    return (result as RefreshToken) || null;
  }

  async markStatus(
    id: string,
    tenantId: string,
    status: RefreshTokenStatus,
    reason?: string
  ): Promise<boolean> {
    if (!ObjectId.isValid(id)) return false;
    const collection = await this.getCollection();
    const filter: any = {
      ...this.getActiveFilter(tenantId, false, true),
      _id: new ObjectId(id),
    };
    const result = await collection.updateOne(
      filter as Filter<RefreshToken>,
      {
        $set: {
          status,
          ...(status === 'revoked' || status === 'reused' ? { revokedAt: new Date() } : {}),
          revokedReason: reason,
          updatedAt: new Date(),
        },
      }
    );
    return result.modifiedCount > 0;
  }

  /**
   * Revokes every token in a rotation family. Called when a stale
   * (already-rotated) refresh token is presented again — the standard
   * signature of a stolen refresh token — to force re-authentication
   * for anyone still holding a token from that chain.
   */
  async revokeFamily(familyId: string, tenantId: string, reason: string): Promise<number> {
    const collection = await this.getCollection();
    const filter: Filter<RefreshToken> = {
      ...this.getActiveFilter(tenantId, false, true),
      familyId,
      status: { $in: ['active', 'rotated'] },
    };
    const result = await collection.updateMany(
      filter,
      {
        $set: {
          status: 'revoked' as RefreshTokenStatus,
          revokedAt: new Date(),
          revokedReason: reason,
          updatedAt: new Date(),
        },
      }
    );
    return result.modifiedCount;
  }

  async revokeAllForUser(userId: string, tenantId: string, reason: string): Promise<number> {
    const collection = await this.getCollection();
    const filter: Filter<RefreshToken> = {
      ...this.getActiveFilter(tenantId, false, true),
      userId,
      status: { $in: ['active', 'rotated'] },
    };
    const result = await collection.updateMany(
      filter,
      {
        $set: {
          status: 'revoked' as RefreshTokenStatus,
          revokedAt: new Date(),
          revokedReason: reason,
          updatedAt: new Date(),
        },
      }
    );
    return result.modifiedCount;
  }

  async deleteExpired(): Promise<number> {
    const collection = await this.getCollection();
    const filter: Filter<RefreshToken> = {
      expiresAt: { $lt: new Date() },
    };
    const result = await collection.deleteMany(filter);
    return result.deletedCount || 0;
  }
}

export const refreshTokenRepository = new RefreshTokenRepository();
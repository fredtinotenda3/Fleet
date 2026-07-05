// modules/security/repositories/session.repository.ts

import { Filter, ObjectId } from 'mongodb';
import { BaseRepository } from '@/server/repositories/base.repository';
import { UserSession, CreateSessionInput, SessionStatus } from '../types/session.types';

export class SessionRepository extends BaseRepository<UserSession> {
  protected collectionName = 'tblusersessions';

  async createSession(input: CreateSessionInput): Promise<UserSession> {
    const now = new Date();
    return this.create(
      {
        tenantId: input.tenantId,
        userId: input.userId,
        sessionId: input.sessionId,
        status: 'active',
        ipAddress: input.ipAddress,
        userAgent: input.userAgent,
        deviceLabel: input.deviceLabel,
        issuedAt: now,
        lastActiveAt: now,
        expiresAt: input.expiresAt,
      },
      input.tenantId,
      input.userId
    );
  }

  async findBySessionId(sessionId: string, tenantId: string): Promise<UserSession | null> {
    return this.findOne({ sessionId } as Filter<UserSession>, tenantId, false, true);
  }

  async findActiveByUser(userId: string, tenantId: string): Promise<UserSession[]> {
    return this.findMany(
      { userId, status: 'active' } as Filter<UserSession>,
      tenantId,
      { sortBy: 'lastActiveAt', sortOrder: 'desc' },
      false,
      true
    );
  }

  async touchLastActive(sessionId: string, tenantId: string): Promise<void> {
    const collection = await this.getCollection();
    const filter: Filter<UserSession> = {
      ...this.getActiveFilter(tenantId, false, true),
      sessionId,
      status: 'active',
    };
    await collection.updateOne(filter, {
      $set: { lastActiveAt: new Date(), updatedAt: new Date() },
    });
  }

  async revokeById(id: string, tenantId: string, revokedBy: string, reason?: string): Promise<boolean> {
    if (!ObjectId.isValid(id)) return false;
    const collection = await this.getCollection();
    const filter: Filter<UserSession> = {
      ...this.getActiveFilter(tenantId, false, true),
      _id: new ObjectId(id) as any, // Cast to any for ObjectId compatibility
      status: 'active',
    };
    const result = await collection.updateOne(filter, {
      $set: {
        status: 'revoked' as SessionStatus,
        revokedAt: new Date(),
        revokedBy,
        revokedReason: reason,
        updatedAt: new Date(),
      },
    });
    return result.modifiedCount > 0;
  }

  async revokeBySessionId(
    sessionId: string,
    tenantId: string,
    revokedBy: string,
    reason?: string
  ): Promise<boolean> {
    const collection = await this.getCollection();
    const filter: Filter<UserSession> = {
      ...this.getActiveFilter(tenantId, false, true),
      sessionId,
      status: 'active',
    };
    const result = await collection.updateOne(filter, {
      $set: {
        status: 'revoked' as SessionStatus,
        revokedAt: new Date(),
        revokedBy,
        revokedReason: reason,
        updatedAt: new Date(),
      },
    });
    return result.modifiedCount > 0;
  }

  async revokeAllForUser(
    userId: string,
    tenantId: string,
    revokedBy: string,
    exceptSessionId?: string,
    reason?: string
  ): Promise<number> {
    const collection = await this.getCollection();
    const filter: any = {
      ...this.getActiveFilter(tenantId, false, true),
      userId,
      status: 'active',
    };
    
    if (exceptSessionId) {
      filter.sessionId = { $ne: exceptSessionId };
    }

    const result = await collection.updateMany(filter as Filter<UserSession>, {
      $set: {
        status: 'revoked' as SessionStatus,
        revokedAt: new Date(),
        revokedBy,
        revokedReason: reason || 'Bulk revocation',
        updatedAt: new Date(),
      },
    });
    return result.modifiedCount;
  }

  async isSessionActive(sessionId: string, tenantId: string): Promise<boolean> {
    const collection = await this.getCollection();
    const now = new Date();
    const filter: Filter<UserSession> = {
      ...this.getActiveFilter(tenantId, false, true),
      sessionId,
      status: 'active',
      expiresAt: { $gt: now },
    };
    const session = await collection.findOne(filter);
    return !!session;
  }

  async expireStaleSessions(): Promise<number> {
    const collection = await this.getCollection();
    const result = await collection.updateMany(
      { status: 'active', expiresAt: { $lt: new Date() } } as Filter<UserSession>,
      { $set: { status: 'expired' as SessionStatus, updatedAt: new Date() } }
    );
    return result.modifiedCount;
  }
}

export const sessionRepository = new SessionRepository();
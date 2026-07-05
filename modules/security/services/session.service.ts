// modules/security/services/session.service.ts

import { sessionRepository, SessionRepository } from '../repositories/session.repository';
import { refreshTokenRepository, RefreshTokenRepository } from '../repositories/refresh-token.repository';
import { UserSession, SessionListItem, CreateSessionInput } from '../types/session.types';
import { NotFoundError, ForbiddenError } from '@/server/errors/app.errors';
import { EventBusFactory } from '@/server/events/bus/EventBusFactory';
import { SessionRevokedEvent } from '../events/session.events';
import { auditLog } from '@/infrastructure/monitoring/audit.logger';

export class SessionService {
  constructor(
    private readonly sessionRepo: SessionRepository = sessionRepository,
    private readonly refreshRepo: RefreshTokenRepository = refreshTokenRepository
  ) {}

  async createSession(input: CreateSessionInput): Promise<UserSession> {
    return this.sessionRepo.createSession(input);
  }

  async touchSession(sessionId: string, tenantId: string): Promise<void> {
    await this.sessionRepo.touchLastActive(sessionId, tenantId);
  }

  async isSessionValid(sessionId: string, tenantId: string): Promise<boolean> {
    return this.sessionRepo.isSessionActive(sessionId, tenantId);
  }

  async listForUser(userId: string, tenantId: string, currentSessionId?: string): Promise<SessionListItem[]> {
    const sessions = await this.sessionRepo.findActiveByUser(userId, tenantId);
    return sessions.map((s) => ({
      _id: s._id!,
      sessionId: s.sessionId,
      ipAddress: s.ipAddress,
      userAgent: s.userAgent,
      deviceLabel: s.deviceLabel,
      issuedAt: s.issuedAt,
      lastActiveAt: s.lastActiveAt,
      expiresAt: s.expiresAt,
      status: s.status,
      isCurrent: s.sessionId === currentSessionId,
    }));
  }

  async revokeSession(
    id: string,
    tenantId: string,
    revokedByUserId: string,
    requestingUserId: string,
    isSuperAdmin: boolean,
    reason?: string
  ): Promise<void> {
    const session = await this.sessionRepo.findById(id, tenantId, false, true);
    if (!session) {
      throw new NotFoundError('Session not found');
    }
    if (!isSuperAdmin && session.userId !== requestingUserId) {
      throw new ForbiddenError('You may only revoke your own sessions');
    }

    const revoked = await this.sessionRepo.revokeById(id, tenantId, revokedByUserId, reason);
    if (!revoked) {
      throw new NotFoundError('Session not found or already revoked');
    }

    await this.refreshRepo.revokeAllForUser(session.userId, tenantId, reason || 'Session revoked');

    const eventBus = EventBusFactory.getInstance();
    await eventBus.publish(
      new SessionRevokedEvent(session._id!, session.userId, tenantId, {
        userId: revokedByUserId,
        reason,
      })
    );

    await auditLog.log({
      action: 'SESSION_REVOKED',
      userId: revokedByUserId,
      tenantId,
      entityType: 'session',
      entityId: session._id,
      metadata: { targetUserId: session.userId, reason },
    });
  }

  async revokeAllForUser(
    userId: string,
    tenantId: string,
    revokedByUserId: string,
    exceptSessionId?: string,
    reason: string = 'Bulk session revocation'
  ): Promise<number> {
    const count = await this.sessionRepo.revokeAllForUser(
      userId,
      tenantId,
      revokedByUserId,
      exceptSessionId,
      reason
    );

    await auditLog.log({
      action: 'SESSION_BULK_REVOKED',
      userId: revokedByUserId,
      tenantId,
      entityType: 'session',
      metadata: { targetUserId: userId, count, reason },
    });

    return count;
  }
}

export const sessionService = new SessionService();
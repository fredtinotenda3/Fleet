// modules/security/services/refresh-token.service.ts

import { randomUUID } from 'crypto';
import { ObjectId } from 'mongodb';
import connectToDatabase from '@/infrastructure/database/mongodb';
import { tokenService, TokenPayload } from '@/infrastructure/security/token.service';
import {
  refreshTokenRepository,
  RefreshTokenRepository,
} from '../repositories/refresh-token.repository';
import { sessionRepository, SessionRepository } from '../repositories/session.repository';
import { IssuedTokenPair } from '../types/refresh-token.types';
import { AppError, UnauthorizedError } from '@/server/errors/app.errors';
import { auditLog } from '@/infrastructure/monitoring/audit.logger';
import { Role } from '@/server/permissions/roles';

export interface IssueTokenPairParams {
  userId: string;
  tenantId: string;
  email: string;
  roles: string[];
  permissions?: string[];
  ipAddress?: string;
  userAgent?: string;
  deviceLabel?: string;
}

/**
 * FIX (critical -- privilege escalation on every refresh-token rotation):
 * tbladmin stores role as a SINGULAR `Role?: string` field (see the
 * User interface in lib/authOptions.ts) -- there is no `roles` ARRAY
 * field anywhere in this schema. That means `admin.roles` below was
 * `undefined` for every single account, so the fallback
 *   admin.roles || ['super_admin', 'organization_owner']
 * fired unconditionally: every access token minted through the
 * refresh-token flow (mobile apps, third-party API clients -- anything
 * not using the NextAuth cookie session) carried
 * ['super_admin', 'organization_owner'] regardless of the account's
 * actual role. A driver, viewer, or mechanic authenticating through
 * this path silently became a super admin on every token refresh.
 *
 * Mirrors the exact same LEGACY_ROLE_MAP resolution used in
 * lib/authOptions.ts's authorize(), so the mapping from the legacy
 * tbladmin.Role string to the modern Role enum can never drift between
 * the cookie-session login path and the refresh-token path. An
 * unmapped/missing role resolves to VIEWER (least privilege), never to
 * super_admin -- consistent with resolveRole()'s "must never fail open"
 * rule in authOptions.ts.
 */
const LEGACY_ROLE_MAP: Record<string, Role> = {
  admin: Role.ORGANIZATION_OWNER,
  super_admin: Role.SUPER_ADMIN,
  organization_owner: Role.ORGANIZATION_OWNER,
  fleet_manager: Role.FLEET_MANAGER,
  accountant: Role.ACCOUNTANT,
  dispatcher: Role.DISPATCHER,
  driver: Role.DRIVER,
  mechanic: Role.MECHANIC,
  auditor: Role.AUDITOR,
  viewer: Role.VIEWER,
};

function resolveLegacyRole(rawRole: string | undefined | null): Role {
  if (!rawRole) return Role.VIEWER;
  return LEGACY_ROLE_MAP[rawRole.trim().toLowerCase()] ?? Role.VIEWER;
}

/**
 * Issues, rotates, and revokes refresh/access token pairs for
 * programmatic (non-browser) clients such as mobile apps and third-party
 * integrations. Web browser sessions continue to use NextAuth's cookie
 * based JWT strategy (see lib/authOptions.ts) — this service exists
 * alongside it for clients that cannot rely on cookies.
 *
 * Rotation model (OAuth2-style refresh token rotation with reuse
 * detection):
 *   1. Every refresh issues a brand new refresh token AND invalidates
 *      the one that was presented (status: 'rotated').
 *   2. All refresh tokens issued from a single login share a `familyId`.
 *   3. If a refresh token is presented that has already been rotated
 *      (i.e. it is not the current tip of its family), that is treated
 *      as token theft: the entire family is revoked immediately,
 *      forcing re-authentication, and the event is audit-logged.
 */
export class RefreshTokenService {
  constructor(
    private readonly refreshRepo: RefreshTokenRepository = refreshTokenRepository,
    private readonly sessionRepo: SessionRepository = sessionRepository
  ) {}

  async issueTokenPair(params: IssueTokenPairParams): Promise<IssuedTokenPair> {
    const sessionId = randomUUID();
    const session = await this.sessionRepo.createSession({
      userId: params.userId,
      tenantId: params.tenantId,
      sessionId,
      ipAddress: params.ipAddress,
      userAgent: params.userAgent,
      deviceLabel: params.deviceLabel,
      expiresAt: tokenService.generateRefreshTokenExpiry(),
    });

    const familyId = randomUUID();
    const pair = await this.mintPair(
      {
        userId: params.userId,
        tenantId: params.tenantId,
        email: params.email,
        roles: params.roles,
        permissions: params.permissions,
        sessionId,
      },
      familyId,
      params.ipAddress,
      params.userAgent
    );

    await auditLog.log({
      action: 'REFRESH_TOKEN_ISSUED',
      userId: params.userId,
      tenantId: params.tenantId,
      entityType: 'session',
      entityId: session._id,
      metadata: { familyId, ipAddress: params.ipAddress },
    });

    return pair;
  }

  /**
   * Exchanges a presented refresh token for a new access/refresh pair.
   * Throws UnauthorizedError for any invalid, expired, revoked, or
   * already-rotated token; presenting an already-rotated token triggers
   * full-family revocation as a side effect before throwing.
   */
  async rotate(
    presentedToken: string,
    tenantId: string,
    context: { ipAddress?: string; userAgent?: string }
  ): Promise<IssuedTokenPair> {
    const tokenHash = tokenService.hashToken(presentedToken);
    const existing = await this.refreshRepo.findByHash(tokenHash, tenantId);

    if (!existing) {
      throw new UnauthorizedError('Invalid refresh token');
    }
    if (existing.expiresAt.getTime() < Date.now()) {
      throw new UnauthorizedError('Refresh token has expired');
    }
    if (existing.status === 'revoked') {
      throw new UnauthorizedError('Refresh token has been revoked');
    }

    if (existing.status !== 'active') {
      // The token has already been rotated before — this presentation
      // is a replay of a stale token, the textbook signature of a stolen
      // refresh token. Revoke the whole family so the legitimate holder
      // is forced to re-authenticate.
      await this.refreshRepo.revokeFamily(existing.familyId, tenantId, 'Reuse of rotated refresh token detected');
      await this.sessionRepo.revokeBySessionId(
        existing.sessionId,
        tenantId,
        'system',
        'Refresh token reuse detected'
      );
      await auditLog.log({
        action: 'REFRESH_TOKEN_REUSE_DETECTED',
        userId: existing.userId,
        tenantId,
        entityType: 'refresh_token',
        entityId: existing._id,
        metadata: { familyId: existing.familyId },
      });
      throw new UnauthorizedError('Refresh token reuse detected; all sessions in this family have been revoked');
    }

    const session = await this.sessionRepo.findBySessionId(existing.sessionId, tenantId);
    if (!session || session.status !== 'active') {
      throw new UnauthorizedError('Session is no longer active');
    }

    const claims = await this.loadUserClaims(existing.userId);
    if (!claims) {
      await this.refreshRepo.revokeFamily(existing.familyId, tenantId, 'User no longer exists');
      throw new UnauthorizedError('User account no longer exists');
    }

    const rotated = await this.refreshRepo.markRotated(existing._id!, tenantId);
    if (!rotated) {
      throw new UnauthorizedError('Refresh token could not be rotated');
    }

    await this.sessionRepo.touchLastActive(existing.sessionId, tenantId);

    const payload: TokenPayload = {
      userId: existing.userId,
      tenantId,
      email: claims.email,
      roles: claims.roles,
      sessionId: existing.sessionId,
    };

    return this.mintPair(payload, existing.familyId, context.ipAddress, context.userAgent);
  }

  async revoke(presentedToken: string, tenantId: string, reason: string = 'User logout'): Promise<void> {
    const tokenHash = tokenService.hashToken(presentedToken);
    const existing = await this.refreshRepo.findByHash(tokenHash, tenantId);
    if (!existing) return;

    await this.refreshRepo.revokeFamily(existing.familyId, tenantId, reason);
    await this.sessionRepo.revokeBySessionId(existing.sessionId, tenantId, existing.userId, reason);
  }

  async revokeAllForUser(
    userId: string,
    tenantId: string,
    reason: string = 'Revoked by administrator'
  ): Promise<void> {
    await this.refreshRepo.revokeAllForUser(userId, tenantId, reason);
    await this.sessionRepo.revokeAllForUser(userId, tenantId, 'system', undefined, reason);
  }

  private async loadUserClaims(userId: string): Promise<{ email: string; roles: string[] } | null> {
    if (!ObjectId.isValid(userId)) return null;
    const db = await connectToDatabase();
    const admin = await db.collection('tbladmin').findOne({ _id: new ObjectId(userId) });
    if (!admin) return null;
    return {
      email: admin.Email,
      // FIX: resolve the real per-account role via the same legacy map
      // authOptions.ts uses, instead of failing open to super_admin.
      roles: [resolveLegacyRole(admin.Role)],
    };
  }

  private async mintPair(
    payload: TokenPayload,
    familyId: string,
    ipAddress?: string,
    userAgent?: string
  ): Promise<IssuedTokenPair> {
    if (!payload.sessionId) {
      throw new AppError('Cannot mint a token pair without a sessionId', 'MISSING_SESSION_ID', 500);
    }

    const jti = randomUUID();
    const accessToken = tokenService.generateAccessToken(payload, jti);
    const accessTokenExpiresAt = tokenService.generateAccessTokenExpiry();

    const rawRefreshToken = tokenService.generateOpaqueToken();
    const refreshTokenExpiresAt = tokenService.generateRefreshTokenExpiry();

    await this.refreshRepo.createToken(
      {
        tenantId: payload.tenantId,
        userId: payload.userId,
        familyId,
        tokenHash: tokenService.hashToken(rawRefreshToken),
        sessionId: payload.sessionId,
        status: 'active',
        issuedAt: new Date(),
        expiresAt: refreshTokenExpiresAt,
        ipAddress,
        userAgent,
      },
      payload.tenantId
    );

    return {
      accessToken,
      refreshToken: rawRefreshToken,
      accessTokenExpiresAt,
      refreshTokenExpiresAt,
      sessionId: payload.sessionId,
    };
  }
}

export const refreshTokenService = new RefreshTokenService();
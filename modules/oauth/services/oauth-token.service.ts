// modules/oauth/services/oauth-token.service.ts

import { randomUUID } from 'crypto';
import { tokenService } from '@/infrastructure/security/token.service';
import { oauthTokenRepository, OAuthTokenRepository } from '../repositories/oauth-token.repository';
import { oauthClientRepository, OAuthClientRepository } from '../repositories/oauth-client.repository';
import {
  OAuthToken,
  OAuthTokenRequest,
  OAuthTokenResponse,
  OAuthTokenType,
  OAuthTokenStatus,
  OAuthIntrospectionRequest,
  OAuthTokenIntrospection,
} from '../types/oauth-token.types';
import { OAuthClient } from '../types/oauth-client.types';
import { AppError, UnauthorizedError, ValidationError } from '@/server/errors/app.errors';
import { auditLog } from '@/infrastructure/monitoring/audit.logger';

const ACCESS_TOKEN_TTL_SECONDS = 3600; // 1 hour
const REFRESH_TOKEN_TTL_SECONDS = 86400 * 30; // 30 days
const TOKEN_HASH_ALGORITHM = 'sha256';

export class OAuthTokenService {
  constructor(
    private readonly tokenRepo: OAuthTokenRepository = oauthTokenRepository,
    private readonly clientRepo: OAuthClientRepository = oauthClientRepository
  ) {}

  async issueToken(
    request: OAuthTokenRequest,
    ipAddress?: string,
    userAgent?: string
  ): Promise<OAuthTokenResponse> {
    const client = await this.validateClient(request.clientId, request.clientSecret);
    this.validateClientStatus(client);

    switch (request.grantType) {
      case 'client_credentials':
        return this.issueClientCredentialsToken(client, request.scope, ipAddress, userAgent);
      case 'refresh_token':
        return this.issueRefreshToken(request.refreshToken!, client, ipAddress, userAgent);
      default:
        throw new ValidationError(`Unsupported grant type: ${request.grantType}`);
    }
  }

  private async issueClientCredentialsToken(
    client: OAuthClient,
    scope?: string,
    ipAddress?: string,
    userAgent?: string
  ): Promise<OAuthTokenResponse> {
    const scopes = this.resolveScopes(client.scopes, scope);

    const accessToken = await this.createToken(
      client,
      'access_token',
      scopes,
      ACCESS_TOKEN_TTL_SECONDS,
      ipAddress,
      userAgent
    );

    let refreshToken: string | undefined;
    if (client.allowedGrantTypes.includes('refresh_token')) {
      refreshToken = await this.createToken(
        client,
        'refresh_token',
        scopes,
        REFRESH_TOKEN_TTL_SECONDS,
        ipAddress,
        userAgent
      );
    }

    await this.clientRepo.touchLastUsed(client._id!, client.organizationId, ipAddress);

    await auditLog.log({
      action: 'OAUTH_TOKEN_ISSUED',
      userId: 'system',
      tenantId: client.organizationId,
      entityType: 'oauth_token',
      category: 'security',
      severity: 'info',
      metadata: { clientId: client.clientId, grantType: 'client_credentials', scopes },
    });

    return {
      accessToken,
      tokenType: 'Bearer',
      expiresIn: ACCESS_TOKEN_TTL_SECONDS,
      refreshToken,
      scope: scopes.join(' '),
    };
  }

  private async issueRefreshToken(
    refreshToken: string,
    client: OAuthClient,
    ipAddress?: string,
    userAgent?: string
  ): Promise<OAuthTokenResponse> {
    const tokenHash = tokenService.hashToken(refreshToken);
    const existingToken = await this.tokenRepo.findByTokenHash(tokenHash);

    if (!existingToken) {
      throw new UnauthorizedError('Invalid refresh token');
    }

    if (existingToken.clientId !== client.clientId) {
      throw new UnauthorizedError('Refresh token does not belong to this client');
    }

    if (existingToken.status === 'revoked') {
      throw new UnauthorizedError('Refresh token has been revoked');
    }

    if (existingToken.expiresAt < new Date()) {
      throw new UnauthorizedError('Refresh token has expired');
    }

    // Revoke the old refresh token
    await this.tokenRepo.revokeToken(existingToken._id!, client.organizationId, 'Redeemed for new token');

    // Issue new tokens
    return this.issueClientCredentialsToken(
      client,
      existingToken.scopes.join(' '),
      ipAddress,
      userAgent
    );
  }

  private async createToken(
    client: OAuthClient,
    type: OAuthTokenType,
    scopes: string[],
    ttlSeconds: number,
    ipAddress?: string,
    userAgent?: string
  ): Promise<string> {
    const rawToken = tokenService.generateOpaqueToken();
    const tokenHash = tokenService.hashToken(rawToken);
    const now = new Date();
    const expiresAt = new Date(now.getTime() + ttlSeconds * 1000);

    await this.tokenRepo.create(
      {
        tenantId: client.organizationId, // ← ADD THIS
        clientId: client.clientId,
        userId: client.createdBy,
        tokenHash,
        tokenType: type,
        scopes,
        status: 'active',
        issuedAt: now,
        expiresAt,
        ipAddress,
        userAgent,
      },
      client.organizationId,
      client.createdBy
    );

    return rawToken;
  }

  async introspectToken(request: OAuthIntrospectionRequest): Promise<OAuthTokenIntrospection> {
    const tokenHash = tokenService.hashToken(request.token);
    const token = await this.tokenRepo.findByTokenHash(tokenHash);

    if (!token) {
      return { active: false };
    }

    const active = token.status === 'active' && token.expiresAt > new Date();

    return {
      active,
      clientId: token.clientId,
      userId: token.userId,
      scopes: token.scopes,
      exp: Math.floor(token.expiresAt.getTime() / 1000),
      iat: Math.floor(token.issuedAt.getTime() / 1000),
      sub: token.userId,
    };
  }

  async revokeToken(token: string, tenantId: string, reason?: string): Promise<boolean> {
    const tokenHash = tokenService.hashToken(token);
    const existing = await this.tokenRepo.findByTokenHash(tokenHash);

    if (!existing) {
      return false;
    }

    return this.tokenRepo.revokeToken(existing._id!, tenantId, reason);
  }

  private async validateClient(clientId: string, clientSecret: string): Promise<OAuthClient> {
    const client = await this.clientRepo.findByClientId(clientId);
    if (!client) {
      throw new UnauthorizedError('Invalid client credentials');
    }

    const providedHash = tokenService.hashToken(clientSecret);
    if (!tokenService.timingSafeEqualHex(providedHash, client.clientSecretHash)) {
      throw new UnauthorizedError('Invalid client credentials');
    }

    return client;
  }

  private validateClientStatus(client: OAuthClient): void {
    if (client.status === 'revoked') {
      throw new UnauthorizedError('Client has been revoked');
    }

    if (client.status === 'suspended') {
      throw new UnauthorizedError('Client is suspended');
    }

    if (client.expiresAt && client.expiresAt < new Date()) {
      throw new UnauthorizedError('Client has expired');
    }
  }

  private resolveScopes(clientScopes: string[], requestedScope?: string): string[] {
    if (!requestedScope) {
      return clientScopes;
    }

    const requested = requestedScope.split(/\s+/);
    const valid = requested.filter((s) => clientScopes.includes(s));
    return valid.length > 0 ? valid : clientScopes;
  }
}

export const oauthTokenService = new OAuthTokenService();
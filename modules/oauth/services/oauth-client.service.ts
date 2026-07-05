// modules/oauth/services/oauth-client.service.ts

import { randomUUID } from 'crypto';
import { tokenService } from '@/infrastructure/security/token.service';
import { encryptionService } from '@/infrastructure/secrets/encryption.service';
import { oauthClientRepository, OAuthClientRepository } from '../repositories/oauth-client.repository';
import { oauthTokenRepository, OAuthTokenRepository } from '../repositories/oauth-token.repository';
import {
  OAuthClient,
  OAuthClientCreateDTO,
  OAuthClientCreateResult,
  OAuthClientUpdateDTO,
  OAuthClientStatus,
  OAuthGrantType,
} from '../types/oauth-client.types';
import { AppError, ConflictError, NotFoundError, ValidationError } from '@/server/errors/app.errors';
import { auditLog } from '@/infrastructure/monitoring/audit.logger';
import { EventBusFactory } from '@/server/events/bus/EventBusFactory';
import { DomainEvent } from '@/server/events/base/DomainEvent';

const CLIENT_ID_PREFIX = 'fleet_';
const CLIENT_SECRET_LENGTH = 32;
const GRANT_TYPES: OAuthGrantType[] = ['client_credentials', 'authorization_code', 'refresh_token'];

export class OAuthClientService {
  constructor(
    private readonly clientRepo: OAuthClientRepository = oauthClientRepository,
    private readonly tokenRepo: OAuthTokenRepository = oauthTokenRepository
  ) {}

  async createClient(
    data: OAuthClientCreateDTO,
    organizationId: string,
    userId: string
  ): Promise<OAuthClientCreateResult> {
    if (!data.name?.trim()) {
      throw new ValidationError('Client name is required');
    }

    const clientId = `${CLIENT_ID_PREFIX}${randomUUID().replace(/-/g, '').slice(0, 16)}`;
    const clientSecret = tokenService.generateOpaqueToken().slice(0, CLIENT_SECRET_LENGTH);
    const secretHash = tokenService.hashToken(clientSecret);

    const allowedGrantTypes = data.allowedGrantTypes || ['client_credentials'];
    this.validateGrantTypes(allowedGrantTypes);

    const created = await this.clientRepo.create(
      {
        tenantId: organizationId, // ← ADD THIS
        organizationId,
        clientId,
        clientSecretHash: secretHash,
        clientSecretPreview: `...${clientSecret.slice(-4)}`,
        name: data.name.trim(),
        description: data.description,
        redirectUris: data.redirectUris || [],
        allowedGrantTypes,
        scopes: data.scopes || [],
        status: 'active',
        expiresAt: data.expiresAt ? new Date(data.expiresAt) : undefined,
        createdBy: userId,
        metadata: data.metadata,
      },
      organizationId,
      userId
    );

    await auditLog.log({
      action: 'OAUTH_CLIENT_CREATED',
      userId,
      tenantId: organizationId,
      entityType: 'oauth_client',
      entityId: created._id,
      metadata: { clientId: created.clientId, name: created.name },
    });

    const { clientSecretHash, ...safeClient } = created;

    return {
      client: safeClient as Omit<OAuthClient, 'clientSecretHash'>,
      clientSecret,
    };
  }

  async getClient(id: string, organizationId: string): Promise<OAuthClient> {
    const client = await this.clientRepo.findById(id, organizationId);
    if (!client) {
      throw new NotFoundError('OAuth client not found');
    }
    return client;
  }

  async getClientByClientId(clientId: string): Promise<OAuthClient | null> {
    return this.clientRepo.findByClientId(clientId);
  }

  async listClients(organizationId: string, includeRevoked: boolean = false): Promise<OAuthClient[]> {
    return this.clientRepo.findByOrganization(organizationId, includeRevoked);
  }

  async updateClient(
    id: string,
    data: OAuthClientUpdateDTO,
    organizationId: string,
    userId: string
  ): Promise<OAuthClient> {
    const existing = await this.getClient(id, organizationId);

    if (data.allowedGrantTypes) {
      this.validateGrantTypes(data.allowedGrantTypes);
    }

    const updates: Partial<OAuthClient> = {
      ...(data.name !== undefined && { name: data.name.trim() }),
      ...(data.description !== undefined && { description: data.description }),
      ...(data.redirectUris !== undefined && { redirectUris: data.redirectUris }),
      ...(data.allowedGrantTypes !== undefined && { allowedGrantTypes: data.allowedGrantTypes }),
      ...(data.scopes !== undefined && { scopes: data.scopes }),
      ...(data.status !== undefined && { status: data.status }),
      ...(data.expiresAt !== undefined && { expiresAt: data.expiresAt ? new Date(data.expiresAt) : undefined }),
      ...(data.metadata !== undefined && { metadata: data.metadata }),
    };

    const updated = await this.clientRepo.update(id, updates, organizationId, userId);
    if (!updated) {
      throw new NotFoundError('OAuth client not found');
    }

    await auditLog.logUpdate(userId, organizationId, 'oauth_client', id, existing, updated);

    return updated;
  }

  async revokeClient(
    id: string,
    organizationId: string,
    userId: string,
    reason?: string
  ): Promise<boolean> {
    const client = await this.getClient(id, organizationId);

    // Revoke all tokens for this client
    await this.tokenRepo.revokeAllForClient(client.clientId, organizationId, reason);

    const updated = await this.clientRepo.updateStatus(id, organizationId, 'revoked', reason);
    if (!updated) {
      throw new NotFoundError('OAuth client not found');
    }

    await auditLog.log({
      action: 'OAUTH_CLIENT_REVOKED',
      userId,
      tenantId: organizationId,
      entityType: 'oauth_client',
      entityId: id,
      metadata: { clientId: client.clientId, name: client.name, reason },
    });

    return true;
  }

  async rotateSecret(
    id: string,
    organizationId: string,
    userId: string
  ): Promise<{ client: OAuthClient; clientSecret: string }> {
    const existing = await this.getClient(id, organizationId);

    const newSecret = tokenService.generateOpaqueToken().slice(0, CLIENT_SECRET_LENGTH);
    const secretHash = tokenService.hashToken(newSecret);

    const updated = await this.clientRepo.update(
      id,
      {
        clientSecretHash: secretHash,
        clientSecretPreview: `...${newSecret.slice(-4)}`,
      } as Partial<OAuthClient>,
      organizationId,
      userId
    );
    if (!updated) {
      throw new NotFoundError('OAuth client not found');
    }

    await auditLog.log({
      action: 'OAUTH_CLIENT_SECRET_ROTATED',
      userId,
      tenantId: organizationId,
      entityType: 'oauth_client',
      entityId: id,
      metadata: { clientId: existing.clientId, name: existing.name },
    });

    return { client: updated, clientSecret: newSecret };
  }

  async deleteClient(id: string, organizationId: string, userId: string): Promise<boolean> {
    const client = await this.getClient(id, organizationId);

    // Revoke all tokens first
    await this.tokenRepo.revokeAllForClient(client.clientId, organizationId, 'Client deleted');

    const deleted = await this.clientRepo.softDelete(id, organizationId, userId);
    if (!deleted) {
      throw new NotFoundError('OAuth client not found');
    }

    await auditLog.logDelete(userId, organizationId, 'oauth_client', id, {
      clientId: client.clientId,
      name: client.name,
    });

    return true;
  }

  private validateGrantTypes(grantTypes: OAuthGrantType[]): void {
    const invalid = grantTypes.filter((g) => !GRANT_TYPES.includes(g));
    if (invalid.length > 0) {
      throw new ValidationError(`Invalid grant type(s): ${invalid.join(', ')}`);
    }
  }
}

export const oauthClientService = new OAuthClientService();
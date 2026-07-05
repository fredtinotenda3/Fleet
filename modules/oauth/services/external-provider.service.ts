/* eslint-disable @typescript-eslint/no-unused-vars */
// modules/oauth/services/external-provider.service.ts

import { randomUUID } from 'crypto';
import { encryptionService } from '@/infrastructure/secrets/encryption.service';
import {
  externalProviderRepository,
  ExternalProviderRepository,
} from '../repositories/external-provider.repository';
import {
  ExternalProvider,
  ExternalProviderCreateDTO,
  ExternalProviderUpdateDTO,
  ExternalProviderDiscoveryResult,
  ExternalProviderType,
} from '../types/external-provider.types';
import { AppError, ConflictError, NotFoundError, ValidationError } from '@/server/errors/app.errors';
import { auditLog } from '@/infrastructure/monitoring/audit.logger';
import { EventBusFactory } from '@/server/events/bus/EventBusFactory';
import { DomainEvent } from '@/server/events/base/DomainEvent';

const PROVIDER_ID_PREFIX = 'provider_';
const SUPPORTED_TYPES: ExternalProviderType[] = ['oidc', 'saml', 'oauth2'];

export class ExternalProviderService {
  constructor(private readonly repo: ExternalProviderRepository = externalProviderRepository) {}

  async createProvider(
    data: ExternalProviderCreateDTO,
    organizationId: string,
    userId: string
  ): Promise<ExternalProvider> {
    if (!data.name?.trim()) {
      throw new ValidationError('Provider name is required');
    }

    if (!SUPPORTED_TYPES.includes(data.type)) {
      throw new ValidationError(`Unsupported provider type: ${data.type}`);
    }

    if (!data.domainHints || data.domainHints.length === 0) {
      throw new ValidationError('At least one domain hint is required');
    }

    // Try to discover OIDC configuration
    let discovered: Record<string, unknown> | null = null;
    if (data.type === 'oidc') {
      discovered = await this.tryDiscover(data.issuer);
    }

    const providerId = `${PROVIDER_ID_PREFIX}${randomUUID().replace(/-/g, '').slice(0, 12)}`;

    const created = await this.repo.create(
      {
        tenantId: organizationId, // Add this line - using organizationId as tenantId
        organizationId,
        providerId,
        type: data.type,
        name: data.name.trim(),
        description: data.description,
        issuer: data.issuer,
        clientId: data.clientId,
        clientSecretEncrypted: encryptionService.encrypt(data.clientSecret),
        authorizationEndpoint: data.authorizationEndpoint || (discovered?.authorization_endpoint as string),
        tokenEndpoint: data.tokenEndpoint || (discovered?.token_endpoint as string),
        userinfoEndpoint: data.userinfoEndpoint || (discovered?.userinfo_endpoint as string),
        jwksUri: data.jwksUri || (discovered?.jwks_uri as string),
        scopes: data.scopes || ['openid', 'profile', 'email'],
        domainHints: data.domainHints.map((d) => d.toLowerCase()),
        status: 'active',
        defaultRole: data.defaultRole || 'viewer',
        metadata: data.metadata,
        wellKnownConfig: discovered,
      },
      organizationId,
      userId
    );

    await auditLog.log({
      action: 'EXTERNAL_PROVIDER_CREATED',
      userId,
      tenantId: organizationId,
      entityType: 'external_provider',
      entityId: created._id,
      metadata: { providerId: created.providerId, name: created.name, type: created.type },
    });

    const { clientSecretEncrypted, ...safe } = created;
    return safe as ExternalProvider;
  }

  async getProvider(id: string, organizationId: string): Promise<ExternalProvider> {
    const provider = await this.repo.findById(id, organizationId);
    if (!provider) {
      throw new NotFoundError('External provider not found');
    }
    const { clientSecretEncrypted, ...safe } = provider;
    return safe as ExternalProvider;
  }

  async getProviderByProviderId(providerId: string): Promise<ExternalProvider | null> {
    return this.repo.findByProviderId(providerId);
  }

  async listProviders(organizationId: string, activeOnly: boolean = false): Promise<ExternalProvider[]> {
    const providers = activeOnly
      ? await this.repo.findActiveByOrganization(organizationId)
      : await this.repo.findByOrganization(organizationId);

    return providers.map(({ clientSecretEncrypted, ...rest }) => rest as ExternalProvider);
  }

  async updateProvider(
    id: string,
    data: ExternalProviderUpdateDTO,
    organizationId: string,
    userId: string
  ): Promise<ExternalProvider> {
    const existing = await this.repo.findById(id, organizationId);
    if (!existing) {
      throw new NotFoundError('External provider not found');
    }

    const updates: Partial<ExternalProvider> = {
      ...(data.name !== undefined && { name: data.name.trim() }),
      ...(data.description !== undefined && { description: data.description }),
      ...(data.issuer !== undefined && { issuer: data.issuer }),
      ...(data.clientId !== undefined && { clientId: data.clientId }),
      ...(data.clientSecret !== undefined && {
        clientSecretEncrypted: encryptionService.encrypt(data.clientSecret),
      }),
      ...(data.authorizationEndpoint !== undefined && { authorizationEndpoint: data.authorizationEndpoint }),
      ...(data.tokenEndpoint !== undefined && { tokenEndpoint: data.tokenEndpoint }),
      ...(data.userinfoEndpoint !== undefined && { userinfoEndpoint: data.userinfoEndpoint }),
      ...(data.jwksUri !== undefined && { jwksUri: data.jwksUri }),
      ...(data.scopes !== undefined && { scopes: data.scopes }),
      ...(data.domainHints !== undefined && { domainHints: data.domainHints.map((d) => d.toLowerCase()) }),
      ...(data.status !== undefined && { status: data.status }),
      ...(data.defaultRole !== undefined && { defaultRole: data.defaultRole }),
      ...(data.metadata !== undefined && { metadata: data.metadata }),
    };

    const updated = await this.repo.update(id, updates, organizationId, userId);
    if (!updated) {
      throw new NotFoundError('External provider not found');
    }

    await auditLog.logUpdate(userId, organizationId, 'external_provider', id, existing, updated);

    const { clientSecretEncrypted, ...safe } = updated;
    return safe as ExternalProvider;
  }

  async deleteProvider(id: string, organizationId: string, userId: string): Promise<boolean> {
    const existing = await this.repo.findById(id, organizationId);
    if (!existing) {
      throw new NotFoundError('External provider not found');
    }

    const deleted = await this.repo.softDelete(id, organizationId, userId);
    if (!deleted) {
      throw new NotFoundError('External provider not found');
    }

    await auditLog.logDelete(userId, organizationId, 'external_provider', id, {
      providerId: existing.providerId,
      name: existing.name,
    });

    return true;
  }

  async discoverByEmail(email: string, organizationId: string): Promise<ExternalProviderDiscoveryResult> {
    const domain = email.split('@')[1]?.toLowerCase();
    if (!domain) {
      return { available: false };
    }

    const provider = await this.repo.findActiveByDomainHint(domain);
    if (!provider) {
      return { available: false };
    }

    return {
      available: true,
      providerId: provider.providerId,
      name: provider.name,
      type: provider.type,
      loginHint: `Sign in with ${provider.name}`,
    };
  }

  async getProviderConfig(providerId: string): Promise<{
    provider: ExternalProvider;
    clientSecret: string;
  } | null> {
    const provider = await this.repo.findByProviderId(providerId);
    if (!provider || provider.status !== 'active') {
      return null;
    }

    return {
      provider,
      clientSecret: encryptionService.decrypt(provider.clientSecretEncrypted),
    };
  }

  private async tryDiscover(issuer: string): Promise<Record<string, unknown> | null> {
    try {
      const wellKnownUrl = `${issuer.replace(/\/$/, '')}/.well-known/openid-configuration`;
      const response = await fetch(wellKnownUrl, {
        signal: AbortSignal.timeout(5000),
        headers: { Accept: 'application/json' },
      });
      if (!response.ok) return null;
      return (await response.json()) as Record<string, unknown>;
    } catch {
      return null;
    }
  }
}

export const externalProviderService = new ExternalProviderService();
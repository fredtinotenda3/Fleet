// modules/security/services/sso.service.ts

import { ssoConnectionRepository, SsoConnectionRepository } from '../repositories/sso-connection.repository';
import { encryptionService, EncryptionService } from '@/infrastructure/secrets/encryption.service';
import {
  SsoConnection,
  SsoConnectionCreateDTO,
  SsoConnectionUpdateDTO,
  SsoDiscoveryResult,
} from '../types/sso.types';
import { NotFoundError, ValidationError } from '@/server/errors/app.errors';
import { auditLog } from '@/infrastructure/monitoring/audit.logger';

interface OidcDiscoveryDocument {
  authorization_endpoint?: string;
  token_endpoint?: string;
  userinfo_endpoint?: string;
  jwks_uri?: string;
}

/**
 * CRUD + OIDC discovery for per-organization SSO connections. This is
 * scaffolding for enterprise SSO: it manages connection configuration
 * and secret storage, and exposes resolveForAuth() for the NextAuth
 * route handler to construct a runtime provider from (see
 * lib/sso-provider.factory.ts). Wiring a fully certified SAML/OIDC
 * identity federation flow (SCIM provisioning, signed assertion
 * validation, cross-org session federation policy) is out of scope for
 * this slice — see app/api/auth/[...nextauth]/route.ts for the
 * integration point and its accompanying caveats.
 */
export class SsoService {
  constructor(
    private readonly repo: SsoConnectionRepository = ssoConnectionRepository,
    private readonly encryption: EncryptionService = encryptionService
  ) {}

  async create(data: SsoConnectionCreateDTO, tenantId: string, userId: string): Promise<SsoConnection> {
    if (!data.domainHints || data.domainHints.length === 0) {
      throw new ValidationError('At least one domain hint is required to route users to this connection');
    }

    const discovered = await this.tryDiscover(data.issuer);

    const created = await this.repo.create(
      {
        tenantId,
        organizationId: data.organizationId,
        provider: 'oidc',
        displayName: data.displayName,
        issuer: data.issuer,
        clientId: data.clientId,
        clientSecretEncrypted: this.encryption.encrypt(data.clientSecret),
        authorizationEndpoint: data.authorizationEndpoint || discovered?.authorization_endpoint,
        tokenEndpoint: data.tokenEndpoint || discovered?.token_endpoint,
        userinfoEndpoint: data.userinfoEndpoint || discovered?.userinfo_endpoint,
        jwksUri: data.jwksUri || discovered?.jwks_uri,
        scopes: data.scopes && data.scopes.length > 0 ? data.scopes : ['openid', 'profile', 'email'],
        domainHints: data.domainHints.map((d) => d.toLowerCase()),
        status: 'active',
        defaultRole: data.defaultRole || 'viewer',
      },
      tenantId,
      userId
    );

    await auditLog.log({
      action: 'SSO_CONNECTION_CREATED',
      userId,
      tenantId,
      entityType: 'sso_connection',
      entityId: created._id,
      category: 'security',
      severity: 'info',
      metadata: { issuer: data.issuer, domainHints: data.domainHints },
    });

    return created;
  }

  async update(id: string, data: SsoConnectionUpdateDTO, tenantId: string, userId: string): Promise<SsoConnection> {
    const existing = await this.repo.findById(id, tenantId);
    if (!existing) {
      throw new NotFoundError('SSO connection not found');
    }

    const updates: Partial<Omit<SsoConnection, '_id' | 'tenantId' | 'createdAt' | 'createdBy'>> = {
      ...(data.displayName !== undefined && { displayName: data.displayName }),
      ...(data.clientSecret !== undefined && { clientSecretEncrypted: this.encryption.encrypt(data.clientSecret) }),
      ...(data.authorizationEndpoint !== undefined && { authorizationEndpoint: data.authorizationEndpoint }),
      ...(data.tokenEndpoint !== undefined && { tokenEndpoint: data.tokenEndpoint }),
      ...(data.userinfoEndpoint !== undefined && { userinfoEndpoint: data.userinfoEndpoint }),
      ...(data.jwksUri !== undefined && { jwksUri: data.jwksUri }),
      ...(data.scopes !== undefined && { scopes: data.scopes }),
      ...(data.domainHints !== undefined && { domainHints: data.domainHints.map((d) => d.toLowerCase()) }),
      ...(data.status !== undefined && { status: data.status }),
      ...(data.defaultRole !== undefined && { defaultRole: data.defaultRole }),
    };

    const updated = await this.repo.update(id, updates, tenantId, userId);
    if (!updated) {
      throw new NotFoundError('SSO connection not found');
    }

    await auditLog.log({
      action: 'SSO_CONNECTION_UPDATED',
      userId,
      tenantId,
      entityType: 'sso_connection',
      entityId: id,
      category: 'security',
      severity: 'info',
    });

    return updated;
  }

  async delete(id: string, tenantId: string, userId: string): Promise<void> {
    const deleted = await this.repo.softDelete(id, tenantId, userId);
    if (!deleted) {
      throw new NotFoundError('SSO connection not found');
    }
    await auditLog.log({
      action: 'SSO_CONNECTION_DELETED',
      userId,
      tenantId,
      entityType: 'sso_connection',
      entityId: id,
      category: 'security',
      severity: 'warning',
    });
  }

  async list(organizationId: string): Promise<Omit<SsoConnection, 'clientSecretEncrypted'>[]> {
    const connections = await this.repo.findByOrganization(organizationId);
    return connections.map(({ clientSecretEncrypted, ...rest }) => rest);
  }

  async get(id: string, tenantId: string): Promise<Omit<SsoConnection, 'clientSecretEncrypted'>> {
    const connection = await this.repo.findById(id, tenantId);
    if (!connection) {
      throw new NotFoundError('SSO connection not found');
    }
    const { clientSecretEncrypted, ...safe } = connection;
    return safe;
  }

  /** Public-safe lookup used by the pre-login discovery endpoint. */
  async discoverByEmail(email: string): Promise<SsoDiscoveryResult> {
    const domain = email.split('@')[1]?.toLowerCase();
    if (!domain) return { ssoAvailable: false };

    const connection = await this.repo.findActiveByDomainHint(domain);
    if (!connection) return { ssoAvailable: false };

    return {
      ssoAvailable: true,
      connectionId: connection._id,
      displayName: connection.displayName,
    };
  }

  /**
   * Resolves a connection by id (unscoped — used only by the NextAuth
   * route handler at auth time, before a tenant context exists) and
   * returns everything needed to build a runtime OAuth provider config,
   * with the client secret decrypted for that single request only.
   */
  async resolveForAuth(connectionId: string): Promise<{ connection: SsoConnection; clientSecret: string } | null> {
    const connection = await this.repo.findByIdUnscoped(connectionId);
    if (!connection || connection.status !== 'active') return null;
    return { connection, clientSecret: this.encryption.decrypt(connection.clientSecretEncrypted) };
  }

  private async tryDiscover(issuer: string): Promise<OidcDiscoveryDocument | null> {
    try {
      const wellKnownUrl = `${issuer.replace(/\/$/, '')}/.well-known/openid-configuration`;
      const response = await fetch(wellKnownUrl, { signal: AbortSignal.timeout(5000) });
      if (!response.ok) return null;
      return (await response.json()) as OidcDiscoveryDocument;
    } catch (error) {
      console.warn(`[SsoService] OIDC discovery failed for issuer "${issuer}":`, error);
      return null;
    }
  }
}

export const ssoService = new SsoService();
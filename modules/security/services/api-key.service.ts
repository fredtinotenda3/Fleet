// modules/security/services/api-key.service.ts

import { randomUUID } from 'crypto';
import { tokenService } from '@/infrastructure/security/token.service';
import { apiKeyRepository, ApiKeyRepository } from '../repositories/api-key.repository';
import { ApiKey, ApiKeyCreateDTO, ApiKeyCreateResult } from '../types/api-key.types';
import { Permission } from '@/server/permissions/roles';
import { AppError, NotFoundError, ValidationError } from '@/server/errors/app.errors';
import { EventBusFactory } from '@/server/events/bus/EventBusFactory';
import { ApiKeyCreatedEvent, ApiKeyRevokedEvent } from '../events/api-key.events';
import { auditLog } from '@/infrastructure/monitoring/audit.logger';
import { permissionRegistry } from '../registry/PermissionRegistry';
import { bootstrapPermissionRegistry } from '../registry/bootstrap-permission-registry';

bootstrapPermissionRegistry();

const KEY_PREFIX = 'fk_live';

export class ApiKeyService {
  constructor(private readonly repo: ApiKeyRepository = apiKeyRepository) {}

  async createApiKey(
    data: ApiKeyCreateDTO,
    organizationId: string,
    createdByUserId: string
  ): Promise<ApiKeyCreateResult> {
    if (!data.name?.trim()) {
      throw new ValidationError('API key name is required');
    }
    if (!data.permissions || data.permissions.length === 0) {
      throw new ValidationError('At least one permission must be granted to the API key');
    }

    const staticPermissionValues = Object.values(Permission) as string[];
    const unknownPermissions = data.permissions.filter(
      (p) => !staticPermissionValues.includes(p) && !permissionRegistry.isRegistered(p)
    );
    if (unknownPermissions.length > 0) {
      throw new ValidationError(`Unknown permission key(s): ${unknownPermissions.join(', ')}`);
    }

    const secret = tokenService.generateOpaqueToken();
    const identifier = randomUUID().replace(/-/g, '').slice(0, 12);
    const plaintextKey = `${KEY_PREFIX}_${identifier}_${secret}`;
    const keyHash = tokenService.hashToken(plaintextKey);

    const created = await this.repo.create(
      {
        tenantId: organizationId,
        organizationId,
        name: data.name.trim(),
        keyPrefix: `${KEY_PREFIX}_${identifier}`,
        keyHash,
        permissions: data.permissions,
        status: 'active',
        createdByUserId,
        expiresAt: data.expiresAt ? new Date(data.expiresAt) : null,
      },
      organizationId,
      createdByUserId
    );

    const eventBus = EventBusFactory.getInstance();
    await eventBus.publish(
      new ApiKeyCreatedEvent(created._id!, created.name, organizationId, {
        userId: createdByUserId,
      })
    );

    await auditLog.log({
      action: 'API_KEY_CREATED',
      userId: createdByUserId,
      tenantId: organizationId,
      entityType: 'api_key',
      entityId: created._id,
      metadata: { name: created.name, permissions: created.permissions, keyPrefix: created.keyPrefix },
    });

    const { keyHash: _omit, ...safeKey } = created;
    return { apiKey: safeKey, plaintextKey };
  }

  async listForOrganization(
    organizationId: string,
    includeRevoked: boolean = false
  ): Promise<Omit<ApiKey, 'keyHash'>[]> {
    const keys = await this.repo.findByOrganization(organizationId, includeRevoked);
    return keys.map(({ keyHash, ...rest }) => rest);
  }

  async getById(id: string, organizationId: string): Promise<Omit<ApiKey, 'keyHash'>> {
    const key = await this.repo.findById(id, organizationId, false, true);
    if (!key) {
      throw new NotFoundError('API key not found');
    }
    const { keyHash, ...safe } = key;
    return safe;
  }

  async revoke(id: string, organizationId: string, revokedByUserId: string, reason?: string): Promise<void> {
    const key = await this.repo.findById(id, organizationId, false, true);
    if (!key) {
      throw new NotFoundError('API key not found');
    }

    const revoked = await this.repo.revoke(id, organizationId, revokedByUserId, reason);
    if (!revoked) {
      throw new AppError('API key could not be revoked (already revoked?)', 'ALREADY_REVOKED', 409);
    }

    const eventBus = EventBusFactory.getInstance();
    await eventBus.publish(
      new ApiKeyRevokedEvent(id, key.name, organizationId, { userId: revokedByUserId, reason })
    );

    await auditLog.log({
      action: 'API_KEY_REVOKED',
      userId: revokedByUserId,
      tenantId: organizationId,
      entityType: 'api_key',
      entityId: id,
      metadata: { name: key.name, reason },
    });
  }

  /**
   * Validates a presented API key of the form
   * `fk_live_<identifier>_<secret>` and returns the underlying ApiKey
   * record if it is active, unexpired, and its hash matches. Also
   * opportunistically flips an expired-but-still-"active" key to
   * 'expired' so listings stay accurate without a separate sweep job for
   * the common "someone tries to use an old key" path.
   */
  async verifyKey(plaintextKey: string, ip?: string): Promise<ApiKey | null> {
    if (!plaintextKey.startsWith(`${KEY_PREFIX}_`)) return null;

    const parts = plaintextKey.split('_');
    if (parts.length < 4) return null;
    const keyPrefix = `${parts[0]}_${parts[1]}_${parts[2]}`;

    const record = await this.repo.findByPrefix(keyPrefix);
    if (!record) return null;
    if (record.status === 'revoked') return null;

    if (record.expiresAt && record.expiresAt.getTime() < Date.now()) {
      if (record.status === 'active') {
        await this.repo.revoke(record._id!, record.organizationId, 'system', 'Expired');
      }
      return null;
    }

    const presentedHash = tokenService.hashToken(plaintextKey);
    if (!tokenService.timingSafeEqualHex(presentedHash, record.keyHash)) {
      return null;
    }

    await this.repo.touchLastUsed(record._id!, record.organizationId, ip);
    return record;
  }
}

export const apiKeyService = new ApiKeyService();
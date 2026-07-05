// modules/security/services/resource-permission.service.ts

import {
  resourcePermissionRepository,
  ResourcePermissionRepository,
} from '../repositories/resource-permission.repository';
import {
  ResourcePermission,
  ResourcePermissionCreateDTO,
  ResourcePermissionFilters,
} from '../types/resource-permission.types';
import { NotFoundError, ValidationError } from '@/server/errors/app.errors';
import { EventBusFactory } from '@/server/events/bus/EventBusFactory';
import { ResourcePermissionGrantedEvent } from '../events/ResourcePermissionGrantedEvent';
import { ResourcePermissionRevokedEvent } from '../events/ResourcePermissionRevokedEvent';
import { permissionRegistry } from '../registry/PermissionRegistry';
import { bootstrapPermissionRegistry } from '../registry/bootstrap-permission-registry';
import { auditLog } from '@/infrastructure/monitoring/audit.logger';

bootstrapPermissionRegistry();

export class ResourcePermissionService {
  constructor(private readonly repo: ResourcePermissionRepository = resourcePermissionRepository) {}

  async grant(
    data: ResourcePermissionCreateDTO,
    tenantId: string,
    userId: string
  ): Promise<ResourcePermission> {
    if (!permissionRegistry.isRegistered(data.permission)) {
      throw new ValidationError(`Unknown permission key: ${data.permission}`);
    }

    const created = await this.repo.create(
      {
        tenantId,
        organizationId: tenantId,
        subjectType: data.subjectType,
        subjectId: data.subjectId,
        permission: data.permission,
        effect: data.effect,
        resourceType: data.resourceType,
        resourceId: data.resourceId,
        orgUnitId: data.orgUnitId,
        conditions: data.conditions,
        expiresAt: data.expiresAt ? new Date(data.expiresAt) : null,
        reason: data.reason,
        grantedBy: userId,
      },
      tenantId,
      userId
    );

    const eventBus = EventBusFactory.getInstance();
    await eventBus.publish(new ResourcePermissionGrantedEvent(created, { tenantId, userId }));

    await auditLog.log({
      action: 'RESOURCE_PERMISSION_GRANTED',
      userId,
      tenantId,
      entityType: 'resource_permission',
      entityId: created._id,
      metadata: {
        subjectType: created.subjectType,
        subjectId: created.subjectId,
        permission: created.permission,
        effect: created.effect,
      },
    });

    return created;
  }

  async revoke(id: string, tenantId: string, userId: string): Promise<void> {
    const existing = await this.repo.findById(id, tenantId);
    if (!existing) {
      throw new NotFoundError('Resource permission grant not found');
    }

    await this.repo.revoke(id, tenantId, userId);

    const eventBus = EventBusFactory.getInstance();
    await eventBus.publish(
      new ResourcePermissionRevokedEvent(id, existing.subjectId, existing.permission, tenantId, { userId })
    );

    await auditLog.log({
      action: 'RESOURCE_PERMISSION_REVOKED',
      userId,
      tenantId,
      entityType: 'resource_permission',
      entityId: id,
      metadata: { subjectId: existing.subjectId, permission: existing.permission },
    });
  }

  async list(filters: ResourcePermissionFilters): Promise<ResourcePermission[]> {
    return this.repo.findByFilters(filters);
  }

  async get(id: string, tenantId: string): Promise<ResourcePermission> {
    const grant = await this.repo.findById(id, tenantId);
    if (!grant) {
      throw new NotFoundError('Resource permission grant not found');
    }
    return grant;
  }
}

export const resourcePermissionService = new ResourcePermissionService();
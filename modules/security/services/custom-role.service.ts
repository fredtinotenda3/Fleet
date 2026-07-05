// modules/security/services/custom-role.service.ts

import { customRoleRepository, CustomRoleRepository } from '../repositories/custom-role.repository';
import { CustomRole, CustomRoleCreateDTO, CustomRoleUpdateDTO } from '../types/custom-role.types';
import { ConflictError, NotFoundError, ValidationError } from '@/server/errors/app.errors';
import { EventBusFactory } from '@/server/events/bus/EventBusFactory';
import { CustomRoleCreatedEvent } from '../events/CustomRoleCreatedEvent';
import { CustomRoleUpdatedEvent } from '../events/CustomRoleUpdatedEvent';
import { CustomRoleDeletedEvent } from '../events/CustomRoleDeletedEvent';
import { permissionRegistry } from '../registry/PermissionRegistry';
import { bootstrapPermissionRegistry } from '../registry/bootstrap-permission-registry';
import { auditLog } from '@/infrastructure/monitoring/audit.logger';

bootstrapPermissionRegistry();

export class CustomRoleService {
  constructor(private readonly repo: CustomRoleRepository = customRoleRepository) {}

  async createRole(data: CustomRoleCreateDTO, tenantId: string, userId: string): Promise<CustomRole> {
    if (!data.name?.trim()) {
      throw new ValidationError('Role name is required');
    }

    const existing = await this.repo.findByName(data.name.trim(), tenantId);
    if (existing) {
      throw new ConflictError(`A role named "${data.name}" already exists`);
    }

    this.validateCustomPermissionKeys(data.customPermissionKeys || []);

    const role = await this.repo.create(
      {
        tenantId,
        organizationId: tenantId,
        name: data.name.trim(),
        description: data.description,
        baseRole: data.baseRole,
        permissions: data.permissions || [],
        customPermissionKeys: data.customPermissionKeys || [],
        scopeType: data.scopeType || 'organization',
        isSystem: false,
        status: 'active',
        version: 1,
      },
      tenantId,
      userId
    );

    const eventBus = EventBusFactory.getInstance();
    await eventBus.publish(new CustomRoleCreatedEvent(role, { tenantId, userId }));

    await auditLog.log({
      action: 'CUSTOM_ROLE_CREATED',
      userId,
      tenantId,
      entityType: 'custom_role',
      entityId: role._id,
      metadata: { name: role.name },
    });

    return role;
  }

  async updateRole(
    id: string,
    data: CustomRoleUpdateDTO,
    tenantId: string,
    userId: string
  ): Promise<CustomRole> {
    const existing = await this.repo.findById(id, tenantId);
    if (!existing) {
      throw new NotFoundError('Custom role not found');
    }
    if (existing.isSystem) {
      throw new ValidationError('System roles cannot be modified');
    }
    if (data.customPermissionKeys) {
      this.validateCustomPermissionKeys(data.customPermissionKeys);
    }

    const updates: Partial<Omit<CustomRole, '_id' | 'tenantId' | 'createdAt' | 'createdBy'>> = {
      ...(data.name !== undefined && { name: data.name }),
      ...(data.description !== undefined && { description: data.description }),
      ...(data.baseRole !== undefined && { baseRole: data.baseRole === null ? undefined : data.baseRole }),
      ...(data.permissions !== undefined && { permissions: data.permissions }),
      ...(data.customPermissionKeys !== undefined && { customPermissionKeys: data.customPermissionKeys }),
      ...(data.scopeType !== undefined && { scopeType: data.scopeType }),
      ...(data.status !== undefined && { status: data.status }),
    };

    const updated = await this.repo.bumpVersion(id, tenantId, updates, userId);
    if (!updated) {
      throw new NotFoundError('Custom role not found');
    }

    const eventBus = EventBusFactory.getInstance();
    await eventBus.publish(new CustomRoleUpdatedEvent(updated, data, { tenantId, userId }));

    await auditLog.logUpdate(userId, tenantId, 'custom_role', id, existing, updated);

    return updated;
  }

  async deleteRole(id: string, tenantId: string, userId: string): Promise<void> {
    const existing = await this.repo.findById(id, tenantId);
    if (!existing) {
      throw new NotFoundError('Custom role not found');
    }
    if (existing.isSystem) {
      throw new ValidationError('System roles cannot be deleted');
    }

    await this.repo.softDelete(id, tenantId, userId);

    const eventBus = EventBusFactory.getInstance();
    await eventBus.publish(new CustomRoleDeletedEvent(id, existing.name, tenantId, { userId }));

    await auditLog.logDelete(userId, tenantId, 'custom_role', id, { name: existing.name });
  }

  async getRole(id: string, tenantId: string): Promise<CustomRole> {
    const role = await this.repo.findById(id, tenantId);
    if (!role) {
      throw new NotFoundError('Custom role not found');
    }
    return role;
  }

  async listRoles(tenantId: string, activeOnly: boolean = true): Promise<CustomRole[]> {
    return this.repo.findByOrganization(tenantId, activeOnly);
  }

  private validateCustomPermissionKeys(keys: string[]): void {
    const unknown = keys.filter((key) => !permissionRegistry.isRegistered(key));
    if (unknown.length > 0) {
      throw new ValidationError(`Unknown permission key(s): ${unknown.join(', ')}`);
    }
  }
}

export const customRoleService = new CustomRoleService();
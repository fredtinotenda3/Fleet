// modules/security/services/user-scope.service.ts

import {
  userScopeAssignmentRepository,
  UserScopeAssignmentRepository,
} from '../repositories/user-scope-assignment.repository';
import { orgUnitRepository, OrgUnitRepository } from '../repositories/org-unit.repository';
import { customRoleRepository, CustomRoleRepository } from '../repositories/custom-role.repository';
import { UserScopeAssignment, UserScopeAssignmentCreateDTO } from '../types/user-scope-assignment.types';
import { ConflictError, NotFoundError, ValidationError } from '@/server/errors/app.errors';
import { EventBusFactory } from '@/server/events/bus/EventBusFactory';
import { UserScopeAssignedEvent } from '../events/UserScopeAssignedEvent';
import { UserScopeRevokedEvent } from '../events/UserScopeRevokedEvent';
import { rolePermissions } from '@/server/permissions/roles';
import { auditLog } from '@/infrastructure/monitoring/audit.logger';

export class UserScopeService {
  constructor(
    private readonly repo: UserScopeAssignmentRepository = userScopeAssignmentRepository,
    private readonly orgUnitRepo: OrgUnitRepository = orgUnitRepository,
    private readonly customRoleRepo: CustomRoleRepository = customRoleRepository
  ) {}

  async assign(
    data: UserScopeAssignmentCreateDTO,
    tenantId: string,
    assignedBy: string
  ): Promise<UserScopeAssignment> {
    const orgUnit = await this.orgUnitRepo.findById(data.orgUnitId, tenantId);
    if (!orgUnit) {
      throw new NotFoundError('Org unit not found');
    }

    const isCustomRole = data.isCustomRole ?? false;
    if (isCustomRole) {
      const role = await this.customRoleRepo.findById(data.role, tenantId);
      if (!role) {
        throw new NotFoundError('Custom role not found');
      }
    } else if (!(data.role in rolePermissions)) {
      throw new ValidationError(`Unknown static role: ${data.role}`);
    }

    const existing = await this.repo.findByUserAndOrgUnit(data.userId, data.orgUnitId, tenantId);
    if (existing) {
      throw new ConflictError('This user already has a role assignment for this org unit');
    }

    const created = await this.repo.create(
      {
        tenantId,
        organizationId: tenantId,
        userId: data.userId,
        orgUnitId: data.orgUnitId,
        role: data.role,
        isCustomRole,
        assignedBy,
      },
      tenantId,
      assignedBy
    );

    const eventBus = EventBusFactory.getInstance();
    await eventBus.publish(new UserScopeAssignedEvent(created, { tenantId, userId: assignedBy }));

    await auditLog.log({
      action: 'USER_SCOPE_ASSIGNED',
      userId: assignedBy,
      tenantId,
      entityType: 'user_scope_assignment',
      entityId: created._id,
      metadata: { targetUserId: data.userId, orgUnitId: data.orgUnitId, role: data.role },
    });

    return created;
  }

  async revoke(id: string, tenantId: string, revokedBy: string): Promise<void> {
    const existing = await this.repo.findById(id, tenantId);
    if (!existing) {
      throw new NotFoundError('Scope assignment not found');
    }

    await this.repo.revokeAssignment(id, tenantId, revokedBy);

    const eventBus = EventBusFactory.getInstance();
    await eventBus.publish(
      new UserScopeRevokedEvent(id, existing.userId, existing.orgUnitId, tenantId, { userId: revokedBy })
    );

    await auditLog.log({
      action: 'USER_SCOPE_REVOKED',
      userId: revokedBy,
      tenantId,
      entityType: 'user_scope_assignment',
      entityId: id,
      metadata: { targetUserId: existing.userId, orgUnitId: existing.orgUnitId },
    });
  }

  async listForUser(userId: string, tenantId: string): Promise<UserScopeAssignment[]> {
    return this.repo.findByUser(userId, tenantId);
  }

  async listForOrgUnit(orgUnitId: string, tenantId: string): Promise<UserScopeAssignment[]> {
    return this.repo.findByOrgUnit(orgUnitId, tenantId);
  }
}

export const userScopeService = new UserScopeService();
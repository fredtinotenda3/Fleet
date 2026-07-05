// modules/security/services/permission-engine.service.ts

import { permissionService, Permission } from '@/server/permissions/roles';
import {
  resourcePermissionRepository,
  ResourcePermissionRepository,
} from '../repositories/resource-permission.repository';
import { customRoleRepository, CustomRoleRepository } from '../repositories/custom-role.repository';
import {
  userScopeAssignmentRepository,
  UserScopeAssignmentRepository,
} from '../repositories/user-scope-assignment.repository';
import { orgUnitRepository, OrgUnitRepository } from '../repositories/org-unit.repository';
import { abacEvaluatorService, AbacEvaluatorService } from './abac-evaluator.service';
import { permissionCacheService, PermissionCacheService } from './permission-cache.service';
import { PermissionCheckParams, PermissionDecision } from '../types/resource-permission.types';
import { AbacEvaluationContext } from '../types/abac.types';
import { CustomRole } from '../types/custom-role.types';
import { UserScopeAssignment } from '../types/user-scope-assignment.types';
import { monitoring } from '@/infrastructure/monitoring/logger';
import { bootstrapPermissionRegistry } from '../registry/bootstrap-permission-registry';

bootstrapPermissionRegistry();

/**
 * Core access-control decision point. Combines, in order:
 *   1. Super-admin bypass.
 *   2. Explicit resource-level grants/denials (ResourcePermission),
 *      including any ABAC conditions attached to them, with org-unit
 *      inheritance (a grant at a branch cascades to its departments and
 *      fleets). An explicit `deny` always wins.
 *   3. Static RBAC (the existing Permission enum + role-permission map).
 *   4. Dynamic custom-role membership (organization-wide or scoped to
 *      the resource's org unit).
 *   5. Default deny.
 *
 * Every call is cached briefly (see PermissionCacheService) and the
 * cache is invalidated on any write to roles, grants, assignments, or
 * org units (see PermissionCacheInvalidationHandler).
 */
export class PermissionEngineService {
  constructor(
    private readonly resourcePermissionRepo: ResourcePermissionRepository = resourcePermissionRepository,
    private readonly customRoleRepo: CustomRoleRepository = customRoleRepository,
    private readonly userScopeRepo: UserScopeAssignmentRepository = userScopeAssignmentRepository,
    private readonly orgUnitRepo: OrgUnitRepository = orgUnitRepository,
    private readonly abacEvaluator: AbacEvaluatorService = abacEvaluatorService,
    private readonly cache: PermissionCacheService = permissionCacheService
  ) {}

  async can(params: PermissionCheckParams): Promise<PermissionDecision> {
    if (params.isSuperAdmin) {
      return this.decide(true, 'Super admin bypass', 'super_admin');
    }

    const cached = await this.cache.get(params).catch(() => null);
    if (cached) {
      return cached;
    }

    const decision = await this.evaluate(params);
    await this.cache.set(params, decision).catch(() => undefined);
    return decision;
  }

  private async evaluate(params: PermissionCheckParams): Promise<PermissionDecision> {
    const { tenantId, userId, roles, permission, resource } = params;

    const userCustomRoles = await this.getUserCustomRoles(userId, tenantId, resource?.orgUnitId);
    const customRoleIds = userCustomRoles.map((role) => role._id!);
    const subjectIds = [userId, ...roles, ...customRoleIds];

    let orgUnitPath: string[] = [];
    if (resource?.orgUnitId) {
      orgUnitPath = await this.orgUnitRepo.getPath(resource.orgUnitId, tenantId).catch(() => []);
      if (orgUnitPath.length === 0) orgUnitPath = [resource.orgUnitId];
    }

    const grants = await this.resourcePermissionRepo
      .findApplicableGrants({
        organizationId: tenantId,
        permission,
        subjectIds,
        resourceType: resource?.type,
        resourceId: resource?.id,
        orgUnitPath,
      })
      .catch((error) => {
        monitoring.logError('[PermissionEngine] Failed to load resource grants', error as Error, {
          tenantId,
          permission,
        });
        return [];
      });

    const abacContext: AbacEvaluationContext = {
      user: { id: userId, roles, ...(params.userAttributes || {}) },
      resource: resource?.attributes || {},
      environment: { now: new Date().toISOString() },
    };

    const applicableGrants = grants.filter(
      (grant) => this.abacEvaluator.evaluate(grant.conditions, abacContext).matched
    );

    const denyGrant = applicableGrants.find((grant) => grant.effect === 'deny');
    if (denyGrant) {
      return this.decide(false, `Explicit deny grant "${denyGrant._id}"`, 'resource_grant');
    }

    const allowGrant = applicableGrants.find((grant) => grant.effect === 'allow');
    if (allowGrant) {
      return this.decide(true, `Explicit allow grant "${allowGrant._id}"`, 'resource_grant');
    }

    if (this.isStaticPermission(permission) && permissionService.hasPermission(roles, permission as Permission)) {
      return this.decide(true, 'Static RBAC role permission', 'rbac');
    }

    for (const role of userCustomRoles) {
      if (
        role.permissions.includes(permission as Permission) ||
        role.customPermissionKeys.includes(permission)
      ) {
        return this.decide(true, `Custom role "${role.name}"`, 'custom_role');
      }
    }

    return this.decide(false, 'No matching grant, role, or policy', 'default_deny');
  }

  private isStaticPermission(permission: string): boolean {
    return (Object.values(Permission) as string[]).includes(permission);
  }

  private async getUserCustomRoles(
    userId: string,
    tenantId: string,
    orgUnitId?: string
  ): Promise<CustomRole[]> {
    let assignments: UserScopeAssignment[];

    if (orgUnitId) {
      const single = await this.userScopeRepo.findByUserAndOrgUnit(userId, orgUnitId, tenantId);
      assignments = single ? [single] : [];
    } else {
      assignments = await this.userScopeRepo.findByUser(userId, tenantId);
    }

    const customRoleAssignments = assignments.filter((assignment) => assignment.isCustomRole);
    if (customRoleAssignments.length === 0) return [];

    const roles = await Promise.all(
      customRoleAssignments.map((assignment) => this.customRoleRepo.findById(assignment.role, tenantId))
    );

    return roles.filter((role): role is CustomRole => role !== null && role.status === 'active');
  }

  private decide(
    allowed: boolean,
    reason: string,
    source: PermissionDecision['source']
  ): PermissionDecision {
    return { allowed, reason, source, evaluatedAt: new Date() };
  }
}

export const permissionEngineService = new PermissionEngineService();
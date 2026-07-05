// modules/tenancy/services/platform.service.ts

import { organizationRepository } from '@/modules/organizations/repositories/organization.repository';
import { Organization } from '@/shared/types/organization.types';
import { PaginatedResponse, PaginationParams } from '@/shared/types/common.types';
import { NotFoundError } from '@/server/errors/app.errors';
import { auditLog } from '@/infrastructure/monitoring/audit.logger';
import { EventBusFactory } from '@/server/events/bus/EventBusFactory';
import { DomainEvent } from '@/server/events/base/DomainEvent';

export interface PlatformOrgFilters {
  status?: Organization['status'];
  tier?: Organization['subscription']['tier'];
  search?: string;
}

/**
 * Platform-level operations that reach across every tenant on the
 * platform. Distinct from every other service in the codebase in that
 * it is NOT tenant-scoped by design â€” it IS the layer above tenants.
 * Access to every method here must be gated to the true platform-admin
 * role (Role.SUPER_ADMIN specifically, never organization_owner â€” see
 * modules/tenancy/controllers/platform.controller.ts for the guard,
 * since organization_owner currently maps to the same static permission
 * set as super_admin and must NOT be trusted to reach this service).
 */
export class PlatformService {
  async listOrganizations(
    filters: PlatformOrgFilters,
    pagination: PaginationParams
  ): Promise<PaginatedResponse<Organization>> {
    const filter: Record<string, unknown> = { isDeleted: { $ne: true } };
    if (filters.status) filter.status = filters.status;
    if (filters.tier) filter['subscription.tier'] = filters.tier;
    if (filters.search) {
      filter.$or = [
        { name: { $regex: filters.search, $options: 'i' } },
        { slug: { $regex: filters.search, $options: 'i' } },
      ];
    }

    // isSuperAdmin=true bypasses the tenant filter entirely, which is
    // exactly what a cross-tenant platform listing needs.
    return organizationRepository.findWithPagination(
      filter as any,
      pagination,
      'default',
      false,
      true
    );
  }

  async getOrganization(organizationId: string): Promise<Organization> {
    const org = await organizationRepository.findById(organizationId, 'default', false, true);
    if (!org) throw new NotFoundError('Organization not found');
    return org;
  }

  async setOrganizationStatus(
    organizationId: string,
    status: Organization['status'],
    platformAdminUserId: string,
    reason?: string
  ): Promise<Organization> {
    const existing = await this.getOrganization(organizationId);

    const updated = await organizationRepository.update(
      organizationId,
      { status },
      'default',
      platformAdminUserId,
      true
    );
    if (!updated) throw new NotFoundError('Organization not found');

    await auditLog.log({
      action: 'PLATFORM_ORGANIZATION_STATUS_CHANGED',
      userId: platformAdminUserId,
      tenantId: organizationId,
      entityType: 'organization',
      entityId: organizationId,
      category: 'security',
      severity: 'warning',
      metadata: { from: existing.status, to: status, reason },
    });

    const eventBus = EventBusFactory.getInstance();
    await eventBus.publish(
      new (class extends DomainEvent {
        constructor() {
          super(
            'PlatformOrganizationStatusChanged',
            { entityId: organizationId, entityType: 'organization', from: existing.status, to: status },
            { tenantId: organizationId, userId: platformAdminUserId }
          );
        }
      })()
    );

    return updated;
  }

  async getPlatformStats(): Promise<{
    totalOrganizations: number;
    activeOrganizations: number;
    suspendedOrganizations: number;
  }> {
    const [total, active] = await Promise.all([
      organizationRepository.count({}, 'default', false, true),
      organizationRepository.count({ status: 'active' } as any, 'default', false, true),
    ]);

    return {
      totalOrganizations: total,
      activeOrganizations: active,
      suspendedOrganizations: total - active,
    };
  }
}

export const platformService = new PlatformService();
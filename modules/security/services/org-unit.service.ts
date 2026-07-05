// modules/security/services/org-unit.service.ts

import { orgUnitRepository, OrgUnitRepository } from '../repositories/org-unit.repository';
import { OrgUnit, OrgUnitCreateDTO, OrgUnitUpdateDTO, OrgUnitFilters } from '../types/org-unit.types';
import { AppError, NotFoundError, ValidationError } from '@/server/errors/app.errors';
import { EventBusFactory } from '@/server/events/bus/EventBusFactory';
import { OrgUnitCreatedEvent } from '../events/OrgUnitCreatedEvent';
import { OrgUnitUpdatedEvent } from '../events/OrgUnitUpdatedEvent';
import { OrgUnitDeletedEvent } from '../events/OrgUnitDeletedEvent';
import { auditLog } from '@/infrastructure/monitoring/audit.logger';

export class OrgUnitService {
  constructor(private readonly repo: OrgUnitRepository = orgUnitRepository) {}

  async createOrgUnit(data: OrgUnitCreateDTO, userId: string): Promise<OrgUnit> {
    if (!data.name?.trim()) {
      throw new ValidationError('Org unit name is required');
    }

    let path: string[] = [];
    let depth = 0;

    if (data.parentId) {
      const parent = await this.repo.findById(data.parentId, data.organizationId);
      if (!parent) {
        throw new NotFoundError('Parent org unit not found');
      }
      path = [...parent.path, parent._id!];
      depth = parent.depth + 1;
    }

    const created = await this.repo.create(
      {
        tenantId: data.organizationId,
        organizationId: data.organizationId,
        type: data.type,
        name: data.name.trim(),
        code: data.code,
        parentId: data.parentId ?? null,
        path,
        depth,
        managerId: data.managerId,
        metadata: data.metadata,
        status: 'active',
      },
      data.organizationId,
      userId
    );

    const eventBus = EventBusFactory.getInstance();
    await eventBus.publish(new OrgUnitCreatedEvent(created, { tenantId: data.organizationId, userId }));

    await auditLog.logCreate(userId, data.organizationId, 'org_unit', created._id!, {
      name: created.name,
      type: created.type,
    });

    return created;
  }

  async updateOrgUnit(
    id: string,
    data: OrgUnitUpdateDTO,
    tenantId: string,
    userId: string
  ): Promise<OrgUnit> {
    const existing = await this.repo.findById(id, tenantId);
    if (!existing) {
      throw new NotFoundError('Org unit not found');
    }

    const updates: Partial<Omit<OrgUnit, '_id' | 'tenantId' | 'createdAt' | 'createdBy'>> = {
      ...(data.name !== undefined && { name: data.name }),
      ...(data.code !== undefined && { code: data.code }),
      ...(data.managerId !== undefined && { managerId: data.managerId === null ? undefined : data.managerId }),
      ...(data.metadata !== undefined && { metadata: data.metadata }),
      ...(data.status !== undefined && { status: data.status }),
    };

    const updated = await this.repo.update(id, updates, tenantId, userId);
    if (!updated) {
      throw new NotFoundError('Org unit not found');
    }

    const eventBus = EventBusFactory.getInstance();
    await eventBus.publish(new OrgUnitUpdatedEvent(updated, data, { tenantId, userId }));

    await auditLog.logUpdate(userId, tenantId, 'org_unit', id, existing, updated);

    return updated;
  }

  async deleteOrgUnit(id: string, tenantId: string, userId: string): Promise<void> {
    const existing = await this.repo.findById(id, tenantId);
    if (!existing) {
      throw new NotFoundError('Org unit not found');
    }

    const childCount = await this.repo.countChildren(id, tenantId);
    if (childCount > 0) {
      throw new AppError(
        'Cannot delete an org unit that has child branches, departments, or fleets',
        'ORG_UNIT_HAS_CHILDREN',
        400
      );
    }

    await this.repo.softDelete(id, tenantId, userId);

    const eventBus = EventBusFactory.getInstance();
    await eventBus.publish(new OrgUnitDeletedEvent(id, existing.name, tenantId, { userId }));

    await auditLog.logDelete(userId, tenantId, 'org_unit', id, { name: existing.name });
  }

  async getOrgUnit(id: string, tenantId: string): Promise<OrgUnit> {
    const unit = await this.repo.findById(id, tenantId);
    if (!unit) {
      throw new NotFoundError('Org unit not found');
    }
    return unit;
  }

  async listOrgUnits(filters: OrgUnitFilters): Promise<OrgUnit[]> {
    return this.repo.findByOrganization(filters);
  }
}

export const orgUnitService = new OrgUnitService();
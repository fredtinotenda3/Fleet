// modules/tenancy/services/org-unit-hierarchy.service.ts

import { ObjectId, Filter, Document } from 'mongodb';
import { orgUnitRepository, OrgUnitRepository } from '@/modules/security/repositories/org-unit.repository';
import { orgUnitService, OrgUnitService } from '@/modules/security/services/org-unit.service';
import { OrgUnit, OrgUnitCreateDTO, OrgUnitType } from '@/modules/security/types/org-unit.types';
import { hierarchyValidationService, HierarchyValidationService } from './hierarchy-validation.service';
import { AppError, NotFoundError, ValidationError } from '@/server/errors/app.errors';
import { auditLog } from '@/infrastructure/monitoring/audit.logger';
import { EventBusFactory } from '@/server/events/bus/EventBusFactory';
import { OrgUnitUpdatedEvent } from '@/modules/security/events/OrgUnitUpdatedEvent';
import { permissionCacheService } from '@/modules/security/services/permission-cache.service';

/**
 * Tenancy-layer wrapper around the Phase 6 OrgUnitService/OrgUnitRepository.
 * Adds two capabilities Phase 6 didn't need: (1) validating that a unit's
 * type is allowed to nest under its intended parent's type (branch ->
 * department -> team/fleet -> workshop), and (2) moving a unit to a new
 * parent, which requires recomputing the materialized `path`/`depth` of
 * the unit AND every one of its descendants in one consistent pass.
 *
 * This is intentionally a separate service rather than a modification of
 * modules/security/services/org-unit.service.ts, so the Phase 6 security
 * module's create/update/delete flows are untouched; callers that need
 * hierarchy-aware creation should go through createOrgUnit here instead
 * of calling orgUnitService directly.
 */
export class OrgUnitHierarchyService {
  constructor(
    private readonly repo: OrgUnitRepository = orgUnitRepository,
    private readonly baseService: OrgUnitService = orgUnitService,
    private readonly validator: HierarchyValidationService = hierarchyValidationService
  ) {}

  async createOrgUnit(data: OrgUnitCreateDTO, userId: string): Promise<OrgUnit> {
    const parentType = await this.resolveParentType(data.parentId, data.organizationId);
    this.validator.validateParentChild(data.type, parentType);
    return this.baseService.createOrgUnit(data, userId);
  }

  /**
   * Re-parents an existing org unit, validating the new parent's type is
   * compatible, rejecting cycles (moving a unit under its own
   * descendant), and cascading the materialized path/depth update to
   * every descendant so `OrgUnitRepository.getPath` /
   * `getDescendantIds` (and therefore permission-grant inheritance,
   * Phase 6) keep working correctly after the move.
   */
  async moveOrgUnit(
    orgUnitId: string,
    newParentId: string | null,
    tenantId: string,
    userId: string
  ): Promise<OrgUnit> {
    const unit = await this.repo.findById(orgUnitId, tenantId);
    if (!unit) {
      throw new NotFoundError('Org unit not found');
    }

    if (newParentId === orgUnitId) {
      throw new ValidationError('An org unit cannot be moved under itself');
    }

    let newParent: OrgUnit | null = null;
    if (newParentId) {
      newParent = await this.repo.findById(newParentId, tenantId);
      if (!newParent) {
        throw new NotFoundError('Target parent org unit not found');
      }
      if (newParent.organizationId !== unit.organizationId) {
        throw new ValidationError('Cannot move an org unit to a different organization');
      }

      const descendantIds = await this.repo.getDescendantIds(orgUnitId, tenantId);
      if (descendantIds.includes(newParentId)) {
        throw new AppError(
          'Cannot move an org unit under one of its own descendants',
          'ORG_UNIT_CYCLE',
          400
        );
      }
    }

    this.validator.validateParentChild(unit.type, newParent?.type ?? null);

    const newPath = newParent ? [...newParent.path, newParent._id!] : [];
    const depthDelta = newPath.length - unit.path.length;

    const collection = await this.getCollection();

    // Update the moved unit itself.
    await collection.updateOne(
      { _id: new ObjectId(unit._id) } as Filter<Document>,
      {
        $set: {
          parentId: newParentId,
          path: newPath,
          depth: newPath.length,
          updatedAt: new Date(),
          updatedBy: userId,
        },
      }
    );

    // Cascade to every descendant: replace the old path prefix with the
    // new one (newPath + unit._id) and shift depth by the same delta,
    // without needing to know each descendant's individual position in
    // the subtree.
    const descendants = await collection
      .find({ organizationId: unit.organizationId, path: unit._id } as Filter<Document>)
      .toArray();

    const newUnitPath = [...newPath, unit._id!];

    for (const descendant of descendants) {
      const oldDescPath = (descendant as any).path as string[];
      const idxOfUnit = oldDescPath.indexOf(unit._id!);
      const suffix = idxOfUnit >= 0 ? oldDescPath.slice(idxOfUnit + 1) : [];
      const rewrittenPath = [...newUnitPath, ...suffix];

      await collection.updateOne(
        { _id: descendant._id } as Filter<Document>,
        {
          $set: {
            path: rewrittenPath,
            depth: rewrittenPath.length,
            updatedAt: new Date(),
            updatedBy: userId,
          },
        }
      );
    }

    const updated = await this.repo.findById(orgUnitId, tenantId);
    if (!updated) {
      throw new AppError('Org unit disappeared during move', 'ORG_UNIT_MOVE_FAILED', 500);
    }

    const eventBus = EventBusFactory.getInstance();
    await eventBus.publish(
      new OrgUnitUpdatedEvent(updated, { parentId: newParentId }, { tenantId, userId })
    );

    // The permission engine caches decisions keyed in part by resource
    // org-unit scope; a reparent changes which grants inherit down to
    // this subtree, so the tenant's whole permission cache must drop.
    await permissionCacheService.invalidateTenant(tenantId).catch(() => undefined);

    await auditLog.log({
      action: 'ORG_UNIT_MOVED',
      userId,
      tenantId,
      entityType: 'org_unit',
      entityId: orgUnitId,
      metadata: {
        name: unit.name,
        fromParentId: unit.parentId ?? null,
        toParentId: newParentId,
        descendantsAffected: descendants.length,
        depthDelta,
      },
    });

    return updated;
  }

  private async resolveParentType(
    parentId: string | null | undefined,
    organizationId: string
  ): Promise<OrgUnitType | null> {
    if (!parentId) return null;
    const parent = await this.repo.findById(parentId, organizationId);
    if (!parent) {
      throw new NotFoundError('Parent org unit not found');
    }
    return parent.type;
  }

  private async getCollection() {
    // Reaches past the repository's public surface deliberately:
    // cascading a path rewrite across N descendants is not a use case
    // BaseRepository's generic CRUD methods are meant to cover, and
    // adding one-off bulk-path-rewrite methods to the shared base class
    // would leak this module's concerns into every other domain that
    // extends it.
    const connectToDatabase = (await import('@/infrastructure/database/mongodb')).default;
    const db = await connectToDatabase();
    return db.collection('tblorgunits');
  }
}

export const orgUnitHierarchyService = new OrgUnitHierarchyService();
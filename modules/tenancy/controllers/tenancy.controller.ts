// modules/tenancy/controllers/tenancy.controller.ts

import { NextRequest } from 'next/server';
import { tenantContextService } from '../services/tenant-context.service';
import { orgUnitHierarchyService } from '../services/org-unit-hierarchy.service';
import { orgUnitCreateSchema } from '@/shared/validations/security.schema';
import { moveOrgUnitSchema } from '@/shared/validations/tenancy.schema';
import { successResponse, createdResponse, errorResponse } from '@/server/utils/response.utils';
import { AppError, ValidationError } from '@/server/errors/app.errors';
import { requireAuthContext } from '@/server/auth/auth-context';
import { getTenantFromRequest, getUserIdFromRequest } from '@/server/utils/context.utils';

interface TreeNode {
  _id?: string;
  parentId?: string | null;
  children: TreeNode[];
  [key: string]: unknown;
}

function buildTree(units: Array<Record<string, unknown> & { _id?: string; parentId?: string | null }>): TreeNode[] {
  const byParent = new Map<string, typeof units>();
  for (const unit of units) {
    const key = unit.parentId ?? 'root';
    if (!byParent.has(key)) byParent.set(key, []);
    byParent.get(key)!.push(unit);
  }

  function attach(parentKey: string): TreeNode[] {
    return (byParent.get(parentKey) || []).map((u) => ({
      ...u,
      children: attach(u._id ?? ''),
    })) as TreeNode[];
  }

  return attach('root');
}

export class TenancyController {
  async getContext(req: NextRequest) {
    try {
      const context = await requireAuthContext(req);
      const tenantContext = await tenantContextService.resolveContext(
        context.userId,
        context.tenantId,
        context.roles,
        context.isSuperAdmin,
        context.orgUnitId
      );
      return successResponse(tenantContext);
    } catch (error) {
      return this.handleError(error);
    }
  }

  async getHierarchyTree(req: NextRequest) {
    try {
      const tenantId = await getTenantFromRequest(req);
      const units = await tenantContextService.getHierarchyTree(tenantId);
      return successResponse(buildTree(units as any));
    } catch (error) {
      return this.handleError(error);
    }
  }

  async createOrgUnit(req: NextRequest) {
    try {
      const tenantId = await getTenantFromRequest(req);
      const userId = await getUserIdFromRequest(req);
      const body = await req.json();

      const parsed = orgUnitCreateSchema.safeParse(body);
      if (!parsed.success) {
        throw new ValidationError('Invalid org unit definition', parsed.error.flatten());
      }

      const unit = await orgUnitHierarchyService.createOrgUnit(
        { ...parsed.data, organizationId: tenantId },
        userId
      );
      return createdResponse(unit);
    } catch (error) {
      return this.handleError(error);
    }
  }

  async moveOrgUnit(req: NextRequest, id: string) {
    try {
      const tenantId = await getTenantFromRequest(req);
      const userId = await getUserIdFromRequest(req);
      const body = await req.json();

      const parsed = moveOrgUnitSchema.safeParse(body);
      if (!parsed.success) {
        throw new ValidationError('Invalid move request', parsed.error.flatten());
      }

      const updated = await orgUnitHierarchyService.moveOrgUnit(
        id,
        parsed.data.newParentId,
        tenantId,
        userId
      );
      return successResponse(updated);
    } catch (error) {
      return this.handleError(error);
    }
  }

  private handleError(error: unknown) {
    if (error instanceof AppError) {
      return errorResponse(error.message, error.code, error.statusCode, error.details);
    }
    console.error('[TenancyController] Unexpected error:', error);
    return errorResponse('Internal server error', 'INTERNAL_ERROR', 500);
  }
}

export const tenancyController = new TenancyController();
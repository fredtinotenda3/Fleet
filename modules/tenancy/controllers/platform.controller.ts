// modules/tenancy/controllers/platform.controller.ts

import { NextRequest } from 'next/server';
import { platformService } from '../services/platform.service';
import { platformDirectoryService } from '../services/platform-directory.service';
import { platformOrgStatusSchema } from '@/shared/validations/tenancy.schema';
import { orgUnitCreateSchema } from '@/shared/validations/security.schema';
import { tenantContextService } from '../services/tenant-context.service';
import { orgUnitHierarchyService } from '../services/org-unit-hierarchy.service';
import { auditLog } from '@/infrastructure/monitoring/audit.logger';
import {
  successResponse,
  paginatedResponse,
  createdResponse,
  errorResponse,
} from '@/server/utils/response.utils';
import { AppError, ForbiddenError, ValidationError, isAppError, describeError } from '@/server/errors/app.errors';
import { getAuthContext } from '@/server/auth/auth-context';
import { Role } from '@/server/permissions/roles';
import { validatePaginationParams } from '@/shared/utils/pagination.utils';

/**
 * Every method here requires the caller's JWT to carry the literal
 * Role.SUPER_ADMIN role. This is intentionally NOT the `isSuperAdmin`
 * flag used elsewhere (AuthContext.isSuperAdmin is also true for
 * organization_owner, since both currently map to every static
 * Permission â€” see server/permissions/roles.ts). Platform endpoints
 * reach across every tenant, so an organization_owner â€” who is
 * privileged only within their own tenant â€” must never pass this guard.
 */
async function requirePlatformAdmin(req: NextRequest) {
  const context = await getAuthContext(req);
  if (!context) {
    throw new ForbiddenError('Authentication required');
  }
  if (!context.roles.includes(Role.SUPER_ADMIN)) {
    throw new ForbiddenError('Platform administrator access required');
  }
  return context;
}

export class PlatformController {
  async listOrganizations(req: NextRequest) {
    try {
      await requirePlatformAdmin(req);
      const searchParams = req.nextUrl.searchParams;
      const { page, limit } = validatePaginationParams(
        searchParams.get('page'),
        searchParams.get('limit')
      );

      const result = await platformService.listOrganizations(
        {
          status: (searchParams.get('status') as any) || undefined,
          tier: (searchParams.get('tier') as any) || undefined,
          search: searchParams.get('search') || undefined,
        },
        { page, limit }
      );

      return paginatedResponse(result.data, result.pagination);
    } catch (error) {
      return this.handleError(error);
    }
  }

  async getOrganization(req: NextRequest, id: string) {
    try {
      await requirePlatformAdmin(req);
      const org = await platformService.getOrganization(id);
      return successResponse(org);
    } catch (error) {
      return this.handleError(error);
    }
  }

  async setOrganizationStatus(req: NextRequest, id: string) {
    try {
      const context = await requirePlatformAdmin(req);
      const body = await req.json();

      const parsed = platformOrgStatusSchema.safeParse(body);
      if (!parsed.success) {
        throw new ValidationError('Invalid status update', parsed.error.flatten());
      }

      const updated = await platformService.setOrganizationStatus(
        id,
        parsed.data.status,
        context.userId,
        parsed.data.reason
      );

      return successResponse(updated);
    } catch (error) {
      return this.handleError(error);
    }
  }

  /**
   * Cross-tenant directory reads.
   *
   * All three go through requirePlatformAdmin like every other method
   * here -- the LITERAL Role.SUPER_ADMIN, not the isSuperAdmin flag,
   * which is also true for organization_owner. Redaction lives in
   * platform-directory.service.ts, where the projections are
   * allow-lists.
   */
  async listUsers(req: NextRequest) {
    try {
      await requirePlatformAdmin(req);
      const params = req.nextUrl.searchParams;
      const { page, limit } = validatePaginationParams(params.get('page'), params.get('limit'));

      const result = await platformDirectoryService.listUsers(
        {
          search: params.get('search') || undefined,
          tenantId: params.get('tenantId') || undefined,
        },
        { page, limit }
      );
      return paginatedResponse(result.data, result.pagination);
    } catch (error) {
      return this.handleError(error);
    }
  }

  async listApiKeys(req: NextRequest) {
    try {
      await requirePlatformAdmin(req);
      const params = req.nextUrl.searchParams;
      const { page, limit } = validatePaginationParams(params.get('page'), params.get('limit'));

      const result = await platformDirectoryService.listApiKeys(
        {
          organizationId: params.get('organizationId') || undefined,
          status: params.get('status') || undefined,
        },
        { page, limit }
      );
      return paginatedResponse(result.data, result.pagination);
    } catch (error) {
      return this.handleError(error);
    }
  }

  async listRoles(req: NextRequest) {
    try {
      await requirePlatformAdmin(req);
      const params = req.nextUrl.searchParams;
      const { page, limit } = validatePaginationParams(params.get('page'), params.get('limit'));

      const result = await platformDirectoryService.listCustomRoles(
        {
          organizationId: params.get('organizationId') || undefined,
          includeDeleted: params.get('includeDeleted') === 'true',
        },
        { page, limit }
      );
      return paginatedResponse(result.data, result.pagination);
    } catch (error) {
      return this.handleError(error);
    }
  }

  async getStats(req: NextRequest) {
    try {
      await requirePlatformAdmin(req);
      const stats = await platformService.getPlatformStats();
      return successResponse(stats);
    } catch (error) {
      return this.handleError(error);
    }
  }

  /**
   * ---------------------------------------------------------------
   * PLATFORM-SCOPED ORG-UNIT MANAGEMENT
   * ---------------------------------------------------------------
   * Flagged as blocked for three rounds, and this is why: the existing
   * org-unit endpoints -- `/api/tenancy/org-units` and
   * `/api/security/org-units` -- resolve `organizationId` from
   * `getTenantFromRequest(req)`, the CALLER's own session, on both GET
   * and POST. `orgUnitCreateSchema` does not even declare the field.
   *
   * So there was no way to reach another organization's tree. Pointing
   * the platform-admin UI at those routes would have shown an operator
   * THEIR OWN branches under someone else's organization name, and "Add
   * unit" would have created the unit in their own tenant -- with every
   * request returning 200. The UI gated the feature off rather than
   * render that.
   *
   * These two methods are the fix, and the ONLY thing they add over the
   * tenant-scoped path is where the organization comes from: an explicit
   * route parameter, resolved to a real organization, instead of the
   * session. Everything downstream is the same already-tested service,
   * including its parent-type validation and its refusal of a parent
   * that belongs to a different organization.
   *
   * The organization id in the path may be an ObjectId or a slug --
   * `resolveOrganization` handles both -- but the value handed to the
   * services is always the resolved organization's SLUG, because that is
   * what `tenantId` means everywhere in this codebase. Passing the
   * ObjectId instead would write org units nothing else can ever read.
   */
  async listOrganizationOrgUnits(req: NextRequest, organizationId: string) {
    try {
      await requirePlatformAdmin(req);
      const tenantId = await this.resolveTenantSlug(organizationId);
      const units = await tenantContextService.getHierarchyTree(tenantId);
      return successResponse({ organizationId: tenantId, units });
    } catch (error) {
      return this.handleError(error);
    }
  }

  async createOrganizationOrgUnit(req: NextRequest, organizationId: string) {
    try {
      const context = await requirePlatformAdmin(req);
      const tenantId = await this.resolveTenantSlug(organizationId);

      const body = await req.json();
      const parsed = orgUnitCreateSchema.safeParse(body);
      if (!parsed.success) {
        throw new ValidationError('Invalid org unit definition', parsed.error.flatten());
      }

      /**
       * `organizationId` is spread LAST, so a body that tries to name a
       * different organization cannot win. The schema strips the key
       * anyway -- this is belt and braces, and it matches the ordering
       * the tenant-scoped controller uses.
       */
      const unit = await orgUnitHierarchyService.createOrgUnit(
        { ...parsed.data, organizationId: tenantId },
        context.userId
      );

      /**
       * Audited under the TARGET tenant with the PLATFORM ADMIN's user
       * id. A cross-tenant write that appears in neither tenant's audit
       * trail is the kind of gap a security review exists to find; the
       * service's own audit entry records the create, and this one
       * records that it was done from outside the organization.
       */
      await auditLog.log({
        action: 'PLATFORM_ORG_UNIT_CREATED',
        userId: context.userId,
        tenantId,
        entityType: 'org_unit',
        entityId: unit._id!,
        category: 'security',
        severity: 'warning',
        metadata: { name: unit.name, type: unit.type, parentId: unit.parentId ?? null },
      });

      return createdResponse(unit);
    } catch (error) {
      return this.handleError(error);
    }
  }

  /**
   * The organization's slug, or NotFoundError.
   *
   * Deliberately goes through platformService.getOrganization rather
   * than trusting the path parameter: an unresolvable id must 404 before
   * anything is read or written, and a caller must not be able to invent
   * a tenant by naming one.
   */
  private async resolveTenantSlug(organizationId: string): Promise<string> {
    const org = await platformService.getOrganization(organizationId);
    const slug = (org as { slug?: string }).slug;
    if (!slug) {
      throw new AppError(
        'Organization has no slug and cannot be scoped',
        'ORGANIZATION_SLUG_MISSING',
        409
      );
    }
    return slug;
  }

  private handleError(error: unknown) {
    if (isAppError(error)) {
      return errorResponse(error.message, error.code, error.statusCode, error.details);
    }
    console.error('[PlatformController] Unexpected error:', describeError(error));
    return errorResponse('Internal server error', 'INTERNAL_ERROR', 500);
  }
}

export const platformController = new PlatformController();
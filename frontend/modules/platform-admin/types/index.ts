// frontend/modules/platform-admin/types/index.ts
//
// Mirrors the wire shapes of the platform-admin endpoints field for
// field. Same rule as frontend/modules/observability/types: nothing here
// is inferred or wished for -- if the backend does not send it, it is
// not declared.
//
// ---------------------------------------------------------------------
// THE ENDPOINTS THIS MODULE TALKS TO, AND WHAT GUARDS THEM
// ---------------------------------------------------------------------
//   GET  /api/platform/organizations        -> paginated Organization[]
//   GET  /api/platform/organizations/:id    -> Organization
//   PUT  /api/platform/organizations/:id/status
//   GET  /api/platform/stats                -> PlatformStats
//        ^ all four: withAuth(Permission.PLATFORM_VIEW / PLATFORM_MANAGE)
//          AND an additional in-controller check that the caller's JWT
//          carries the literal Role.SUPER_ADMIN. See
//          modules/tenancy/controllers/platform.controller.ts: that
//          second guard exists because `isSuperAdmin` is also true for
//          organization_owner, who must never reach a cross-tenant
//          surface.
//
//   POST /api/organizations                 -> Organization (self-service)
//   GET  /api/tenancy/org-units             -> OrgUnitSummary[]
//   POST /api/tenancy/org-units             -> OrgUnitSummary
//
// ---------------------------------------------------------------------
// THE CONSTRAINT THAT SHAPES THIS WHOLE MODULE
// ---------------------------------------------------------------------
// The org-unit endpoints are TENANT-SCOPED TO THE CALLER. Both the GET
// and the POST resolve `organizationId` from
// `getTenantFromRequest(req)` -- the caller's own session -- and the
// POST spreads it LAST over the parsed body
// (`{ ...parsed.data, organizationId: tenantId }`), so a body carrying
// another organization's id is overridden, not honoured.
// `orgUnitCreateSchema` does not even declare an `organizationId` field.
//
// There is therefore NO endpoint that lists or creates org units for an
// organization other than the caller's own. A platform admin opening
// some other tenant's detail page would be shown THEIR OWN branches
// under that tenant's name, and a "create branch" there would silently
// create it in their own organization.
//
// This module refuses to do either. `canManageOrgUnitsFor()` in
// ../utils decides, and OrganizationDetailPage renders an explicit
// explanation instead of a wrong list. Fabricating a cross-tenant
// endpoint, or quietly showing the caller's own units, would both be
// worse than saying so.

import type { Organization } from '@/shared/types/organization.types';

export type { Organization };

/**
 * Slice 2 (Users, Roles & Permissions, API keys, Audit log) wire
 * shapes. Kept in their own file rather than appended here: that slice
 * talks to a different set of routes under /api/security and
 * /api/organizations, with different gates and different scoping rules,
 * and its header documents all three. Re-exported so `../types` stays
 * the single import path for the module.
 */
export * from './access.types';

/** `Organization['status']`, restated so components can enumerate it. */
export type OrganizationStatus = Organization['status'];

/** `Organization['subscription']['tier']`. */
export type OrganizationTier = Organization['subscription']['tier'];

/**
 * One row of GET /api/platform/organizations.
 *
 * The endpoint returns the FULL Organization document (see
 * PlatformService.listOrganizations -> organizationRepository
 * .findWithPagination), not a trimmed summary. This alias exists so the
 * table's props say what they mean without re-declaring 30 fields that
 * would then drift from shared/types/organization.types.ts.
 */
export type PlatformOrganization = Organization;

/**
 * The pagination block `paginatedResponse` attaches, which
 * `apiClient.get` surfaces as `{ data, pagination }`.
 * Mirrors PaginatedResponse<T>['pagination'] in shared/types/common.types.ts.
 */
export interface PlatformPagination {
  page: number;
  limit: number;
  total: number;
  totalPages: number;
  hasNext: boolean;
  hasPrev: boolean;
}

export interface PlatformOrganizationListResult {
  data: PlatformOrganization[];
  pagination: PlatformPagination;
}

/** Query parameters GET /api/platform/organizations actually reads. */
export interface PlatformOrganizationListParams {
  page?: number;
  limit?: number;
  status?: OrganizationStatus;
  tier?: OrganizationTier;
  search?: string;
}

/**
 * GET /api/platform/stats.
 *
 * Exactly three counters -- see PlatformService.getPlatformStats. There
 * is no vehicle, user or revenue count on this endpoint, and this
 * module does not invent one.
 */
export interface PlatformStats {
  totalOrganizations: number;
  activeOrganizations: number;
  suspendedOrganizations: number;
}

/**
 * Body of PUT /api/platform/organizations/:id/status.
 * Mirrors `platformOrgStatusSchema` (shared/validations/tenancy.schema.ts).
 */
export interface SetOrganizationStatusPayload {
  status: OrganizationStatus;
  /** Recorded on the audit entry. Max 500 chars server-side. */
  reason?: string;
}

/**
 * Body of POST /api/organizations.
 *
 * NOTE, and it is surfaced in the form's help text rather than buried
 * here: this endpoint is SELF-SERVICE. `OrganizationController
 * .createOrganization` sets `ownerId` from the CALLER's user id, so the
 * platform admin who submits this form becomes the new organization's
 * owner. `ownerEmail`/`ownerName` populate the owner member record;
 * they do not transfer ownership to that person.
 */
export interface CreateOrganizationPayload {
  name: string;
  ownerEmail: string;
  ownerName: string;
}

/** OrgUnit type ladder. Mirrors OrgUnitType in modules/security/types/org-unit.types.ts. */
export type OrgUnitType = 'branch' | 'department' | 'fleet' | 'workshop' | 'team';

export type OrgUnitStatus = 'active' | 'inactive';

/**
 * A row of GET /api/tenancy/org-units.
 *
 * `_id`, not `id`: OrgUnitService/OrgUnitRepository never rename the
 * Mongo field, and frontend/modules/organizations/types learned this the
 * hard way (its own comment records a parent-dropdown filter that
 * compared `undefined !== undefined` for exactly this reason).
 */
export interface OrgUnitSummary {
  _id: string;
  organizationId: string;
  type: OrgUnitType;
  name: string;
  code?: string;
  parentId?: string | null;
  path: string[];
  depth: number;
  managerId?: string;
  status: OrgUnitStatus;
  createdAt?: string;
  updatedAt?: string;
}

/**
 * Body of POST /api/tenancy/org-units. Mirrors `orgUnitCreateSchema`.
 *
 * Deliberately has NO `organizationId`: the schema does not accept one
 * and the controller overrides it from the session regardless. See the
 * header.
 */
export interface CreateOrgUnitPayload {
  type: OrgUnitType;
  name: string;
  code?: string;
  parentId?: string | null;
  managerId?: string;
}

/** An org unit with its children resolved, for indented table rendering. */
export interface OrgUnitTreeNode extends OrgUnitSummary {
  children: OrgUnitTreeNode[];
  /** Distance from the rendered root. Not the stored `depth`, which is absolute. */
  level: number;
}

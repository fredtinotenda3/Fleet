// frontend/modules/platform-admin/types/access.types.ts
//
// Wire shapes for the Users / Roles & Permissions / API Keys / Audit
// Log slice. Same rule as ./index.ts: nothing here is inferred or
// wished for -- if the backend does not send it, it is not declared.
//
// ---------------------------------------------------------------------
// THE ENDPOINTS THIS SLICE TALKS TO, AND WHAT GUARDS THEM
// ---------------------------------------------------------------------
//   GET    /api/security/roles                 CUSTOM_ROLE_VIEW    tenant-scoped
//   POST   /api/security/roles                 CUSTOM_ROLE_MANAGE  tenant-scoped
//   GET    /api/security/roles/:id             CUSTOM_ROLE_VIEW    tenant-scoped
//   PATCH  /api/security/roles/:id             CUSTOM_ROLE_MANAGE  tenant-scoped
//   DELETE /api/security/roles/:id             CUSTOM_ROLE_MANAGE  tenant-scoped
//   GET    /api/security/permissions           CUSTOM_ROLE_VIEW    global catalogue
//   GET    /api/security/api-keys              API_KEY_VIEW        tenant-scoped
//   POST   /api/security/api-keys              API_KEY_MANAGE      tenant-scoped
//   DELETE /api/security/api-keys/:id          API_KEY_MANAGE      tenant-scoped
//   GET    /api/security/audit-log             AUDIT_LOG_VIEW      cross-tenant for super admins
//   GET    /api/security/audit-log/verify      AUDIT_LOG_VIEW      global chain
//   POST   /api/organizations/:id/members/invite            ORG_MEMBERS_MANAGE
//   POST   /api/organizations/:id/members/:memberId/suspend ORG_MEMBERS_MANAGE
//   POST   /api/organizations/:id/members/:memberId/restore ORG_MEMBERS_MANAGE
//   PATCH  /api/organizations/:id/members/:memberId         ORG_MEMBERS_MANAGE
//   DELETE /api/organizations/:id/members/:memberId         ORG_MEMBERS_MANAGE
//
// ---------------------------------------------------------------------
// THREE CONSTRAINTS THAT SHAPE THIS WHOLE SLICE
// ---------------------------------------------------------------------
//
// 1. "PLATFORM" API KEYS AND ROLES DO NOT EXIST. Both collections are
//    ORGANIZATION-scoped: ApiKeyController resolves
//    `context.tenantId` from the session and calls
//    `apiKeyService.listForOrganization(context.tenantId)`;
//    RoleController does the same via `getTenantFromRequest(req)`.
//    There is no cross-tenant listing for either, and no query
//    parameter that would produce one. The pages therefore say
//    "your organization" in their own headings rather than "platform",
//    because a page titled "Platform API keys" that silently shows one
//    tenant's keys is a lie an operator cannot detect by looking.
//
// 2. THERE IS NO PLATFORM USER ENDPOINT. No /api/users, no
//    /api/platform/users, no cross-tenant user search. What exists is
//    `GET /api/platform/organizations`, which returns FULL Organization
//    documents -- PlatformService.listOrganizations passes no
//    projection to organizationRepository.findWithPagination -- and
//    `Organization` embeds `members: OrganizationMember[]` and
//    `invites?: OrganizationInvite[]`. The user directory is therefore
//    DERIVED from that one paginated response, with no per-organization
//    fan-out. Its scope is exactly "the organizations on this page",
//    which the page states rather than implying completeness.
//
//    (`/api/admin` used to also exist, returning rows of the legacy
//    `tbladmin` collection with no Permission check and no tenant
//    scoping. It has been REMOVED -- see PLATFORM_ADMIN_BACKEND_GAPS.md,
//    Gap 3 -- since nothing in the product called it. This directory
//    was never built on it and needs no change as a result.)
//
// 3. MEMBER WRITES ARE OFFERED ONLY FOR THE CALLER'S OWN ORGANIZATION.
//    The five member routes take the organization from the URL and are
//    gated on ORG_MEMBERS_MANAGE, but nothing binds that path parameter
//    to the caller's tenant: `OrganizationService.getOrganization
//    (organizationId, tenantId)` IGNORES its `tenantId` argument
//    entirely and resolves through `resolveOrganization(organizationId)`
//    with no tenant comparison, and `withAuth` checks permissions, not
//    ownership. Building a cross-tenant member-management UI on that
//    would be productising a missing server-side check. This module
//    fails closed through `canManageMembersFor()` in ../utils, exactly
//    as `canManageOrgUnitsFor()` already does for org units, and the
//    finding is written up rather than relied on.

import type { Role, Permission } from '@/server/permissions/roles';
import type {
  OrganizationMember,
  OrganizationInvite,
} from '@/shared/types/organization.types';
import type { PlatformPagination } from './index';

export type { OrganizationMember, OrganizationInvite };

// ---------------------------------------------------------------------
// Users directory (derived, not fetched)
// ---------------------------------------------------------------------

/** `OrganizationMember['status']`, restated so components can enumerate it. */
export type DirectoryUserStatus = OrganizationMember['status'];

/**
 * One row of the derived user directory: a member, plus which
 * organization they belong to.
 *
 * NOT A BACKEND SHAPE. Nothing returns this. It is built by
 * `buildUserDirectory()` in ../utils from the `members[]` already
 * embedded in each Organization on the platform listing.
 */
export interface DirectoryUser {
  /** OrganizationMember.userId. Unique within an organization, not across the platform. */
  userId: string;
  email: string;
  name: string;
  /** The member's organization-level role string. May be a Role enum member or an unrecognised legacy value. */
  role: string;
  status: DirectoryUserStatus;
  /** Organization the membership belongs to. */
  organizationId: string;
  organizationName: string;
  /** Canonical tenant identifier (slug), for cross-referencing business rows. */
  organizationTenantId: string | null;
  /** Present when this row is a membership rather than a pending invite. */
  joinedAt?: string;
  invitedAt?: string;
  /** The branch this member is scoped to, when the member row records one. */
  orgUnitId?: string;
  /**
   * True when this row came from `Organization.invites[]` rather than
   * `members[]` -- i.e. an invitation that has not been accepted, so
   * there is no user account behind it yet. Kept distinct from
   * `status: 'invited'` on a member row, which is a real member record.
   */
  isPendingInvite: boolean;
}

/** What the directory was built from, so the page can state its own scope honestly. */
export interface UserDirectoryResult {
  users: DirectoryUser[];
  /** How many organizations contributed rows -- i.e. the size of the page that was read. */
  organizationsScanned: number;
  /**
   * True when the platform holds more organizations than the page that
   * was read, so the directory is a partial view. Never guessed: taken
   * from the listing's own `pagination.hasNext`.
   */
  partial: boolean;
}

// ---------------------------------------------------------------------
// Roles
// ---------------------------------------------------------------------

/**
 * A built-in role and the permissions it grants.
 *
 * NOT FETCHED. There is no endpoint that returns the static role matrix
 * -- `GET /api/security/roles` returns tenant-defined CUSTOM roles only.
 * The static matrix is `rolePermissions` in server/permissions/roles.ts,
 * which is a plain TypeScript module the frontend already imports
 * directly (Sidebar.tsx does, for `permissionService`), so this is read
 * from source rather than over the wire. That makes it exactly the
 * matrix the server enforces, with no drift possible.
 */
export interface StaticRoleDefinition {
  role: Role;
  label: string;
  permissions: Permission[];
  /** True for Role.SUPER_ADMIN, which ORGANIZATION_ROLES excludes from every assignment surface. */
  isPlatformRole: boolean;
  /** True when this role may be set on an existing member (ASSIGNABLE_ORGANIZATION_ROLES). */
  isAssignable: boolean;
}

export type CustomRoleStatus = 'active' | 'inactive';
export type CustomRoleScopeType = 'organization' | 'branch' | 'department' | 'fleet';

/**
 * One row of GET /api/security/roles. Mirrors `CustomRole`
 * (modules/security/types/custom-role.types.ts) field for field, with
 * `Date` fields as ISO strings -- they cross the wire via
 * NextResponse.json() and apiClient does not revive dates.
 */
export interface CustomRole {
  _id?: string;
  organizationId: string;
  name: string;
  description?: string;
  /** A static Role whose permission set this role inherits as a starting point. */
  baseRole?: Role;
  /** Static Permission enum members granted on top of `baseRole`. */
  permissions: Permission[];
  /** Dynamic keys registered in PermissionRegistry that are not part of the static enum. */
  customPermissionKeys: string[];
  scopeType: CustomRoleScopeType;
  isSystem: boolean;
  status: CustomRoleStatus;
  version: number;
  createdAt?: string;
  updatedAt?: string;
}

/**
 * One row of GET /api/security/permissions. Mirrors
 * `PermissionDefinition` (modules/security/registry/PermissionRegistry.ts).
 *
 * This is the REGISTRY catalogue, which is a different thing from the
 * static Permission enum: it carries display metadata (label, category,
 * description) the enum has no room for, and it includes dynamic custom
 * keys the enum does not contain. A key present in the enum but never
 * registered will be absent here -- see `mergePermissionCatalogue()` in
 * ../utils, which unions the two rather than trusting either alone.
 */
export interface PermissionDefinition {
  key: string;
  label: string;
  category: string;
  description?: string;
  requiresResourceScope: boolean;
  isCustom: boolean;
}

// ---------------------------------------------------------------------
// API keys
// ---------------------------------------------------------------------

export type ApiKeyStatus = 'active' | 'revoked' | 'expired';

/**
 * One row of GET /api/security/api-keys.
 *
 * `keyHash` is NOT declared, because the server never sends it:
 * `ApiKeyService.listForOrganization` and `.getById` both destructure
 * it away (`keys.map(({ keyHash, ...rest }) => rest)`). Declaring an
 * optional `keyHash?` here would invite a component to render a field
 * that must never reach a browser.
 */
export interface ApiKeySummary {
  _id?: string;
  organizationId: string;
  name: string;
  /** The non-secret display prefix, e.g. "fk_ab12cd34". Safe to show. */
  keyPrefix: string;
  /** Static Permission members and/or dynamic registry keys. Raw strings by design. */
  permissions: string[];
  status: ApiKeyStatus;
  createdByUserId: string;
  lastUsedAt?: string;
  lastUsedIp?: string;
  expiresAt?: string | null;
  revokedAt?: string;
  revokedBy?: string;
  revokedReason?: string;
  createdAt?: string;
  updatedAt?: string;
}

/**
 * Response of POST /api/security/api-keys.
 *
 * `plaintextKey` is returned EXACTLY ONCE, at creation, and is never
 * retrievable again -- only its hash is stored. The UI must show it
 * once, make it copyable, and say plainly that it cannot be shown
 * again.
 */
export interface ApiKeyCreateResult {
  apiKey: ApiKeySummary;
  plaintextKey: string;
}

/** Body of POST /api/security/api-keys. Mirrors `apiKeyCreateSchema`. */
export interface CreateApiKeyPayload {
  /** 1-100 characters, server-enforced. */
  name: string;
  /** At least one, server-enforced. */
  permissions: string[];
  /** ISO string, or null for a key that never expires. */
  expiresAt?: string | null;
}

// ---------------------------------------------------------------------
// Audit log
// ---------------------------------------------------------------------

export type AuditCategory = 'domain' | 'security' | 'system';
export type AuditSeverity = 'info' | 'warning' | 'critical';

/**
 * One entry of GET /api/security/audit-log. Mirrors `AuditLogEntry`
 * (modules/security/types/audit-log.types.ts).
 *
 * `prevHash`/`hash`/`sequence` are the append-only chain: each entry
 * commits to the one before it, so a retroactive edit breaks the chain
 * from that point on. They are surfaced (not hidden) because they are
 * what makes the ledger checkable -- see the verify endpoint.
 */
export interface AuditLogEntry {
  _id?: string;
  sequence: number;
  prevHash: string;
  hash: string;
  action: string;
  category: AuditCategory;
  severity: AuditSeverity;
  userId: string;
  tenantId: string;
  entityType?: string;
  entityId?: string;
  ipAddress?: string;
  userAgent?: string;
  metadata?: Record<string, unknown>;
  changes?: Record<string, unknown>;
  eventId?: string;
  /** ISO string. */
  recordedAt: string;
  createdAt?: string;
}

/**
 * Query parameters GET /api/security/audit-log actually reads. Mirrors
 * `auditLogQuerySchema` (shared/validations/audit-log.schema.ts),
 * including its limits: `limit` is capped at 100 server-side and
 * `action` at 200 characters.
 *
 * `tenantId` is accepted from the caller ONLY when the caller is a
 * super admin -- AuditLogController overwrites it with
 * `context.tenantId` for everyone else, so a non-super-admin passing it
 * silently gets their own tenant rather than an error.
 */
export interface AuditLogQueryParams {
  category?: AuditCategory;
  severity?: AuditSeverity;
  action?: string;
  entityType?: string;
  entityId?: string;
  userId?: string;
  /** ISO date string; server coerces with z.coerce.date(). */
  startDate?: string;
  endDate?: string;
  /** Super admins only. Ignored (overwritten) for every other caller. */
  tenantId?: string;
  page?: number;
  /** Server caps this at 100. */
  limit?: number;
}

export interface AuditLogListResult {
  data: AuditLogEntry[];
  pagination: PlatformPagination;
}

/** Response of GET /api/security/audit-log/verify. Mirrors `ChainVerificationResult`. */
export interface AuditChainVerification {
  valid: boolean;
  brokenAtSequence?: number;
  reason?: string;
  checkedEntries: number;
  /** ISO string. */
  verifiedAt: string;
}

// ---------------------------------------------------------------------
// Member mutations
// ---------------------------------------------------------------------

/**
 * Body of POST /api/organizations/:id/members/invite.
 *
 * The controller reads `{ email, role, orgUnitId }` straight off the
 * request with no zod schema; `OrganizationService.addMember` then
 * checks `role` against ORGANIZATION_ROLES and enforces the seat limit.
 * There is no server-side email validation at all, which is why
 * ../utils validates it before sending.
 */
export interface InviteMemberPayload {
  email: string;
  /** Must be one of ORGANIZATION_ROLES (every Role except SUPER_ADMIN). */
  role: string;
  orgUnitId?: string;
}

/**
 * Body of PATCH /api/organizations/:id/members/:memberId.
 *
 * The controller reads `{ role }` only. `OrganizationService
 * .updateMemberRole` validates against ORGANIZATION_ROLES and refuses
 * outright when the target member's current role is
 * `organization_owner` -- ownership moves through an explicit transfer
 * flow, never a generic role update.
 *
 * CUSTOM ROLES ARE NOT ACCEPTED HERE. The check is against the static
 * Role enum, so a role created via POST /api/security/roles cannot be
 * assigned to a member through this endpoint. See
 * PLATFORM_ADMIN_BACKEND_GAPS.md.
 */
export interface UpdateMemberRolePayload {
  role: string;
}

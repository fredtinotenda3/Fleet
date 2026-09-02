// frontend/modules/platform-admin/services/platform-access.api.ts
//
// Users / Roles & Permissions / API keys / Audit log.
//
// Every call maps to a route that already exists. No endpoint is
// invented, no response is reshaped, and no request carries a
// tenant/organization identifier that the server would not have derived
// from the session anyway -- with one deliberate exception, documented
// at `listAuditLog` below, where the server itself reads a `tenantId`
// filter for super admins.
//
// Kept in a second file rather than appended to platform-admin.api.ts:
// that file addresses /api/platform and /api/tenancy, this one
// /api/security and /api/organizations. They have different gates and
// different scoping rules, and one 400-line service module hides that.

import { apiClient } from '@/shared/utils/api-client.utils';
import type {
  ApiKeyCreateResult,
  ApiKeySummary,
  AuditChainVerification,
  AuditLogListResult,
  AuditLogQueryParams,
  CreateApiKeyPayload,
  CustomRole,
  InviteMemberPayload,
  PermissionDefinition,
  UpdateMemberRolePayload,
} from '../types';

const SECURITY_BASE = '/api/security';
const ORGANIZATIONS_BASE = '/api/organizations';

/** The server caps `limit` at 100 (`auditLogQuerySchema`); asking for more is a 400, not a bigger page. */
export const AUDIT_LOG_MAX_LIMIT = 100;

export const platformAccessApi = {
  // ── Roles ───────────────────────────────────────────────────────────

  /**
   * GET /api/security/roles
   *
   * TENANT-SCOPED TO THE CALLER. `RoleController.listRoles` resolves
   * `tenantId` from `getTenantFromRequest(req)` and passes it to
   * `customRoleService.listRoles`, so this can only ever return the
   * caller's own organization's custom roles. There is no cross-tenant
   * role listing anywhere in app/api.
   *
   * `activeOnly` defaults to TRUE server-side -- the controller reads
   * `searchParams.get('activeOnly') !== 'false'`, so anything other
   * than the literal string "false" means active-only. Passing the
   * literal 'false' is the only way to include inactive roles.
   */
  async listCustomRoles(options?: { activeOnly?: boolean }): Promise<CustomRole[]> {
    return apiClient.get<CustomRole[]>(`${SECURITY_BASE}/roles`, {
      params: {
        // Sent as the literal string the controller compares against,
        // rather than a boolean that would serialise to "true"/"false"
        // by coincidence.
        activeOnly: options?.activeOnly === false ? 'false' : 'true',
      },
    });
  },

  /**
   * GET /api/security/permissions
   *
   * The PermissionRegistry catalogue -- display metadata for every
   * permission key, static and dynamic. This one is NOT tenant-scoped:
   * the registry is a process-global catalogue, not stored data.
   *
   * `category` narrows it server-side via
   * `permissionRegistry.getByCategory`.
   */
  async listPermissionDefinitions(category?: string): Promise<PermissionDefinition[]> {
    return apiClient.get<PermissionDefinition[]>(`${SECURITY_BASE}/permissions`, {
      params: { category },
    });
  },

  // ── API keys ────────────────────────────────────────────────────────

  /**
   * GET /api/security/api-keys
   *
   * ORGANIZATION-SCOPED, NOT PLATFORM-SCOPED. `ApiKeyController.list`
   * calls `apiKeyService.listForOrganization(context.tenantId)` -- the
   * caller's own tenant, with no parameter that would widen it. A page
   * built on this shows one organization's keys and must say so.
   *
   * `keyHash` is stripped server-side before the response is built, so
   * nothing secret is on this wire.
   */
  async listApiKeys(options?: { includeRevoked?: boolean }): Promise<ApiKeySummary[]> {
    return apiClient.get<ApiKeySummary[]>(`${SECURITY_BASE}/api-keys`, {
      params: {
        // The controller compares against the literal string 'true';
        // anything else means false.
        includeRevoked: options?.includeRevoked ? 'true' : undefined,
      },
    });
  },

  /**
   * POST /api/security/api-keys
   *
   * Returns `{ apiKey, plaintextKey }`. The plaintext is generated,
   * hashed, and the hash stored -- it is returned HERE AND NOWHERE
   * ELSE, and `getById`/`list` can never produce it again. A caller
   * that discards this response has lost the key permanently.
   */
  async createApiKey(payload: CreateApiKeyPayload): Promise<ApiKeyCreateResult> {
    return apiClient.post<ApiKeyCreateResult>(`${SECURITY_BASE}/api-keys`, payload);
  },

  /**
   * DELETE /api/security/api-keys/:id
   *
   * `reason` is read from the request BODY
   * (`const body = await req.json().catch(() => ({}))`), which is
   * unusual for a DELETE but is what the controller does -- so it is
   * sent as a body here rather than a query parameter, where it would
   * be silently dropped. `apiClient.delete` spreads its options into
   * the `fetch` init, so `body` passes through.
   *
   * Revoking an already-revoked key returns 409 ALREADY_REVOKED, which
   * surfaces as an ApiError rather than a silent success.
   */
  async revokeApiKey(id: string, reason?: string): Promise<{ message: string }> {
    return apiClient.delete<{ message: string }>(
      `${SECURITY_BASE}/api-keys/${encodeURIComponent(id)}`,
      {
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(reason ? { reason } : {}),
      }
    );
  },

  // ── Audit log ───────────────────────────────────────────────────────

  /**
   * GET /api/security/audit-log
   *
   * The one endpoint in this slice that is genuinely cross-tenant --
   * but only for super admins. `AuditLogController.list` builds
   * `tenantId: context.isSuperAdmin ? filters.tenantId : context.tenantId`,
   * so:
   *
   *   * a super admin passing no `tenantId` sees EVERY tenant's ledger;
   *   * a super admin passing one sees that tenant's;
   *   * everyone else sees their own, whatever they pass -- the filter
   *     is overwritten, not rejected, so a non-super-admin who sends a
   *     tenantId gets a silently different answer than they asked for.
   *     The UI only offers the control to super admins for that reason.
   *
   * `limit` is capped at 100 by `auditLogQuerySchema`; exceeding it is
   * a 400 rather than a truncated page, so the caller clamps.
   */
  async listAuditLog(params?: AuditLogQueryParams): Promise<AuditLogListResult> {
    return apiClient.get<AuditLogListResult>(`${SECURITY_BASE}/audit-log`, {
      params: {
        category: params?.category,
        severity: params?.severity,
        action: params?.action,
        entityType: params?.entityType,
        entityId: params?.entityId,
        userId: params?.userId,
        startDate: params?.startDate,
        endDate: params?.endDate,
        tenantId: params?.tenantId,
        page: params?.page,
        limit:
          typeof params?.limit === 'number'
            ? Math.min(AUDIT_LOG_MAX_LIMIT, Math.max(1, Math.trunc(params.limit)))
            : undefined,
      },
    });
  },

  /**
   * GET /api/security/audit-log/verify
   *
   * Walks the hash chain from `fromSequence` and reports the first
   * break. NOTE: this is a real computation over the ledger, not a
   * cached flag -- it is requested on demand from a button, never on
   * page load, and never polled.
   *
   * A failed verification also publishes an
   * AuditChainIntegrityFailureEvent server-side, so triggering this
   * repeatedly against a broken chain generates events. One more reason
   * it is user-initiated only.
   */
  async verifyAuditChain(fromSequence?: number): Promise<AuditChainVerification> {
    return apiClient.get<AuditChainVerification>(`${SECURITY_BASE}/audit-log/verify`, {
      params: { fromSequence },
    });
  },

  // ── Member mutations ────────────────────────────────────────────────
  //
  // All five are gated on Permission.ORG_MEMBERS_MANAGE and take the
  // organization from the URL. NOTHING BINDS THAT PATH PARAMETER TO THE
  // CALLER'S TENANT -- see ../types/access.types.ts, constraint 3.
  // Callers MUST gate on `canManageMembersFor()` before invoking any of
  // them. These functions do not enforce it themselves because a
  // service module cannot see the session; the hooks and pages do.

  /**
   * POST /api/organizations/:id/members/invite
   *
   * Creates an OrganizationInvite and emails it. Fails with
   * SEAT_LIMIT_REACHED when the organization is at its seat count, and
   * with a conflict when the email is already a member or already has a
   * pending invite.
   */
  async inviteMember(organizationId: string, payload: InviteMemberPayload): Promise<unknown> {
    return apiClient.post(
      `${ORGANIZATIONS_BASE}/${encodeURIComponent(organizationId)}/members/invite`,
      payload
    );
  },

  /**
   * POST /api/organizations/:id/members/:memberId/suspend
   *
   * Refuses for `organization_owner` (CANNOT_SUSPEND_OWNER) and for an
   * already-suspended member (409).
   */
  async suspendMember(organizationId: string, memberId: string): Promise<{ message: string }> {
    return apiClient.post<{ message: string }>(
      `${ORGANIZATIONS_BASE}/${encodeURIComponent(organizationId)}/members/${encodeURIComponent(memberId)}/suspend`
    );
  },

  /** POST /api/organizations/:id/members/:memberId/restore. 409 when the member is not suspended. */
  async restoreMember(organizationId: string, memberId: string): Promise<{ message: string }> {
    return apiClient.post<{ message: string }>(
      `${ORGANIZATIONS_BASE}/${encodeURIComponent(organizationId)}/members/${encodeURIComponent(memberId)}/restore`
    );
  },

  /**
   * PATCH /api/organizations/:id/members/:memberId
   *
   * Assigns a STATIC role. `OrganizationService.updateMemberRole`
   * validates against ORGANIZATION_ROLES and refuses when the target is
   * the organization owner. A custom role from
   * GET /api/security/roles cannot be assigned here -- see
   * PLATFORM_ADMIN_BACKEND_GAPS.md.
   */
  async updateMemberRole(
    organizationId: string,
    memberId: string,
    payload: UpdateMemberRolePayload
  ): Promise<{ message: string }> {
    return apiClient.patch<{ message: string }>(
      `${ORGANIZATIONS_BASE}/${encodeURIComponent(organizationId)}/members/${encodeURIComponent(memberId)}`,
      payload
    );
  },

  /** DELETE /api/organizations/:id/members/:memberId. Removes the membership outright. */
  async removeMember(organizationId: string, memberId: string): Promise<{ message: string }> {
    return apiClient.delete<{ message: string }>(
      `${ORGANIZATIONS_BASE}/${encodeURIComponent(organizationId)}/members/${encodeURIComponent(memberId)}`
    );
  },
};

export default platformAccessApi;

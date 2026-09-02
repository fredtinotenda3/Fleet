// frontend/modules/platform-admin/utils/platform-access.utils.ts
//
// Pure presentation and shaping helpers for the Users / Roles &
// Permissions / API keys / Audit log slice.
//
// Everything here is a plain function over plain data, for the same
// reason platform-admin.utils.ts is: this repo's Jest runs
// `testEnvironment: 'node'` with no jsdom and no React Testing Library,
// so logic that lives inside a component cannot be tested at all.
// Anything worth asserting therefore lives here and the components stay
// declarative.
//
// TWO RULES CARRIED OVER FROM THE REST OF THE MODULE:
//
//   * FAIL CLOSED on anything that gates a write. A missing session
//     tenant, an unmatched organization or an unrecognised value all
//     resolve to "not permitted", never to "permitted".
//   * NEVER PRESENT AN UNKNOWN AS BENIGN. An unrecognised status does
//     not get the same green badge as 'active'; an absent date renders
//     as an em dash, never as today.

import {
  Permission,
  Role,
  ASSIGNABLE_ORGANIZATION_ROLES,
  ORGANIZATION_ROLES,
  permissionService,
  rolePermissions,
} from '@/server/permissions/roles';
import type {
  ApiKeySummary,
  AuditLogQueryParams,
  AuditSeverity,
  CustomRole,
  DirectoryUser,
  DirectoryUserStatus,
  Organization,
  PermissionDefinition,
  PlatformOrganization,
  StaticRoleDefinition,
  UserDirectoryResult,
} from '../types';
import type { BadgePresentation, FieldErrors } from './platform-admin.utils';
import { isSameOrganization, tenantIdentifier } from './platform-admin.utils';

// ---------------------------------------------------------------------
// Users directory
// ---------------------------------------------------------------------

/**
 * Flattens a page of organizations into one user directory.
 *
 * WHY THIS IS DERIVED RATHER THAN FETCHED: there is no platform user
 * endpoint (see ../types/access.types.ts, constraint 2). What exists is
 * `GET /api/platform/organizations`, which returns FULL Organization
 * documents -- `PlatformService.listOrganizations` passes no projection
 * -- and `Organization` embeds `members[]` and `invites[]`. So the
 * directory costs zero extra requests, and its scope is exactly the
 * page that was read.
 *
 * PENDING INVITES ARE INCLUDED but flagged, and only those whose status
 * is 'pending'. An accepted invite has a corresponding member row and
 * would otherwise appear twice; an expired or cancelled one is not a
 * person anyone can act on. Both are dropped rather than shown as
 * users who do not exist.
 *
 * Deduplicates on (organizationId, userId) so an organization whose
 * document somehow carries a repeated member -- and a pending invite
 * for an email that is already a member -- yields one row, not two.
 */
export function buildUserDirectory(
  organizations: readonly PlatformOrganization[] | null | undefined,
  options?: { hasNextPage?: boolean }
): UserDirectoryResult {
  const list = Array.isArray(organizations) ? organizations : [];
  const users: DirectoryUser[] = [];
  const seen = new Set<string>();

  for (const org of list) {
    if (!org) continue;

    const organizationId = String(org._id ?? '');
    const organizationName = org.name ?? 'Unnamed organization';
    const organizationTenantId = tenantIdentifier(org);

    for (const member of Array.isArray(org.members) ? org.members : []) {
      if (!member || !member.userId) continue;

      const key = `${organizationId}::${member.userId}`;
      if (seen.has(key)) continue;
      seen.add(key);

      users.push({
        userId: member.userId,
        email: member.email ?? '',
        name: member.name ?? '',
        role: member.role ?? '',
        status: member.status,
        organizationId,
        organizationName,
        organizationTenantId,
        joinedAt: toIsoStringOrUndefined(member.joinedAt),
        invitedAt: toIsoStringOrUndefined(member.invitedAt),
        orgUnitId: member.orgUnitId,
        isPendingInvite: false,
      });
    }

    for (const invite of Array.isArray(org.invites) ? org.invites : []) {
      // Only 'pending'. An accepted invite duplicates a member row;
      // expired and cancelled ones are not people anyone can act on.
      if (!invite || invite.status !== 'pending' || !invite.email) continue;

      // Invites have no userId, so the email within the organization is
      // the identity. Guarded against an invite for someone who is
      // already a member.
      const emailKey = invite.email.toLowerCase();
      const key = `${organizationId}::invite::${emailKey}`;
      const alreadyMember = users.some(
        (user) =>
          user.organizationId === organizationId && user.email.toLowerCase() === emailKey
      );
      if (seen.has(key) || alreadyMember) continue;
      seen.add(key);

      users.push({
        // There is no account behind a pending invite, so there is no
        // userId to report. The token is NOT used as a stand-in: it is
        // a credential that grants organization access to whoever holds
        // it, and it must never reach a table cell or a React key.
        userId: '',
        email: invite.email,
        name: '',
        role: invite.role ?? '',
        status: 'invited',
        organizationId,
        organizationName,
        organizationTenantId,
        invitedAt: undefined,
        orgUnitId: invite.orgUnitId,
        isPendingInvite: true,
      });
    }
  }

  return {
    users,
    organizationsScanned: list.length,
    partial: options?.hasNextPage === true,
  };
}

/** ISO string for a Date or date-like string; undefined for anything unusable. */
function toIsoStringOrUndefined(value: unknown): string | undefined {
  if (!value) return undefined;
  const date = value instanceof Date ? value : new Date(String(value));
  return Number.isNaN(date.getTime()) ? undefined : date.toISOString();
}

/**
 * Case-insensitive substring filter across the fields an operator would
 * actually search by: email, name and organization.
 *
 * Role is deliberately NOT searched. Typing "driver" to find a person
 * and getting every driver in the fleet is a worse result than no
 * match, and the role filter is a separate, exact control.
 */
export function filterDirectory(
  users: readonly DirectoryUser[],
  query: string
): DirectoryUser[] {
  const needle = query.trim().toLowerCase();
  if (!needle) return [...users];

  return users.filter((user) =>
    [user.email, user.name, user.organizationName].some((field) =>
      (field ?? '').toLowerCase().includes(needle)
    )
  );
}

/** Exact filters, each skipped when unset. Applied after the text search. */
export function applyDirectoryFilters(
  users: readonly DirectoryUser[],
  filters: { status?: DirectoryUserStatus | 'all'; role?: string | 'all'; organizationId?: string | 'all' }
): DirectoryUser[] {
  return users.filter((user) => {
    if (filters.status && filters.status !== 'all' && user.status !== filters.status) return false;
    if (filters.role && filters.role !== 'all' && user.role !== filters.role) return false;
    if (
      filters.organizationId &&
      filters.organizationId !== 'all' &&
      user.organizationId !== filters.organizationId
    ) {
      return false;
    }
    return true;
  });
}

/**
 * Stable directory ordering: organization, then name, then email.
 *
 * Named explicitly rather than left to the order members happen to sit
 * in their organization document -- that order is insertion order in
 * Mongo and would reshuffle a table between refetches for no reason a
 * reader could see.
 */
export function sortDirectory(users: readonly DirectoryUser[]): DirectoryUser[] {
  return [...users].sort((a, b) => {
    const byOrg = a.organizationName.localeCompare(b.organizationName);
    if (byOrg !== 0) return byOrg;
    const byName = (a.name || '￿').localeCompare(b.name || '￿');
    if (byName !== 0) return byName;
    return a.email.localeCompare(b.email);
  });
}

/** Counts by status, for the directory's summary cards. */
export function summariseDirectory(users: readonly DirectoryUser[]): {
  total: number;
  active: number;
  invited: number;
  suspended: number;
} {
  let active = 0;
  let invited = 0;
  let suspended = 0;

  for (const user of users) {
    if (user.status === 'active') active += 1;
    else if (user.status === 'invited') invited += 1;
    else if (user.status === 'suspended') suspended += 1;
  }

  return { total: users.length, active, invited, suspended };
}

/**
 * How a member status should read at a glance.
 *
 * `suspended` is destructive and `invited` merely pending -- the same
 * distinction organizationStatusPresentation draws, for the same
 * reason: one is a person who has been cut off and may be blocked,
 * the other is a person who has not arrived yet.
 */
export function memberStatusPresentation(
  status: DirectoryUserStatus | string | null | undefined
): BadgePresentation {
  switch (status) {
    case 'active':
      return { badgeVariant: 'outline', dotClassName: 'bg-success' };
    case 'invited':
      return { badgeVariant: 'secondary', dotClassName: 'bg-warning' };
    case 'suspended':
      return { badgeVariant: 'destructive', dotClassName: 'bg-destructive' };
    default:
      // An unrecognised status is never rendered as healthy.
      return { badgeVariant: 'secondary', dotClassName: 'bg-muted-foreground' };
  }
}

export function memberStatusLabel(
  status: DirectoryUserStatus | string | null | undefined
): string {
  switch (status) {
    case 'active':
      return 'Active';
    case 'invited':
      return 'Invited';
    case 'suspended':
      return 'Suspended';
    default:
      // Verbatim, not "Unknown": an operator who sees the literal value
      // can report which one it was.
      return status ? String(status) : 'Unknown';
  }
}

// ---------------------------------------------------------------------
// The write gate
// ---------------------------------------------------------------------

/**
 * Whether member writes may be offered for `org`.
 *
 * THIS IS THE CONSTRAINT, not a UI preference, and it is the same shape
 * as `canManageOrgUnitsFor` for a different reason worth stating
 * precisely:
 *
 *   org units      the endpoint IGNORES the organization you name and
 *                  acts on your own -- so a cross-tenant write would
 *                  silently land in the wrong place.
 *   members        the endpoint HONOURS the organization you name and
 *                  nothing checks that you are entitled to it.
 *                  `OrganizationService.getOrganization(organizationId,
 *                  tenantId)` ignores its `tenantId` argument entirely
 *                  and resolves through `resolveOrganization()` with no
 *                  tenant comparison; `withAuth` checks permissions,
 *                  not ownership.
 *
 * The second is the more serious of the two: the first misfires, the
 * second is a missing authorization check. Offering the UI would be
 * productising it. Restricting to the caller's own organization keeps
 * this module inside the boundary the server intends even though the
 * server does not currently enforce it, and the finding is written up
 * in PLATFORM_ADMIN_BACKEND_GAPS.md rather than quietly relied upon.
 *
 * Fails CLOSED: no session tenant, or an org that cannot be matched to
 * it, both yield false.
 */
export function canManageMembersFor(
  org: (Pick<Organization, '_id' | 'slug'> & { tenantId?: string }) | null | undefined,
  sessionTenantId: string | null | undefined
): boolean {
  return isSameOrganization(org, sessionTenantId);
}

// ---------------------------------------------------------------------
// Roles
// ---------------------------------------------------------------------

/** Human labels for the static Role enum. */
const ROLE_LABELS: Record<string, string> = {
  super_admin: 'Super Admin',
  organization_owner: 'Organization Owner',
  organization_admin: 'Organization Admin',
  branch_manager: 'Branch Manager',
  department_manager: 'Department Manager',
  fleet_manager: 'Fleet Manager',
  workshop_manager: 'Workshop Manager',
  supervisor: 'Supervisor',
  accountant: 'Accountant',
  dispatcher: 'Dispatcher',
  driver: 'Driver',
  mechanic: 'Mechanic',
  auditor: 'Auditor',
  viewer: 'Viewer',
};

/**
 * Title-cases an unrecognised role string rather than hiding it.
 *
 * A member row can carry a legacy role value that is no longer in the
 * enum. Showing "Unknown" would lose which value it was, and the
 * operator investigating is exactly the person who needs it.
 */
export function roleLabel(role: string | null | undefined): string {
  if (!role) return 'Unknown';
  if (role in ROLE_LABELS) return ROLE_LABELS[role];
  return role
    .split(/[_\s-]+/)
    .filter(Boolean)
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(' ');
}

/**
 * The static role matrix, read from source rather than over the wire.
 *
 * There is no endpoint for this -- `GET /api/security/roles` returns
 * tenant-defined CUSTOM roles only. `rolePermissions` is a plain
 * TypeScript module the frontend already imports (Sidebar.tsx uses
 * `permissionService` from the same file), so reading it here gives
 * exactly the matrix the server enforces, with no possibility of drift.
 *
 * Sorted by permission count descending: the interesting question a
 * reader brings to this table is "who can do the most", and an
 * alphabetical list buries it.
 */
export function buildStaticRoleDefinitions(): StaticRoleDefinition[] {
  const assignable = new Set<string>(ASSIGNABLE_ORGANIZATION_ROLES as string[]);
  const organizationRoles = new Set<string>(ORGANIZATION_ROLES as string[]);

  return (Object.values(Role) as Role[])
    .map((role) => ({
      role,
      label: roleLabel(role),
      permissions: rolePermissions[role] ?? [],
      // SUPER_ADMIN is the only role ORGANIZATION_ROLES excludes; it is
      // the platform role and is never offered on an assignment
      // surface.
      isPlatformRole: !organizationRoles.has(role),
      isAssignable: assignable.has(role),
    }))
    .sort((a, b) => {
      const byCount = b.permissions.length - a.permissions.length;
      return byCount !== 0 ? byCount : a.label.localeCompare(b.label);
    });
}

/** The roles that may be set on an existing member, in a stable display order. */
export function assignableRoleOptions(): Array<{ value: string; label: string }> {
  return (ASSIGNABLE_ORGANIZATION_ROLES as string[])
    .map((role) => ({ value: role, label: roleLabel(role) }))
    .sort((a, b) => a.label.localeCompare(b.label));
}

/**
 * Whether a role change is worth sending.
 *
 * Blocks the two cases the server refuses, so an operator gets an
 * explanation instead of decoding a toast: the organization owner's
 * role cannot be changed at all (CANNOT_MODIFY_OWNER), and a role
 * outside ORGANIZATION_ROLES is a ValidationError. A no-op change is
 * blocked too -- it would write an audit entry recording a change that
 * did not happen.
 */
export function validateRoleChange(input: {
  currentRole: string;
  nextRole: string;
}): FieldErrors {
  const errors: FieldErrors = {};
  const next = (input.nextRole ?? '').trim();

  if (!next) {
    errors.role = 'Choose a role.';
    return errors;
  }
  if (input.currentRole === 'organization_owner') {
    errors.role =
      'The organization owner’s role cannot be changed here. Ownership moves through an explicit transfer.';
    return errors;
  }
  if (!(ASSIGNABLE_ORGANIZATION_ROLES as string[]).includes(next)) {
    errors.role = `"${next}" is not a role that can be assigned to a member.`;
    return errors;
  }
  if (next === input.currentRole) {
    errors.role = 'That is already this member’s role.';
  }

  return errors;
}

const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

/**
 * Validates the invite-member form.
 *
 * THIS IS THE ONLY VALIDATION THAT EXISTS for the email.
 * `OrganizationController.inviteMember` destructures
 * `{ email, role, orgUnitId }` straight off the request body with no
 * zod schema, and `OrganizationService.addMember` checks only the role
 * (against ORGANIZATION_ROLES) and the seat limit. An empty or
 * malformed address is accepted and stored as an invitation nobody can
 * ever accept, so it is blocked here.
 *
 * The role list is ASSIGNABLE_ORGANIZATION_ROLES rather than
 * ORGANIZATION_ROLES: the server would accept `organization_owner` on
 * an invite (addMember validates against the wider set), but creating a
 * second owner by invitation contradicts the one-owner rule
 * OrganizationService enforces everywhere else, and there is no
 * ownership-transfer endpoint to undo it with.
 */
export function validateInviteMember(input: { email?: string; role?: string }): FieldErrors {
  const errors: FieldErrors = {};

  const email = (input.email ?? '').trim();
  if (!email) {
    errors.email = 'Email is required.';
  } else if (!EMAIL_PATTERN.test(email)) {
    errors.email = 'Enter a valid email address.';
  }

  const role = (input.role ?? '').trim();
  if (!role) {
    errors.role = 'Choose a role.';
  } else if (!(ASSIGNABLE_ORGANIZATION_ROLES as string[]).includes(role)) {
    errors.role = `"${role}" is not a role that can be assigned to a member.`;
  }

  return errors;
}

/** Groups permission keys by the registry category, for a readable matrix. */
export function groupPermissionsByCategory(
  definitions: readonly PermissionDefinition[]
): Array<{ category: string; permissions: PermissionDefinition[] }> {
  const byCategory = new Map<string, PermissionDefinition[]>();

  for (const definition of definitions) {
    if (!definition || typeof definition.key !== 'string') continue;
    const category = definition.category || 'Uncategorised';
    const bucket = byCategory.get(category) ?? [];
    bucket.push(definition);
    byCategory.set(category, bucket);
  }

  return Array.from(byCategory.entries())
    .map(([category, permissions]) => ({
      category,
      permissions: [...permissions].sort((a, b) => a.key.localeCompare(b.key)),
    }))
    .sort((a, b) => a.category.localeCompare(b.category));
}

/**
 * Unions the registry catalogue with the static Permission enum.
 *
 * These are two different things and neither is a superset of the
 * other. The registry (`GET /api/security/permissions`) carries display
 * metadata and dynamic custom keys, but only for permissions something
 * actually registered -- `bootstrapPermissionRegistry()` populates it,
 * and a static Permission that was never registered is simply absent.
 * The enum is the complete static set but carries no labels.
 *
 * Showing only the registry would silently omit enforceable
 * permissions from a screen whose entire job is to say what a role can
 * do. Unregistered members are synthesised with a derived label and
 * marked so the gap is visible rather than papered over.
 */
export function mergePermissionCatalogue(
  registry: readonly PermissionDefinition[] | null | undefined
): PermissionDefinition[] {
  const merged = new Map<string, PermissionDefinition>();

  for (const definition of Array.isArray(registry) ? registry : []) {
    if (definition && typeof definition.key === 'string' && definition.key) {
      merged.set(definition.key, definition);
    }
  }

  for (const permission of permissionService.getAllPermissions()) {
    const key = String(permission);
    if (merged.has(key)) continue;
    merged.set(key, {
      key,
      label: permissionKeyLabel(key),
      // Derived from the key's own namespace ("vehicle:view" ->
      // "vehicle"), which is how the registry categorises them too.
      category: key.includes(':') ? key.split(':')[0] : 'general',
      description: 'Enforced by the permission engine; not present in the registry catalogue.',
      requiresResourceScope: false,
      isCustom: false,
    });
  }

  return Array.from(merged.values());
}

/** "vehicle:view" -> "Vehicle view". Used only for keys the registry did not label. */
export function permissionKeyLabel(key: string): string {
  if (!key) return '';
  const readable = key.replace(/[:_.]+/g, ' ').replace(/\s+/g, ' ').trim();
  return readable.charAt(0).toUpperCase() + readable.slice(1);
}

/** The permission keys a custom role grants: static members plus dynamic keys, deduplicated. */
export function customRolePermissionKeys(role: Pick<CustomRole, 'permissions' | 'customPermissionKeys'>): string[] {
  const keys = new Set<string>();
  for (const permission of Array.isArray(role.permissions) ? role.permissions : []) {
    if (permission) keys.add(String(permission));
  }
  for (const key of Array.isArray(role.customPermissionKeys) ? role.customPermissionKeys : []) {
    if (key) keys.add(String(key));
  }
  return Array.from(keys).sort();
}

/**
 * The permissions a custom role EFFECTIVELY grants, including anything
 * inherited from its `baseRole`.
 *
 * `CustomRole.permissions` is documented as ADDITIVE on top of
 * `baseRole` (see custom-role.types.ts), so rendering only the explicit
 * list would understate what the role can do -- on a screen whose whole
 * purpose is to answer that question. The base contribution is returned
 * separately so the UI can show which grants are inherited rather than
 * flattening the distinction away.
 */
export function effectiveCustomRolePermissions(role: CustomRole): {
  inherited: string[];
  direct: string[];
  all: string[];
} {
  const direct = customRolePermissionKeys(role);
  const inherited = role.baseRole
    ? (rolePermissions[role.baseRole] ?? []).map((permission) => String(permission)).sort()
    : [];

  const all = Array.from(new Set([...inherited, ...direct])).sort();
  return { inherited, direct, all };
}

/** Presentation for a custom role's active/inactive status. */
export function customRoleStatusPresentation(status: string | null | undefined): BadgePresentation {
  return status === 'active'
    ? { badgeVariant: 'outline', dotClassName: 'bg-success' }
    : { badgeVariant: 'secondary', dotClassName: 'bg-muted-foreground' };
}

// ---------------------------------------------------------------------
// API keys
// ---------------------------------------------------------------------

/**
 * The status to DISPLAY for a key, which is not always its stored one.
 *
 * `ApiKey.status` is written at creation and changed on revoke. It is
 * NOT swept to 'expired' by a background job -- `ApiKeyService.verify`
 * checks `expiresAt` at authentication time instead. So a key whose
 * expiry has passed still reads `status: 'active'` in the list
 * response while being unusable in practice.
 *
 * Showing that stored value verbatim would tell an operator a dead key
 * is live. Revocation still wins over expiry: a revoked key is revoked
 * regardless of its expiry date, and that is the more serious fact.
 */
export function effectiveApiKeyStatus(
  key: Pick<ApiKeySummary, 'status' | 'expiresAt'>,
  now: Date = new Date()
): ApiKeySummary['status'] {
  if (key.status === 'revoked') return 'revoked';

  if (key.expiresAt) {
    const expiry = new Date(key.expiresAt);
    if (!Number.isNaN(expiry.getTime()) && expiry.getTime() <= now.getTime()) {
      return 'expired';
    }
  }

  return key.status;
}

export function apiKeyStatusPresentation(status: string | null | undefined): BadgePresentation {
  switch (status) {
    case 'active':
      return { badgeVariant: 'outline', dotClassName: 'bg-success' };
    case 'expired':
      return { badgeVariant: 'secondary', dotClassName: 'bg-warning' };
    case 'revoked':
      return { badgeVariant: 'destructive', dotClassName: 'bg-destructive' };
    default:
      return { badgeVariant: 'secondary', dotClassName: 'bg-muted-foreground' };
  }
}

export function apiKeyStatusLabel(status: string | null | undefined): string {
  switch (status) {
    case 'active':
      return 'Active';
    case 'expired':
      return 'Expired';
    case 'revoked':
      return 'Revoked';
    default:
      return status ? String(status) : 'Unknown';
  }
}

/**
 * Validates the create-API-key form against `apiKeyCreateSchema`:
 * name 1-100, at least one permission.
 *
 * The expiry rule is this module's own, not the server's: the schema
 * accepts any date, including one in the past, which would mint a key
 * that is dead on arrival. Blocking it client-side is the only place
 * that check exists.
 */
export function validateCreateApiKey(
  input: { name?: string; permissions?: string[]; expiresAt?: string | null },
  now: Date = new Date()
): FieldErrors {
  const errors: FieldErrors = {};

  const name = (input.name ?? '').trim();
  if (!name) {
    errors.name = 'Name is required.';
  } else if (name.length > 100) {
    errors.name = 'Name must be 100 characters or fewer.';
  }

  const permissions = Array.isArray(input.permissions) ? input.permissions.filter(Boolean) : [];
  if (permissions.length === 0) {
    errors.permissions = 'Grant at least one permission.';
  }

  if (input.expiresAt) {
    const expiry = new Date(input.expiresAt);
    if (Number.isNaN(expiry.getTime())) {
      errors.expiresAt = 'Enter a valid date.';
    } else if (expiry.getTime() <= now.getTime()) {
      errors.expiresAt = 'Expiry must be in the future.';
    }
  }

  return errors;
}

/**
 * Turns the form's fields into the exact POST body.
 *
 * Sends `expiresAt: null` explicitly for a never-expiring key rather
 * than omitting it: the schema is `.nullable().optional()`, and an
 * explicit null says "no expiry" where an omitted key says
 * "unspecified".
 */
export function toCreateApiKeyPayload(input: {
  name: string;
  permissions: string[];
  expiresAt?: string | null;
}): { name: string; permissions: string[]; expiresAt: string | null } {
  const expiresAt = (input.expiresAt ?? '').trim();
  return {
    name: input.name.trim(),
    permissions: [...new Set(input.permissions.filter(Boolean))],
    expiresAt: expiresAt ? new Date(expiresAt).toISOString() : null,
  };
}

// ---------------------------------------------------------------------
// Audit log
// ---------------------------------------------------------------------

export function auditSeverityPresentation(severity: string | null | undefined): BadgePresentation {
  switch (severity) {
    case 'info':
      return { badgeVariant: 'outline', dotClassName: 'bg-muted-foreground' };
    case 'warning':
      return { badgeVariant: 'secondary', dotClassName: 'bg-warning' };
    case 'critical':
      return { badgeVariant: 'destructive', dotClassName: 'bg-destructive' };
    default:
      return { badgeVariant: 'secondary', dotClassName: 'bg-muted-foreground' };
  }
}

export function auditSeverityLabel(severity: AuditSeverity | string | null | undefined): string {
  switch (severity) {
    case 'info':
      return 'Info';
    case 'warning':
      return 'Warning';
    case 'critical':
      return 'Critical';
    default:
      return severity ? String(severity) : 'Unknown';
  }
}

/** "MEMBER_ROLE_UPDATED" -> "Member role updated". The stored value stays available for filtering. */
export function auditActionLabel(action: string | null | undefined): string {
  if (!action) return 'Unknown action';
  const readable = action.replace(/[_.]+/g, ' ').trim().toLowerCase();
  return readable.charAt(0).toUpperCase() + readable.slice(1);
}

/**
 * Normalises the filter form into exactly the query the endpoint reads.
 *
 * Four things happen here, each of which is a bug if it does not:
 *
 *   * empty strings are DROPPED, not sent. `''` would be rejected by
 *     `z.string().max(200)`? No -- it would pass, and then match
 *     nothing, so the operator would see an empty table and no reason.
 *   * `limit` is clamped to the server's cap of 100. Exceeding it is a
 *     400 from `auditLogQuerySchema`, not a truncated page.
 *   * dates are widened to cover the WHOLE day the operator picked. A
 *     date input yields midnight, so an unwidened `endDate` of "today"
 *     excludes everything that happened today -- the most likely thing
 *     they are looking for.
 *   * `tenantId` is dropped entirely unless the caller is a super
 *     admin, because `AuditLogController` silently OVERWRITES it with
 *     the caller's own tenant otherwise. Sending it would show a
 *     different result than the form says, with no error.
 */
export function toAuditLogQuery(
  input: {
    category?: string;
    severity?: string;
    action?: string;
    userId?: string;
    entityType?: string;
    entityId?: string;
    startDate?: string;
    endDate?: string;
    tenantId?: string;
    page?: number;
    limit?: number;
  },
  options?: { isSuperAdmin?: boolean; maxLimit?: number }
): AuditLogQueryParams {
  const maxLimit = options?.maxLimit ?? 100;
  const query: AuditLogQueryParams = {};

  const category = trimOrUndefined(input.category);
  if (category === 'domain' || category === 'security' || category === 'system') {
    query.category = category;
  }

  const severity = trimOrUndefined(input.severity);
  if (severity === 'info' || severity === 'warning' || severity === 'critical') {
    query.severity = severity;
  }

  const action = trimOrUndefined(input.action);
  // Truncated rather than rejected: the server caps `action` at 200 and
  // would 400, which is a worse answer to "you typed too much".
  if (action) query.action = action.slice(0, 200);

  const userId = trimOrUndefined(input.userId);
  if (userId) query.userId = userId.slice(0, 100);

  const entityType = trimOrUndefined(input.entityType);
  if (entityType) query.entityType = entityType.slice(0, 50);

  const entityId = trimOrUndefined(input.entityId);
  if (entityId) query.entityId = entityId.slice(0, 100);

  const startDate = startOfDayIso(input.startDate);
  if (startDate) query.startDate = startDate;

  const endDate = endOfDayIso(input.endDate);
  if (endDate) query.endDate = endDate;

  if (options?.isSuperAdmin) {
    const tenantId = trimOrUndefined(input.tenantId);
    if (tenantId) query.tenantId = tenantId;
  }

  if (typeof input.page === 'number' && Number.isFinite(input.page)) {
    query.page = Math.max(1, Math.trunc(input.page));
  }
  if (typeof input.limit === 'number' && Number.isFinite(input.limit)) {
    query.limit = Math.min(maxLimit, Math.max(1, Math.trunc(input.limit)));
  }

  return query;
}

function trimOrUndefined(value: string | null | undefined): string | undefined {
  const trimmed = (value ?? '').trim();
  return trimmed || undefined;
}

/** Local midnight at the start of the given day, as ISO. Undefined for anything unparseable. */
export function startOfDayIso(value: string | null | undefined): string | undefined {
  const trimmed = (value ?? '').trim();
  if (!trimmed) return undefined;
  const date = new Date(trimmed);
  if (Number.isNaN(date.getTime())) return undefined;
  date.setHours(0, 0, 0, 0);
  return date.toISOString();
}

/**
 * The last millisecond of the given day, as ISO.
 *
 * A date input hands back midnight. Passing that as `endDate` means
 * "before today began", so every entry from the day the operator
 * selected is excluded -- silently, and most visibly when they pick
 * today and get nothing.
 */
export function endOfDayIso(value: string | null | undefined): string | undefined {
  const trimmed = (value ?? '').trim();
  if (!trimmed) return undefined;
  const date = new Date(trimmed);
  if (Number.isNaN(date.getTime())) return undefined;
  date.setHours(23, 59, 59, 999);
  return date.toISOString();
}

/** Locale date AND time. Distinct from formatDate: an audit entry's time of day is the point. */
export function formatAuditTimestamp(value: string | Date | null | undefined): string {
  if (!value) return '—';
  const date = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(date.getTime())) return '—';
  return `${date.toLocaleDateString()} ${date.toLocaleTimeString()}`;
}

/** First 12 characters of a chain hash, for a column that must stay narrow. Never padded or faked. */
export function shortHash(hash: string | null | undefined): string {
  const trimmed = (hash ?? '').trim();
  if (!trimmed) return '—';
  return trimmed.length <= 12 ? trimmed : `${trimmed.slice(0, 12)}…`;
}

/**
 * Whether the current user may filter the audit log across tenants.
 *
 * Mirrors `AuditLogController`'s own test -- `context.isSuperAdmin`,
 * which is true for SUPER_ADMIN *and* ORGANIZATION_OWNER, since both
 * map to the full static permission set. That is the server's actual
 * behaviour for this endpoint (unlike the platform routes, which add a
 * literal SUPER_ADMIN check), so mirroring it keeps the control's
 * presence honest rather than stricter-than-real.
 */
export function canFilterAuditLogByTenant(roles: readonly string[] | null | undefined): boolean {
  const list = Array.isArray(roles) ? roles : [];
  return list.includes(Role.SUPER_ADMIN) || list.includes(Role.ORGANIZATION_OWNER);
}

/** Whether a role set can read the audit log at all. Mirrors the route's AUDIT_LOG_VIEW gate. */
export function canViewAuditLog(roles: readonly string[] | null | undefined): boolean {
  return permissionService.hasPermission([...(roles ?? [])], Permission.AUDIT_LOG_VIEW);
}

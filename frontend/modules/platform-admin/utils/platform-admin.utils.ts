// frontend/modules/platform-admin/utils/platform-admin.utils.ts
//
// Pure presentation and shaping helpers for the Platform Admin module.
//
// Everything here is a plain function over plain data, for the same
// reason frontend/modules/observability/utils/provider-health.utils.ts
// is: this repo's Jest runs `testEnvironment: 'node'` with no jsdom and
// no React Testing Library, so logic that lives in a component cannot be
// tested at all. Anything worth asserting therefore lives here and the
// components stay declarative.

import type {
  OrganizationStatus,
  OrganizationTier,
  OrgUnitSummary,
  OrgUnitTreeNode,
  OrgUnitType,
  PlatformOrganization,
} from '../types';

// ---------------------------------------------------------------------
// Organization status
// ---------------------------------------------------------------------

export interface BadgePresentation {
  badgeVariant: 'default' | 'secondary' | 'destructive' | 'outline';
  dotClassName: string;
}

/**
 * How an organization's status should read at a glance.
 *
 * `suspended` is destructive and `archived` is merely muted, which is
 * the distinction that matters operationally: a suspended organization
 * is a live tenant that has been cut off and someone is probably
 * waiting on it, whereas an archived one is a closed account nobody is
 * blocked by. Rendering both as "not active" would flatten an urgent
 * state into a filing state.
 */
export function organizationStatusPresentation(
  status: OrganizationStatus | string | null | undefined
): BadgePresentation {
  switch (status) {
    case 'active':
      return { badgeVariant: 'outline', dotClassName: 'bg-success' };
    case 'suspended':
      return { badgeVariant: 'destructive', dotClassName: 'bg-destructive' };
    case 'archived':
      return { badgeVariant: 'secondary', dotClassName: 'bg-muted-foreground' };
    default:
      // An unrecognised status is NOT rendered as healthy. A future
      // backend status this build has never heard of must not arrive
      // wearing the same green dot as 'active'.
      return { badgeVariant: 'secondary', dotClassName: 'bg-muted-foreground' };
  }
}

export function organizationStatusLabel(
  status: OrganizationStatus | string | null | undefined
): string {
  switch (status) {
    case 'active':
      return 'Active';
    case 'suspended':
      return 'Suspended';
    case 'archived':
      return 'Archived';
    default:
      // Shown verbatim rather than as "Unknown": if the backend starts
      // sending a new status, an operator seeing the literal value can
      // report it. "Unknown" would hide which value it was.
      return status ? String(status) : 'Unknown';
  }
}

export function organizationTierLabel(tier: OrganizationTier | string | null | undefined): string {
  switch (tier) {
    case 'free':
      return 'Free';
    case 'professional':
      return 'Professional';
    case 'enterprise':
      return 'Enterprise';
    default:
      return tier ? String(tier) : 'Unknown';
  }
}

// ---------------------------------------------------------------------
// Identity
// ---------------------------------------------------------------------

/**
 * The tenant identifier for an organization.
 *
 * THE SLUG IS THE CANONICAL TENANT ID in this database, not
 * `String(org._id)` -- `OrganizationService.createOrganization` writes
 * `tenantId: slug`, and every business row joins on that value. A
 * platform admin reading this column needs the value that appears on
 * `tblvehicles.tenantId`, so `tenantId` is preferred and `slug` is the
 * fallback for older rows that predate the field.
 *
 * Returns null rather than the Mongo `_id` when neither is present:
 * showing an `_id` in a column labelled "Tenant ID" would hand an
 * operator a value that matches nothing, which is worse than a blank.
 */
export function tenantIdentifier(
  org: Pick<PlatformOrganization, 'slug'> & { tenantId?: string }
): string | null {
  const tenantId = typeof org.tenantId === 'string' ? org.tenantId.trim() : '';
  if (tenantId) return tenantId;

  const slug = typeof org.slug === 'string' ? org.slug.trim() : '';
  return slug || null;
}

/**
 * The id to address an organization by in a platform-admin URL.
 *
 * `PlatformService.getOrganization` resolves through
 * `resolveOrganization`, which accepts a slug OR an ObjectId, so either
 * works on the wire. The slug is preferred because it is the value the
 * rest of the platform uses as `tenantId`, which makes a URL readable
 * and makes it match what the operator sees in the table.
 */
export function organizationRouteId(
  org: Pick<PlatformOrganization, '_id' | 'slug'> & { tenantId?: string }
): string {
  return tenantIdentifier(org) ?? String(org._id ?? '');
}

/**
 * True when the two identifiers denote the same organization.
 *
 * Compares across every identifier an organization is known by
 * (`tenantId`, `slug`, `_id`) because a route param may be any of them
 * and the caller's session carries only the tenant id. Case-insensitive
 * and whitespace-tolerant: slugs are lowercase by construction, but a
 * hand-typed URL is not.
 */
export function isSameOrganization(
  org: (Pick<PlatformOrganization, '_id' | 'slug'> & { tenantId?: string }) | null | undefined,
  identifier: string | null | undefined
): boolean {
  if (!org || !identifier) return false;

  const needle = identifier.trim().toLowerCase();
  if (!needle) return false;

  const candidates = [org.tenantId, org.slug, org._id]
    .map((value) => (value === undefined || value === null ? '' : String(value).trim().toLowerCase()))
    .filter(Boolean);

  return candidates.includes(needle);
}

/**
 * Whether the org-unit section may be shown and used for `org`.
 *
 * THIS IS THE CONSTRAINT, not a UI preference. `/api/tenancy/org-units`
 * derives `organizationId` from the caller's session on both GET and
 * POST (see ../types for the exact code path), so it can only ever
 * answer for the caller's OWN organization.
 *
 * Returning false means the page shows an explanation. Returning true
 * where it should be false would list the admin's own branches under
 * another tenant's name and let a "create branch" land in the wrong
 * organization -- silently, since every request would succeed.
 *
 * Fails CLOSED: no session tenant, or an org that cannot be matched to
 * it, both yield false.
 */
export function canManageOrgUnitsFor(
  org: (Pick<PlatformOrganization, '_id' | 'slug'> & { tenantId?: string }) | null | undefined,
  sessionTenantId: string | null | undefined
): boolean {
  return isSameOrganization(org, sessionTenantId);
}

// ---------------------------------------------------------------------
// Org units
// ---------------------------------------------------------------------

export const ORG_UNIT_TYPE_LABELS: Record<OrgUnitType, string> = {
  branch: 'Branch',
  department: 'Department',
  workshop: 'Workshop',
  fleet: 'Fleet',
  team: 'Team',
};

export function orgUnitTypeLabel(type: OrgUnitType | string | null | undefined): string {
  if (type && type in ORG_UNIT_TYPE_LABELS) {
    return ORG_UNIT_TYPE_LABELS[type as OrgUnitType];
  }
  return type ? String(type) : 'Unknown';
}

export function orgUnitStatusPresentation(status: string | null | undefined): BadgePresentation {
  return status === 'active'
    ? { badgeVariant: 'outline', dotClassName: 'bg-success' }
    : { badgeVariant: 'secondary', dotClassName: 'bg-muted-foreground' };
}

/**
 * Builds the parent/child tree the table renders as indented rows.
 *
 * Written defensively on purpose, because every one of these cases is
 * reachable from real data rather than hypothetical:
 *
 *   * a unit whose `parentId` names a unit not in the list -- the list
 *     read is filterable by `type` and `parentId`, so a partial fetch
 *     genuinely can omit a parent;
 *   * a CYCLE. `HierarchyValidationService` prevents creating one, but
 *     this function must not hang if historical data contains one --
 *     an infinite loop in a render path takes the tab down.
 *
 * Both are handled by promoting the affected unit to the top level
 * rather than dropping it. A branch that vanishes from an admin screen
 * because its parent was filtered out is a worse failure than one shown
 * at the wrong indentation: the operator can see it either way, and
 * only one of those is recoverable by looking.
 */
export function buildOrgUnitTree(units: readonly OrgUnitSummary[]): OrgUnitTreeNode[] {
  if (!Array.isArray(units) || units.length === 0) return [];

  const byId = new Map<string, OrgUnitSummary>();
  for (const unit of units) {
    if (unit && typeof unit._id === 'string' && unit._id) byId.set(unit._id, unit);
  }

  /** True when following `parentId` from `unit` reaches `unit` again. */
  function hasCycle(unit: OrgUnitSummary): boolean {
    const seen = new Set<string>([unit._id]);
    let cursor = unit.parentId ? byId.get(unit.parentId) : undefined;
    while (cursor) {
      if (seen.has(cursor._id)) return true;
      seen.add(cursor._id);
      cursor = cursor.parentId ? byId.get(cursor.parentId) : undefined;
    }
    return false;
  }

  const childrenOf = new Map<string, OrgUnitSummary[]>();
  const roots: OrgUnitSummary[] = [];

  for (const unit of byId.values()) {
    const parentId = unit.parentId ?? null;
    const parentPresent = parentId !== null && byId.has(parentId);

    if (!parentPresent || hasCycle(unit)) {
      roots.push(unit);
      continue;
    }

    const siblings = childrenOf.get(parentId!) ?? [];
    siblings.push(unit);
    childrenOf.set(parentId!, siblings);
  }

  /** Deterministic ordering: shallower type first, then name. */
  function sortUnits(a: OrgUnitSummary, b: OrgUnitSummary): number {
    const order: Record<string, number> = {
      branch: 1,
      department: 2,
      workshop: 3,
      fleet: 4,
      team: 5,
    };
    const byType = (order[a.type] ?? 99) - (order[b.type] ?? 99);
    if (byType !== 0) return byType;
    return a.name.localeCompare(b.name);
  }

  function attach(unit: OrgUnitSummary, level: number, guard: Set<string>): OrgUnitTreeNode {
    const children = (childrenOf.get(unit._id) ?? [])
      .filter((child) => !guard.has(child._id))
      .sort(sortUnits);

    const nextGuard = new Set(guard);
    nextGuard.add(unit._id);

    return {
      ...unit,
      level,
      children: children.map((child) => attach(child, level + 1, nextGuard)),
    };
  }

  return roots.sort(sortUnits).map((root) => attach(root, 0, new Set([root._id])));
}

/** Depth-first flattening, so a table can render the tree as ordinary rows. */
export function flattenOrgUnitTree(nodes: readonly OrgUnitTreeNode[]): OrgUnitTreeNode[] {
  const out: OrgUnitTreeNode[] = [];
  for (const node of nodes) {
    out.push(node);
    if (node.children.length > 0) out.push(...flattenOrgUnitTree(node.children));
  }
  return out;
}

/**
 * Units that may legally parent a new unit of `type`.
 *
 * Mirrors `ALLOWED_PARENT_TYPES` (modules/tenancy/constants/
 * hierarchy.constants.ts) -- imported by the form rather than restated
 * here, so the two cannot drift. `null` from that map means "must be
 * top level", which this returns as an empty list.
 *
 * The server validates this again in `HierarchyValidationService`; the
 * filtering here exists so an operator is not offered a choice that
 * will be rejected, not as a substitute for that check.
 */
export function eligibleParents(
  units: readonly OrgUnitSummary[],
  type: OrgUnitType,
  allowedParentTypes: Record<OrgUnitType, OrgUnitType[] | null>,
  options?: { excludeId?: string }
): OrgUnitSummary[] {
  const allowed = allowedParentTypes[type];
  if (allowed === null || allowed === undefined) return [];

  return units
    .filter((unit) => allowed.includes(unit.type))
    .filter((unit) => unit._id !== options?.excludeId);
}

/** Counts units by type, for the detail page's summary line. */
export function countOrgUnitsByType(
  units: readonly OrgUnitSummary[]
): Record<OrgUnitType, number> {
  const counts: Record<OrgUnitType, number> = {
    branch: 0,
    department: 0,
    workshop: 0,
    fleet: 0,
    team: 0,
  };
  for (const unit of units) {
    if (unit.type in counts) counts[unit.type] += 1;
  }
  return counts;
}

// ---------------------------------------------------------------------
// Forms
// ---------------------------------------------------------------------

export interface FieldErrors {
  [field: string]: string;
}

const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

/**
 * Validates the create-organization form.
 *
 * Mirrors what the server actually enforces --
 * `OrganizationService.createOrganization` requires a non-empty trimmed
 * `name` and nothing else -- plus the two owner fields, which the
 * controller reads unvalidated. Those are required HERE rather than
 * left optional because they populate the owner member record: an
 * organization created with a blank owner email produces a member row
 * nobody can be contacted through, and the server will not stop you.
 *
 * Returns a map so a form can render per-field messages; an empty map
 * means valid.
 */
export function validateCreateOrganization(input: {
  name?: string;
  ownerEmail?: string;
  ownerName?: string;
}): FieldErrors {
  const errors: FieldErrors = {};

  const name = (input.name ?? '').trim();
  if (!name) {
    errors.name = 'Organization name is required.';
  } else if (name.length > 120) {
    errors.name = 'Organization name must be 120 characters or fewer.';
  }

  const ownerName = (input.ownerName ?? '').trim();
  if (!ownerName) errors.ownerName = 'Owner name is required.';

  const ownerEmail = (input.ownerEmail ?? '').trim();
  if (!ownerEmail) {
    errors.ownerEmail = 'Owner email is required.';
  } else if (!EMAIL_PATTERN.test(ownerEmail)) {
    errors.ownerEmail = 'Enter a valid email address.';
  }

  return errors;
}

/**
 * Validates the create-org-unit form against `orgUnitCreateSchema`
 * (shared/validations/security.schema.ts): name 1-100, code max 30,
 * type from the closed set.
 *
 * The parent rule is the one worth stating: a type whose
 * `ALLOWED_PARENT_TYPES` entry is `null` (today, `branch`) MUST be top
 * level, and every other type MUST have a parent. Letting a department
 * through with no parent produces a server-side ValidationError the
 * operator would have to decode from a toast.
 */
export function validateCreateOrgUnit(
  input: { type?: string; name?: string; code?: string; parentId?: string | null },
  allowedParentTypes: Record<string, OrgUnitType[] | null>
): FieldErrors {
  const errors: FieldErrors = {};

  const type = input.type ?? '';
  if (!type || !(type in ORG_UNIT_TYPE_LABELS)) {
    errors.type = 'Choose a unit type.';
  }

  const name = (input.name ?? '').trim();
  if (!name) {
    errors.name = 'Name is required.';
  } else if (name.length > 100) {
    errors.name = 'Name must be 100 characters or fewer.';
  }

  const code = (input.code ?? '').trim();
  if (code.length > 30) {
    errors.code = 'Code must be 30 characters or fewer.';
  }

  if (!errors.type) {
    const allowed = allowedParentTypes[type];
    const parentId = input.parentId ?? null;

    if (allowed === null && parentId) {
      errors.parentId = `A ${orgUnitTypeLabel(type).toLowerCase()} sits at the top level and cannot have a parent.`;
    }
    if (Array.isArray(allowed) && allowed.length > 0 && !parentId) {
      errors.parentId = `A ${orgUnitTypeLabel(type).toLowerCase()} must belong to a ${allowed
        .map((t) => orgUnitTypeLabel(t).toLowerCase())
        .join(' or ')}.`;
    }
  }

  return errors;
}

/**
 * Turns the form's fields into the exact POST body.
 *
 * Trims, and OMITS empty optionals rather than sending `""`.
 * `orgUnitCreateSchema` types `code` as `z.string().max(30).optional()`,
 * so an empty string is accepted and would be stored as a blank code --
 * a value that then renders as an empty column forever. Absent and
 * empty are different things and the wire should say which.
 */
export function toCreateOrgUnitPayload(input: {
  type: OrgUnitType;
  name: string;
  code?: string;
  parentId?: string | null;
  managerId?: string;
}): {
  type: OrgUnitType;
  name: string;
  code?: string;
  parentId?: string | null;
  managerId?: string;
} {
  const code = (input.code ?? '').trim();
  const managerId = (input.managerId ?? '').trim();
  const parentId = input.parentId ?? null;

  return {
    type: input.type,
    name: input.name.trim(),
    ...(code ? { code } : {}),
    ...(managerId ? { managerId } : {}),
    // Sent explicitly as null for a top-level unit: the schema accepts
    // `z.string().nullable().optional()`, and an explicit null says
    // "top level" where an omitted key says "unspecified".
    parentId,
  };
}

/** Trims the create-organization form into its POST body. */
export function toCreateOrganizationPayload(input: {
  name: string;
  ownerEmail: string;
  ownerName: string;
}): { name: string; ownerEmail: string; ownerName: string } {
  return {
    name: input.name.trim(),
    ownerEmail: input.ownerEmail.trim(),
    ownerName: input.ownerName.trim(),
  };
}

// ---------------------------------------------------------------------
// Formatting
// ---------------------------------------------------------------------

/** Locale date, or an em dash. Never "Invalid Date", never today's date as a stand-in. */
export function formatDate(value: string | Date | null | undefined): string {
  if (!value) return '—';
  const date = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(date.getTime())) return '—';
  return date.toLocaleDateString();
}

/** `used / total`, with the seat figures the subscription actually carries. */
export function formatSeats(
  subscription: { seats?: number; usedSeats?: number } | null | undefined
): string {
  if (!subscription) return '—';
  const used = typeof subscription.usedSeats === 'number' ? subscription.usedSeats : null;
  const seats = typeof subscription.seats === 'number' ? subscription.seats : null;
  if (used === null && seats === null) return '—';
  return `${used ?? '—'} / ${seats ?? '—'}`;
}

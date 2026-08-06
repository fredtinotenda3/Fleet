// scripts/lib/tenant-identity.ts
//
// Shared organization-identity resolution for all maintenance scripts.
//
// ---------------------------------------------------------------------
// WHY THIS EXISTS — a bug in my own tooling, found by real data
// ---------------------------------------------------------------------
// tenant-forensics.ts and backfill-user-tenants.ts both assumed
//
//     tenantId === String(organization._id)
//
// That is WRONG for this database. The canonical tenant identifier here
// is the organization's SLUG:
//
//     tblorganizations: { _id: ObjectId("6a4e10b4..."),
//                         tenantId: "willsgrove-farm-enterprises-9e80ed",
//                         slug:     "willsgrove-farm-enterprises-9e80ed" }
//     tblvehicles:      { tenantId: "willsgrove-farm-enterprises-9e80ed" }
//     tbladmin:         { tenantId: "toyota-zimbabwe-949d94" }
//
// Consequences of the wrong assumption, both now corrected:
//
//   1. FORENSICS UNDER-REPORTED RECOVERABILITY. Every "recoverable via
//      orgId / via creator" check compared a slug against a set of
//      ObjectId hex strings, so it never matched — producing
//      "0.0% recoverable" and an unwarranted RESET-leaning verdict.
//      It also counted 9 accounts as "tenantId pointing at no org" when
//      those accounts in fact held perfectly valid slugs.
//
//   2. THE BACKFILL WOULD HAVE WRITTEN THE WRONG FORMAT. It resolved
//      users to String(org._id) and would have stamped ObjectId hex onto
//      tbladmin.tenantId — a value no business row uses. Those accounts
//      would have logged in successfully and then seen an empty fleet,
//      which is a far worse failure than being locked out. Only the
//      dry-run default prevented it.
//
// Every script now resolves identity through this module. It accepts
// slug, `tenantId`, or `_id` on input (so historical rows written under
// either scheme resolve), and always emits the CANONICAL form for writes.

import { Db, ObjectId } from 'mongodb';

export interface OrganizationIdentity {
  /** The value that must be written to tenantId on any row. */
  canonicalTenantId: string;
  objectId: string;
  slug?: string;
  name: string;
  status?: string;
  isDeleted?: boolean;
}

export interface TenantIdentityIndex {
  organizations: OrganizationIdentity[];
  /** Every accepted alias (slug, tenantId, _id) → canonical tenantId. */
  aliasToCanonical: Map<string, string>;
  canonicalSet: Set<string>;
  byCanonical: Map<string, OrganizationIdentity>;
  /** Display names shared by more than one organization. */
  duplicateNames: Map<string, OrganizationIdentity[]>;
}

export const LEGACY_SENTINELS = ['default', 'system', 'super_admin'];

export function isLegacySentinel(value: unknown): boolean {
  return (
    typeof value === 'string' && LEGACY_SENTINELS.includes(value.trim().toLowerCase())
  );
}

/** True for a value that carries no usable ownership information. */
export function isUnusableTenantValue(value: unknown): boolean {
  if (typeof value !== 'string') return true;
  const v = value.trim();
  if (v.length === 0) return true;
  return isLegacySentinel(v);
}

export async function buildTenantIdentityIndex(db: Db): Promise<TenantIdentityIndex> {
  const docs = await db
    .collection('tblorganizations')
    .find({}, { projection: { name: 1, slug: 1, tenantId: 1, status: 1, isDeleted: 1 } })
    .toArray();

  const organizations: OrganizationIdentity[] = docs.map((d) => {
    const objectId = String(d._id);
    // Canonical order of preference: the org's own tenantId, then slug,
    // then _id. The first two are what business rows actually contain.
    const canonical =
      (typeof d.tenantId === 'string' && d.tenantId.trim()) ||
      (typeof d.slug === 'string' && d.slug.trim()) ||
      objectId;

    return {
      canonicalTenantId: canonical,
      objectId,
      slug: typeof d.slug === 'string' ? d.slug : undefined,
      name: typeof d.name === 'string' ? d.name : '(unnamed)',
      status: typeof d.status === 'string' ? d.status : undefined,
      isDeleted: d.isDeleted === true,
    };
  });

  const aliasToCanonical = new Map<string, string>();
  const byCanonical = new Map<string, OrganizationIdentity>();

  for (const org of organizations) {
    byCanonical.set(org.canonicalTenantId, org);
    for (const alias of [org.canonicalTenantId, org.slug, org.objectId]) {
      if (alias && !isUnusableTenantValue(alias)) {
        aliasToCanonical.set(alias, org.canonicalTenantId);
      }
    }
  }

  // Two organizations may legitimately share a display name (this database
  // has two distinct "Toyota Zimbabwe" tenants with different slugs). They
  // are SEPARATE tenants and must never be merged — surfaced here only so
  // an operator reviewing the manual-review report is not misled by name.
  const byName = new Map<string, OrganizationIdentity[]>();
  for (const org of organizations) {
    const key = org.name.trim().toLowerCase();
    byName.set(key, [...(byName.get(key) ?? []), org]);
  }
  const duplicateNames = new Map<string, OrganizationIdentity[]>();
  for (const [name, list] of byName) {
    if (list.length > 1) duplicateNames.set(name, list);
  }

  return {
    organizations,
    aliasToCanonical,
    canonicalSet: new Set(byCanonical.keys()),
    byCanonical,
    duplicateNames,
  };
}

/**
 * Resolves any tenant-ish value to its canonical tenantId, or undefined
 * if it does not identify a real organization. Never guesses.
 */
export function resolveCanonical(
  index: TenantIdentityIndex,
  value: unknown
): string | undefined {
  if (isUnusableTenantValue(value)) return undefined;
  return index.aliasToCanonical.get(String(value).trim());
}

export function toObjectIdOrNull(value: string): ObjectId | null {
  return ObjectId.isValid(value) ? ObjectId.createFromHexString(value) : null;
}

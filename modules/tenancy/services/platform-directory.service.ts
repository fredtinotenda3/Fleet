// modules/tenancy/services/platform-directory.service.ts
//
// Cross-tenant read models for the platform administrator: users, API
// keys and custom roles across every organization.
//
// ---------------------------------------------------------------------
// THIS FILE DELIBERATELY CROSSES THE TENANT BOUNDARY
// ---------------------------------------------------------------------
// Every other service in this codebase is built so that crossing a
// tenant boundary is impossible. This one is the exception the platform
// operator needs, and being the exception is exactly why it is a
// separate file with its own header rather than a flag on an existing
// service.
//
// Two consequences follow, and both are enforced here rather than left
// to the caller:
//
//   1. AUTHORISATION IS NOT THIS FILE'S JOB, BUT IT IS ITS PRECONDITION.
//      Every method assumes PlatformController.requirePlatformAdmin has
//      already run -- which checks for the LITERAL Role.SUPER_ADMIN, not
//      the `isSuperAdmin` flag (that flag is also true for
//      organization_owner, who is privileged only inside their own
//      tenant). Nothing here re-checks it, and nothing here should be
//      called from a route that does not.
//
//   2. REDACTION IS THIS FILE'S JOB. A cross-tenant reader sees every
//      customer's rows at once, so a secret leaked here is leaked for
//      the whole platform rather than for one tenant. The projections
//      below are ALLOW-LISTS, never `delete row.secret` -- an allow-list
//      omits a newly added sensitive field by default, whereas a
//      deny-list includes it by default. That direction is the entire
//      point.

import connectToDatabase from '@/infrastructure/database/mongodb';
import { PaginationParams, PaginatedResponse } from '@/shared/types/common.types';

/** A user, as the platform directory exposes them. */
export interface PlatformUser {
  _id: string;
  email: string;
  firstName?: string;
  /** Organization slug/tenantId. Null for a tenantless platform account. */
  tenantId: string | null;
  organizationName?: string;
  roles: string[];
  createdAt?: Date;
  /**
   * Deliberately ABSENT from this type: Password, any hash, MFA secrets,
   * reset tokens. See the header -- the projection is an allow-list, so
   * a field added to tbladmin tomorrow is not exposed by accident.
   */
}

export interface PlatformApiKey {
  _id: string;
  organizationId: string;
  organizationName?: string;
  name: string;
  /** The non-secret display prefix only. NEVER the hash. */
  keyPrefix: string;
  permissions: string[];
  status: string;
  createdAt?: Date;
  lastUsedAt?: Date;
  expiresAt?: Date | null;
  revokedAt?: Date;
}

export interface PlatformCustomRole {
  _id: string;
  organizationId: string;
  organizationName?: string;
  name: string;
  description?: string;
  baseRole?: string;
  permissionCount: number;
  scopeType: string;
  status: string;
  isSystem: boolean;
  createdAt?: Date;
}

function escapeRegex(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

/** tenantId/slug -> display name, for one lookup instead of N. */
async function organizationNames(): Promise<Map<string, string>> {
  const db = await connectToDatabase();
  const orgs = await db
    .collection('tblorganizations')
    .find({ isDeleted: { $ne: true } }, { projection: { name: 1, slug: 1, tenantId: 1 } })
    .toArray();

  const map = new Map<string, string>();
  for (const org of orgs) {
    const name = String(org.name ?? '');
    if (org.tenantId) map.set(String(org.tenantId), name);
    if (org.slug) map.set(String(org.slug), name);
    map.set(String(org._id), name);
  }
  return map;
}

function paginate<T>(data: T[], total: number, { page, limit }: PaginationParams): PaginatedResponse<T> {
  return {
    data,
    pagination: {
      page,
      limit,
      total,
      totalPages: Math.max(1, Math.ceil(total / limit)),
      hasNext: page * limit < total,
      hasPrev: page > 1,
    },
  };
}

export class PlatformDirectoryService {
  /**
   * Every user account on the platform.
   *
   * `search` matches email or first name. Regex-escaped: an unescaped
   * search box over a cross-tenant collection is both an injection
   * surface and a trivial ReDoS.
   */
  async listUsers(
    filters: { search?: string; tenantId?: string },
    pagination: PaginationParams
  ): Promise<PaginatedResponse<PlatformUser>> {
    const db = await connectToDatabase();
    const query: Record<string, unknown> = {};

    if (filters.tenantId) query.tenantId = filters.tenantId;
    if (filters.search) {
      const rx = { $regex: escapeRegex(filters.search), $options: 'i' };
      query.$or = [{ Email: rx }, { FirstName: rx }];
    }

    const { page, limit } = pagination;
    const [rows, total, names] = await Promise.all([
      db
        .collection('tbladmin')
        .find(query, {
          /**
           * ALLOW-LIST. `Password` is in this collection, and so are MFA
           * and reset fields on some rows. Naming what is INCLUDED means
           * a field added later is excluded until someone deliberately
           * adds it here.
           */
          projection: {
            _id: 1,
            Email: 1,
            FirstName: 1,
            tenantId: 1,
            roles: 1,
            Role: 1,
            createdAt: 1,
          },
        })
        .sort({ createdAt: -1 })
        .skip((page - 1) * limit)
        .limit(limit)
        .toArray(),
      db.collection('tbladmin').countDocuments(query),
      organizationNames(),
    ]);

    const data: PlatformUser[] = rows.map((row) => {
      const tenantId = row.tenantId ? String(row.tenantId) : null;
      // Some legacy rows carry a single `Role` string rather than
      // `roles[]`. Both are read; neither is invented.
      const roles = Array.isArray(row.roles)
        ? row.roles.map(String)
        : row.Role
          ? [String(row.Role)]
          : [];

      return {
        _id: String(row._id),
        email: String(row.Email ?? ''),
        firstName: row.FirstName ? String(row.FirstName) : undefined,
        tenantId,
        organizationName: tenantId ? names.get(tenantId) : undefined,
        roles,
        createdAt: row.createdAt as Date | undefined,
      };
    });

    return paginate(data, total, pagination);
  }

  /**
   * Every API key on the platform.
   *
   * `keyHash` is never projected. An API key hash is a credential: with
   * it, an offline attack against a weak key is possible, and a
   * cross-tenant listing would hand over every customer's at once.
   */
  async listApiKeys(
    filters: { organizationId?: string; status?: string },
    pagination: PaginationParams
  ): Promise<PaginatedResponse<PlatformApiKey>> {
    const db = await connectToDatabase();
    const query: Record<string, unknown> = { isDeleted: { $ne: true } };
    if (filters.organizationId) query.organizationId = filters.organizationId;
    if (filters.status) query.status = filters.status;

    const { page, limit } = pagination;
    const [rows, total, names] = await Promise.all([
      db
        .collection('tblapikeys')
        .find(query, {
          projection: {
            _id: 1,
            organizationId: 1,
            name: 1,
            keyPrefix: 1,
            permissions: 1,
            status: 1,
            createdAt: 1,
            lastUsedAt: 1,
            expiresAt: 1,
            revokedAt: 1,
            // keyHash deliberately absent. See the header.
          },
        })
        .sort({ createdAt: -1 })
        .skip((page - 1) * limit)
        .limit(limit)
        .toArray(),
      db.collection('tblapikeys').countDocuments(query),
      organizationNames(),
    ]);

    const data: PlatformApiKey[] = rows.map((row) => ({
      _id: String(row._id),
      organizationId: String(row.organizationId ?? ''),
      organizationName: names.get(String(row.organizationId ?? '')),
      name: String(row.name ?? ''),
      keyPrefix: String(row.keyPrefix ?? ''),
      permissions: Array.isArray(row.permissions) ? row.permissions.map(String) : [],
      status: String(row.status ?? 'active'),
      createdAt: row.createdAt as Date | undefined,
      lastUsedAt: row.lastUsedAt as Date | undefined,
      expiresAt: (row.expiresAt ?? null) as Date | null,
      revokedAt: row.revokedAt as Date | undefined,
    }));

    return paginate(data, total, pagination);
  }

  /**
   * Every custom role on the platform.
   *
   * Returns a permission COUNT rather than the permission list. The
   * platform view answers "which organizations have defined custom
   * roles, and are any of them unusually broad" -- the full grant list
   * is a tenant-scoped question answered by that tenant's own roles
   * screen, and shipping every tenant's grants in one response is a
   * larger blast radius for no extra answer.
   */
  async listCustomRoles(
    filters: { organizationId?: string; includeDeleted?: boolean },
    pagination: PaginationParams
  ): Promise<PaginatedResponse<PlatformCustomRole>> {
    const db = await connectToDatabase();
    const query: Record<string, unknown> = {};
    if (!filters.includeDeleted) query.isDeleted = { $ne: true };
    if (filters.organizationId) query.organizationId = filters.organizationId;

    const { page, limit } = pagination;
    const [rows, total, names] = await Promise.all([
      db
        .collection('tblcustomroles')
        .find(query, {
          projection: {
            _id: 1,
            organizationId: 1,
            name: 1,
            description: 1,
            baseRole: 1,
            permissions: 1,
            customPermissionKeys: 1,
            scopeType: 1,
            status: 1,
            isSystem: 1,
            createdAt: 1,
          },
        })
        .sort({ createdAt: -1 })
        .skip((page - 1) * limit)
        .limit(limit)
        .toArray(),
      db.collection('tblcustomroles').countDocuments(query),
      organizationNames(),
    ]);

    const data: PlatformCustomRole[] = rows.map((row) => ({
      _id: String(row._id),
      organizationId: String(row.organizationId ?? ''),
      organizationName: names.get(String(row.organizationId ?? '')),
      name: String(row.name ?? ''),
      description: row.description ? String(row.description) : undefined,
      baseRole: row.baseRole ? String(row.baseRole) : undefined,
      permissionCount:
        (Array.isArray(row.permissions) ? row.permissions.length : 0) +
        (Array.isArray(row.customPermissionKeys) ? row.customPermissionKeys.length : 0),
      scopeType: String(row.scopeType ?? 'organization'),
      status: String(row.status ?? 'active'),
      isSystem: Boolean(row.isSystem),
      createdAt: row.createdAt as Date | undefined,
    }));

    return paginate(data, total, pagination);
  }
}

export const platformDirectoryService = new PlatformDirectoryService();

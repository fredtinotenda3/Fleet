// tests/security/platform-org-unit-scope.spec.ts
//
// Platform-scoped org-unit management -- the endpoint pair whose absence
// blocked branch management from the platform-admin UI for three rounds.
//
// ---------------------------------------------------------------------
// WHAT IT REPLACES, AND WHY THAT MATTERS FOR THE TESTS
// ---------------------------------------------------------------------
// `/api/tenancy/org-units` and `/api/security/org-units` both resolve
// `organizationId` from `getTenantFromRequest(req)` -- the caller's own
// session -- on GET and POST alike, and the create spreads the session
// tenant LAST over the parsed body. So they can only ever answer for the
// caller's own organization, and pointing a cross-tenant UI at them
// would have shown one tenant's branches under another tenant's name.
//
// The new routes take the organization from the PATH. That makes the
// interesting properties: which organization is actually used, that a
// body cannot override it, and that only a real platform admin can get
// there at all.

import { NextRequest } from 'next/server';

const WILLSGROVE = 'willsgrove-farm-enterprises-9e80ed';
const TOYOTA = 'toyota-zimbabwe-4a71bc';

const getOrganization = jest.fn();
const getHierarchyTree = jest.fn();
const createOrgUnit = jest.fn();
const auditLogLog = jest.fn();
const getAuthContext = jest.fn();

jest.mock('../../modules/tenancy/services/platform.service', () => ({
  platformService: {
    getOrganization: (...args: unknown[]) => getOrganization(...args),
    listOrganizations: jest.fn(),
    getPlatformStats: jest.fn(),
    setOrganizationStatus: jest.fn(),
  },
}));
jest.mock('../../modules/tenancy/services/tenant-context.service', () => ({
  tenantContextService: { getHierarchyTree: (...a: unknown[]) => getHierarchyTree(...a) },
}));
jest.mock('../../modules/tenancy/services/org-unit-hierarchy.service', () => ({
  orgUnitHierarchyService: { createOrgUnit: (...a: unknown[]) => createOrgUnit(...a) },
}));
jest.mock('../../modules/tenancy/services/platform-directory.service', () => ({
  platformDirectoryService: {
    listUsers: jest.fn(),
    listApiKeys: jest.fn(),
    listCustomRoles: jest.fn(),
  },
}));
jest.mock('../../infrastructure/monitoring/audit.logger', () => ({
  auditLog: { log: (...a: unknown[]) => auditLogLog(...a), logCreate: jest.fn() },
}));
jest.mock('../../server/auth/auth-context', () => ({
  getAuthContext: (...a: unknown[]) => getAuthContext(...a),
  requireAuthContext: jest.fn(),
}));

import { platformController } from '../../modules/tenancy/controllers/platform.controller';

function request(body?: unknown): NextRequest {
  return {
    nextUrl: { searchParams: new URLSearchParams() },
    json: async () => body,
  } as unknown as NextRequest;
}

async function payloadOf(response: { json: () => Promise<unknown> }) {
  return (await response.json()) as { success?: boolean; data?: unknown; error?: unknown };
}

const SUPER_ADMIN = { userId: 'platform-1', roles: ['super_admin'], tenantId: WILLSGROVE };
const ORG_OWNER = { userId: 'owner-1', roles: ['organization_owner'], tenantId: WILLSGROVE };

beforeEach(() => {
  getOrganization.mockReset();
  getHierarchyTree.mockReset();
  createOrgUnit.mockReset();
  auditLogLog.mockReset();
  getAuthContext.mockReset();

  getAuthContext.mockResolvedValue(SUPER_ADMIN);
  getOrganization.mockImplementation(async (id: string) => {
    if (id === 'org-toyota') return { _id: 'org-toyota', name: 'Toyota Zimbabwe', slug: TOYOTA };
    throw Object.assign(new Error('Organization not found'), {
      code: 'NOT_FOUND',
      statusCode: 404,
      isAppError: true,
    });
  });
  getHierarchyTree.mockResolvedValue([
    { _id: 'unit-1', organizationId: TOYOTA, name: 'Harare', type: 'branch' },
  ]);
  createOrgUnit.mockImplementation(async (data: Record<string, unknown>) => ({
    _id: 'unit-new',
    ...data,
  }));
});

describe('GET /api/platform/organizations/:id/org-units', () => {
  it("reads the TARGET organization's tree, not the caller's own", async () => {
    // The whole point. The caller's session tenant is WILLSGROVE; the
    // path names Toyota; the tree must be read for Toyota.
    const response = await platformController.listOrganizationOrgUnits(request(), 'org-toyota');

    expect(response.status).toBe(200);
    expect(getHierarchyTree).toHaveBeenCalledWith(TOYOTA);
    expect(getHierarchyTree).not.toHaveBeenCalledWith(WILLSGROVE);
  });

  it('resolves the path id to the organization SLUG, never the ObjectId', async () => {
    // tenantId is the slug everywhere in this codebase. Passing an
    // ObjectId here would read (and, on the write path, create) org
    // units under a tenant nothing else can ever see.
    await platformController.listOrganizationOrgUnits(request(), 'org-toyota');
    const [tenantArg] = getHierarchyTree.mock.calls[0];
    expect(tenantArg).toBe(TOYOTA);
    expect(tenantArg).not.toBe('org-toyota');
  });

  it('404s on an organization that does not exist, before reading anything', async () => {
    const response = await platformController.listOrganizationOrgUnits(request(), 'org-ghost');
    expect(response.status).toBe(404);
    expect(getHierarchyTree).not.toHaveBeenCalled();
  });

  it('refuses an organization_owner, whose isSuperAdmin flag is also true', async () => {
    // The guard checks the LITERAL super_admin role for exactly this
    // reason: an organization_owner is privileged inside one tenant and
    // must never read across every customer.
    getAuthContext.mockResolvedValue(ORG_OWNER);
    const response = await platformController.listOrganizationOrgUnits(request(), 'org-toyota');

    expect(response.status).toBe(403);
    expect(getOrganization).not.toHaveBeenCalled();
    expect(getHierarchyTree).not.toHaveBeenCalled();
  });

  it('refuses an unauthenticated caller', async () => {
    getAuthContext.mockResolvedValue(null);
    const response = await platformController.listOrganizationOrgUnits(request(), 'org-toyota');
    expect(response.status).toBe(403);
  });
});

describe('POST /api/platform/organizations/:id/org-units', () => {
  const body = { type: 'branch', name: 'Bulawayo' };

  it('creates the unit in the TARGET organization', async () => {
    const response = await platformController.createOrganizationOrgUnit(
      request(body),
      'org-toyota'
    );

    expect(response.status).toBe(201);
    expect(createOrgUnit).toHaveBeenCalledWith(
      expect.objectContaining({ organizationId: TOYOTA, type: 'branch', name: 'Bulawayo' }),
      'platform-1'
    );
  });

  it('a body naming another organization cannot override the path', async () => {
    // Two independent defences: orgUnitCreateSchema does not declare
    // organizationId (so a z.object strips it), and the resolved tenant
    // is spread LAST. Asserted because "the schema strips it" is exactly
    // the kind of assumption that stopped being true elsewhere in this
    // codebase.
    await platformController.createOrganizationOrgUnit(
      request({ ...body, organizationId: WILLSGROVE, tenantId: WILLSGROVE }),
      'org-toyota'
    );

    const [data] = createOrgUnit.mock.calls[0] as [Record<string, unknown>];
    expect(data.organizationId).toBe(TOYOTA);
    expect(data).not.toHaveProperty('tenantId');
  });

  it('rejects an invalid body without touching the database', async () => {
    const response = await platformController.createOrganizationOrgUnit(
      request({ type: 'not-a-real-type', name: '' }),
      'org-toyota'
    );

    expect(response.status).toBe(400);
    expect(createOrgUnit).not.toHaveBeenCalled();
  });

  it('404s on an unknown organization without writing', async () => {
    const response = await platformController.createOrganizationOrgUnit(request(body), 'org-ghost');
    expect(response.status).toBe(404);
    expect(createOrgUnit).not.toHaveBeenCalled();
  });

  it('refuses an organization_owner', async () => {
    getAuthContext.mockResolvedValue(ORG_OWNER);
    const response = await platformController.createOrganizationOrgUnit(
      request(body),
      'org-toyota'
    );

    expect(response.status).toBe(403);
    expect(createOrgUnit).not.toHaveBeenCalled();
  });

  it('audits the cross-tenant write under the TARGET tenant with the platform admin id', async () => {
    // A write that crosses a tenant boundary and appears in neither
    // tenant's trail is what a security review exists to find.
    await platformController.createOrganizationOrgUnit(request(body), 'org-toyota');

    expect(auditLogLog).toHaveBeenCalledWith(
      expect.objectContaining({
        action: 'PLATFORM_ORG_UNIT_CREATED',
        tenantId: TOYOTA,
        userId: 'platform-1',
        category: 'security',
      })
    );
  });
});

describe('the route file wires the right permissions', () => {
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const fs = require('fs') as typeof import('fs');
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const path = require('path') as typeof import('path');
  const src = fs.readFileSync(
    path.resolve(__dirname, '../../app/api/platform/organizations/[id]/org-units/route.ts'),
    'utf8'
  );

  it('GET requires PLATFORM_VIEW', () => {
    expect(src).toMatch(/export const GET[\s\S]*?Permission\.PLATFORM_VIEW/);
  });

  it('POST requires PLATFORM_MANAGE, not merely PLATFORM_VIEW', () => {
    // Creating a branch inside a customer's organization is a write
    // across a tenant boundary; a read-only platform permission must not
    // reach it.
    expect(src).toMatch(/export const POST[\s\S]*?Permission\.PLATFORM_MANAGE/);
  });
});

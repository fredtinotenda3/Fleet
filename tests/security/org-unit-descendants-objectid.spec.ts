// tests/security/org-unit-descendants-objectid.spec.ts
//
// tests/security/org-unit-descendants.spec.ts proves the EXPANSION
// ALGORITHM is correct, but it does so against plain JS objects whose
// `_id` is already a string -- exactly the shape the trace script
// (`npm run tenancy:sync-members`) queries with, and exactly why that
// script reported correct counts while the running app showed zero.
//
// The real production bug wasn't the algorithm. It was the data type
// TenantContextService.expandWithDescendants() actually receives from
// orgUnitRepository.findByOrganization() -> BaseRepository.findMany():
// a raw `cursor.toArray()` result where `_id` is a live MongoDB
// `ObjectId`, not a string -- only `create()` ever calls `.toString()`
// on it. This test mocks the repository to return that real shape (an
// actual `ObjectId` instance for `_id`) and proves the expansion no
// longer leaks it into the result set.

import { ObjectId } from 'mongodb';
import { tenantContextService } from '../../modules/tenancy/services/tenant-context.service';
import { orgUnitRepository } from '../../modules/security/repositories/org-unit.repository';

jest.mock('../../modules/security/repositories/org-unit.repository', () => ({
  orgUnitRepository: {
    findByOrganization: jest.fn(),
  },
}));

const mockedFindByOrganization = orgUnitRepository.findByOrganization as jest.Mock;

const ORG = 'willsgrove-farm-enterprises-9e80ed';

describe('descendant expansion against real Mongo document shapes', () => {
  afterEach(() => {
    jest.clearAllMocks();
  });

  it('normalizes ObjectId _id values so they still match string orgUnitId filters', async () => {
    const branchId = new ObjectId().toString();
    const deptObjectId = new ObjectId();
    const fleetObjectId = new ObjectId();

    // This is what BaseRepository.findMany() actually returns: `_id`
    // is a driver ObjectId instance, `path` is the array of already-
    // stringified ancestor ids written by create()/update().
    mockedFindByOrganization.mockResolvedValue([
      { _id: new ObjectId(branchId), name: 'Harare Branch', type: 'branch', parentId: null, path: [] },
      { _id: deptObjectId, name: 'Logistics', type: 'department', parentId: branchId, path: [branchId] },
      {
        _id: fleetObjectId,
        name: 'Heavy Fleet',
        type: 'fleet',
        parentId: deptObjectId.toString(),
        path: [branchId, deptObjectId.toString()],
      },
    ]);

    const expanded: string[] = await (tenantContextService as any).expandWithDescendants(
      [branchId],
      ORG
    );

    // Every id in the result must be a plain string -- never an
    // ObjectId instance -- or it will never satisfy a MongoDB
    // `{ orgUnitId: { $in: [...] } }` filter against string-valued
    // orgUnitId fields on vehicles/expenses/fuel logs.
    for (const id of expanded) {
      expect(typeof id).toBe('string');
    }

    expect(expanded.sort()).toEqual(
      [branchId, deptObjectId.toString(), fleetObjectId.toString()].sort()
    );
  });

  it('still expands correctly when every id is already a string (trace-script shape)', async () => {
    const branchId = 'unit-branch';
    const deptId = 'unit-dept';

    mockedFindByOrganization.mockResolvedValue([
      { _id: branchId, name: 'Branch', type: 'branch', parentId: null, path: [] },
      { _id: deptId, name: 'Dept', type: 'department', parentId: branchId, path: [branchId] },
    ]);

    const expanded: string[] = await (tenantContextService as any).expandWithDescendants(
      [branchId],
      ORG
    );

    expect(expanded.sort()).toEqual([branchId, deptId].sort());
  });
});

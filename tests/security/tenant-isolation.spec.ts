// tests/security/tenant-isolation.spec.ts
//
// Proves the guarantee the product is sold on:
//
//     Organization A can never see Organization B's data.
//
// Every test here corresponds to a concrete way the system previously
// leaked. If one goes red, a cross-tenant breach has been reintroduced.
//
// Runs against an in-memory collection (tests/helpers/fake-collection.ts)
// so it needs no mongod binary and can gate every PR. It exercises the
// REAL BaseRepository query-construction code — which is where all of the
// isolation bugs lived — rather than mocking the repository itself.

import { BaseRepository } from '../../server/repositories/base.repository';
import { TenantScopeError } from '../../server/tenancy/tenant-scope';
import { FakeCollection } from '../helpers/fake-collection';

const ORG_A = '68a1f2c4e5b7a9d3c1f04a11';
const ORG_B = '68a1f2c4e5b7a9d3c1f04b22';

interface TestVehicle {
  _id?: string;
  tenantId: string;
  license_plate: string;
  make: string;
  isDeleted?: boolean;
}

const collection = new FakeCollection();

class TestVehicleRepository extends BaseRepository<any> {
  protected collectionName = 'tblvehicles';
  protected async getCollection(): Promise<any> {
    return collection as unknown as any;
  }
  public buildFilter(tenantId: string, isPlatformAdmin = false) {
    return this.getTenantFilter(tenantId, isPlatformAdmin);
  }
}

const repo = new TestVehicleRepository();

/** Mongo's ObjectId.isValid() gate in BaseRepository requires 24-hex ids. */
function idOf(plate: string): string {
  const doc = collection.docs.find((d) => d.license_plate === plate);
  if (!doc) throw new Error(`no seeded vehicle ${plate}`);
  return String(doc._id);
}

beforeEach(() => {
  collection.seenFilters = [];
  collection.seed([
    { tenantId: ORG_A, license_plate: 'AAA-001', make: 'Volvo', isDeleted: false },
    { tenantId: ORG_A, license_plate: 'AAA-002', make: 'Scania', isDeleted: false },
    { tenantId: ORG_B, license_plate: 'BBB-001', make: 'Volvo', isDeleted: false },
    { tenantId: ORG_B, license_plate: 'BBB-002', make: 'MAN', isDeleted: false },
    { tenantId: ORG_B, license_plate: 'BBB-003', make: 'Volvo', isDeleted: false },
  ]);
});

describe('cross-tenant read isolation', () => {
  it('a list scoped to Org A returns only Org A vehicles', async () => {
    const rows = await repo.findMany({}, ORG_A);
    expect(rows).toHaveLength(2);
    expect(rows.every((r) => r.tenantId === ORG_A)).toBe(true);
  });

  it('a list scoped to Org B returns only Org B vehicles', async () => {
    const rows = await repo.findMany({}, ORG_B);
    expect(rows).toHaveLength(3);
    expect(rows.every((r) => r.tenantId === ORG_B)).toBe(true);
  });

  it('counts do not leak across tenants', async () => {
    expect(await repo.count({}, ORG_A)).toBe(2);
    expect(await repo.count({}, ORG_B)).toBe(3);
  });

  it('a shared attribute value does not bridge tenants', async () => {
    // Three vehicles are Volvos; two belong to Org B.
    const rows = await repo.findMany({ make: 'Volvo' } as any, ORG_A);
    expect(rows).toHaveLength(1);
    expect(rows[0].tenantId).toBe(ORG_A);
  });

  it('pagination does not leak across tenants', async () => {
    const page = await repo.findWithPagination({}, { page: 1, limit: 50 }, ORG_A);
    expect(page.pagination.total).toBe(2);
    expect(page.data.every((r) => r.tenantId === ORG_A)).toBe(true);
  });
});

describe('caller-supplied filters cannot override tenant scope', () => {
  // REGRESSION GUARD. BaseRepository used to build queries as
  //   { ...tenantFilter, ...callerFilter }
  // so a caller filter containing a `tenantId` key silently replaced the
  // scope predicate. The spread order is now reversed.

  it('an explicit tenantId in the caller filter is ignored', async () => {
    const rows = await repo.findMany(
      { tenantId: ORG_B } as unknown as any,
      ORG_A
    );
    expect(rows.every((r) => r.tenantId === ORG_A)).toBe(true);
    expect(rows).toHaveLength(2);
  });

  it('a $ne trick in the caller filter cannot widen scope', async () => {
    const rows = await repo.findMany(
      { tenantId: { $ne: ORG_A } } as unknown as any,
      ORG_A
    );
    expect(rows.every((r) => r.tenantId === ORG_A)).toBe(true);
  });

  it('findOne cannot be steered into another tenant', async () => {
    const row = await repo.findOne(
      { tenantId: ORG_B, license_plate: 'BBB-001' } as unknown as any,
      ORG_A
    );
    expect(row).toBeNull();
  });

  it('count cannot be steered into another tenant', async () => {
    const n = await repo.count(
      { tenantId: ORG_B } as unknown as any,
      ORG_A
    );
    expect(n).toBe(2);
  });
});

describe('cross-tenant mutation isolation', () => {
  it('Org A cannot update an Org B record by id', async () => {
    const result = await repo.update(idOf('BBB-001'), { make: 'HIJACKED' }, ORG_A);
    expect(result).toBeNull();
    expect(collection.docs.find((d) => d.license_plate === 'BBB-001')!.make).toBe('Volvo');
  });

  it('Org A cannot soft-delete an Org B record', async () => {
    const ok = await repo.softDelete(idOf('BBB-002'), ORG_A);
    expect(ok).toBe(false);
    expect(collection.docs.find((d) => d.license_plate === 'BBB-002')!.isDeleted).not.toBe(true);
  });

  it('Org A cannot hard-delete an Org B record', async () => {
    const ok = await repo.hardDelete(idOf('BBB-003'), ORG_A);
    expect(ok).toBe(false);
    expect(collection.docs.filter((d) => d.tenantId === ORG_B)).toHaveLength(3);
  });

  it('findById does not resolve another tenant\u2019s record', async () => {
    expect(await repo.findById(idOf('BBB-001'), ORG_A)).toBeNull();
    expect(await repo.findById(idOf('BBB-001'), ORG_B)).not.toBeNull();
  });
});

describe('write path stamps the correct owner', () => {
  it('created rows carry the creating tenant', async () => {
    await repo.create(
      { license_plate: 'AAA-003', make: 'DAF' } as any,
      ORG_A,
      'user-1'
    );
    expect(collection.docs.find((d) => d.license_plate === 'AAA-003')!.tenantId).toBe(ORG_A);
  });

  it('a supplied tenantId in the payload cannot override the owner', async () => {
    await repo.create(
      { license_plate: 'AAA-004', make: 'Iveco', tenantId: ORG_B } as any,
      ORG_A,
      'user-1'
    );
    expect(collection.docs.find((d) => d.license_plate === 'AAA-004')!.tenantId).toBe(ORG_A);
  });

  it('refuses to persist a row scoped to a legacy sentinel', async () => {
    // This is the exact write that corrupted the production collection:
    // an import running with tenantId 'default'.
    await expect(
      repo.create({ license_plate: 'XXX-001', make: 'Ghost' } as any, 'default', 'user-1')
    ).rejects.toBeInstanceOf(TenantScopeError);

    expect(collection.docs.filter((d) => d.license_plate === 'XXX-001')).toHaveLength(0);
  });

  it('refuses to persist a row with no owner at all', async () => {
    await expect(
      repo.create({ license_plate: 'XXX-002', make: 'Ghost' } as any, '', 'user-1')
    ).rejects.toBeInstanceOf(TenantScopeError);
  });
});

describe('fail-closed behaviour on reads', () => {
  it('a legacy sentinel scope throws instead of returning everything', async () => {
    await expect(repo.findMany({}, 'default')).rejects.toBeInstanceOf(TenantScopeError);
    await expect(repo.findMany({}, 'system')).rejects.toBeInstanceOf(TenantScopeError);
    await expect(repo.findMany({}, 'super_admin')).rejects.toBeInstanceOf(TenantScopeError);
  });

  it('an empty scope throws instead of returning everything', async () => {
    await expect(repo.findMany({}, '')).rejects.toBeInstanceOf(TenantScopeError);
  });

  it('the filter for a real tenant always contains the predicate', () => {
    expect(repo.buildFilter(ORG_A)).toEqual({ tenantId: ORG_A });
  });

  it('only an explicit platform admin gets an unfiltered query', () => {
    expect(repo.buildFilter(ORG_A, true)).toEqual({});
    expect(repo.buildFilter(ORG_A, false)).toEqual({ tenantId: ORG_A });
  });
});

describe('platform admin scope', () => {
  it('sees every tenant, by explicit flag only', async () => {
    const rows = await repo.findMany({}, ORG_A, {}, false, true);
    expect(rows).toHaveLength(5);
  });
});

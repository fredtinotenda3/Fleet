// tests/unit/transport-cost/customer-destination.repository.spec.ts
//
// OLIVINE LIVE OPERATING MODEL, SLICE 3. CustomerRepository/
// DestinationRepository are structurally identical (see destination.
// repository.ts's own header: "see that file's header for the full
// reasoning, which applies here unchanged"), so this one spec exercises
// both with the same TestRepo/FakeCollection pattern already used for
// transport-cost-source-record-load-summary.repository.spec.ts. Covers
// items 2/3/6/7/8/11/17 of the client's Slice 3 test list: search,
// select, duplicate prevention (findByNormalizedName pre-check), tenant
// isolation, inactive-record exclusion from new-entry search while
// staying resolvable historically, and adversarial cross-tenant
// leakage.
//
// Deliberately does NOT attempt to prove the unique-index race-
// condition defense here: FakeCollection's insertOne does not enforce
// uniqueness (see its own header -- it implements only the operator
// surface BaseRepository's generated filters touch, not Mongo's index
// engine), so `create()` never throws a duplicate-key ConflictError
// against this fake. That path is covered at the service layer instead
// (master-data.service.spec.ts), where the repository is mocked and can
// be made to throw ConflictError directly. The index DEFINITION itself
// (unique: true on {tenantId, normalizedName}) is pinned by
// tests/security/transport-cost-indexes.spec.ts.

import { CustomerRepository } from '../../../modules/transport-cost/repositories/customer.repository';
import { DestinationRepository } from '../../../modules/transport-cost/repositories/destination.repository';
import { TenantScopeError } from '../../../server/tenancy/tenant-scope';
import { FakeCollection } from '../../helpers/fake-collection';

const TENANT_A = 'olivine-group-slice3-a';
const TENANT_B = 'olivine-group-slice3-b';

class TestCustomerRepo extends CustomerRepository {
  collection = new FakeCollection();
  async getCollection() {
    return this.collection as any;
  }
}

class TestDestinationRepo extends DestinationRepository {
  collection = new FakeCollection();
  async getCollection() {
    return this.collection as any;
  }
}

// Run the exact same behavioural suite against both repositories --
// they are structurally identical, and a divergence between them would
// itself be a bug worth catching.
describe.each([
  ['CustomerRepository', () => new TestCustomerRepo()],
  ['DestinationRepository', () => new TestDestinationRepo()],
] as const)('%s (Slice 3 master data)', (_name, makeRepo) => {
  it('findByNormalizedName finds an exact normalized match within the same tenant', async () => {
    const repo = makeRepo();
    await repo.create({ name: 'Harare', normalizedName: 'HARARE', active: true } as any, TENANT_A, 'user-1');

    const found = await repo.findByNormalizedName('HARARE', TENANT_A);
    expect(found).not.toBeNull();
    expect(found!.name).toBe('Harare');
  });

  it('findByNormalizedName returns null when nothing matches', async () => {
    const repo = makeRepo();
    const found = await repo.findByNormalizedName('BULAWAYO', TENANT_A);
    expect(found).toBeNull();
  });

  it('findByNormalizedName still resolves an INACTIVE record -- historical references must keep working', async () => {
    const repo = makeRepo();
    const created = await repo.create({ name: 'Gweru', normalizedName: 'GWERU', active: true } as any, TENANT_A, 'user-1');
    await repo.update(created._id!, { active: false } as any, TENANT_A, 'user-1');

    const found = await repo.findByNormalizedName('GWERU', TENANT_A);
    expect(found).not.toBeNull();
    expect(found!.active).toBe(false);
  });

  it('search excludes inactive records -- they should not appear in new-entry results', async () => {
    const repo = makeRepo();
    const active = await repo.create({ name: 'Active Co', normalizedName: 'ACTIVE CO', active: true } as any, TENANT_A, 'u1');
    const inactive = await repo.create({ name: 'Retired Co', normalizedName: 'RETIRED CO', active: true } as any, TENANT_A, 'u1');
    await repo.update(inactive._id!, { active: false } as any, TENANT_A, 'u1');

    const results = await repo.search('Co', TENANT_A);
    const ids = results.map((r) => r._id);
    expect(ids).toContain(active._id);
    expect(ids).not.toContain(inactive._id);
  });

  it('search does a case-insensitive "contains" match, not just a prefix match', async () => {
    const repo = makeRepo();
    await repo.create({ name: 'Northern Bulawayo Depot', normalizedName: 'NORTHERN BULAWAYO DEPOT', active: true } as any, TENANT_A, 'u1');

    const results = await repo.search('bulawayo', TENANT_A);
    expect(results).toHaveLength(1);
  });

  it('an empty query returns active records (alphabetical), not zero results -- lets the dropdown show something on first open', async () => {
    const repo = makeRepo();
    await repo.create({ name: 'Zeta', normalizedName: 'ZETA', active: true } as any, TENANT_A, 'u1');
    await repo.create({ name: 'Alpha', normalizedName: 'ALPHA', active: true } as any, TENANT_A, 'u1');

    const results = await repo.search('', TENANT_A);
    expect(results.map((r) => r.name)).toEqual(['Alpha', 'Zeta']);
  });

  it('listPaginated with activeOnly=true excludes inactive rows; without it, both are returned', async () => {
    const repo = makeRepo();
    const active = await repo.create({ name: 'Kept', normalizedName: 'KEPT', active: true } as any, TENANT_A, 'u1');
    const inactive = await repo.create({ name: 'Dropped', normalizedName: 'DROPPED', active: true } as any, TENANT_A, 'u1');
    await repo.update(inactive._id!, { active: false } as any, TENANT_A, 'u1');

    const activeOnlyPage = await repo.listPaginated(TENANT_A, { page: 1, limit: 20 }, true);
    expect(activeOnlyPage.data.map((r) => r._id)).toEqual([active._id]);

    const allPage = await repo.listPaginated(TENANT_A, { page: 1, limit: 20 }, false);
    expect(allPage.data.map((r) => r._id).sort()).toEqual([active._id, inactive._id].sort());
  });

  // ── Tenant isolation (items 8 & 17: adversarial, no cross-tenant leakage). ──

  it('search never returns another tenant\'s records, even with an identical name', async () => {
    const repo = makeRepo();
    await repo.create({ name: 'Shared Name Co', normalizedName: 'SHARED NAME CO', active: true } as any, TENANT_A, 'u1');
    await repo.create({ name: 'Shared Name Co', normalizedName: 'SHARED NAME CO', active: true } as any, TENANT_B, 'u1');

    const asTenantA = await repo.search('Shared', TENANT_A);
    const asTenantB = await repo.search('Shared', TENANT_B);
    expect(asTenantA).toHaveLength(1);
    expect(asTenantB).toHaveLength(1);
    expect(asTenantA[0]._id).not.toBe(asTenantB[0]._id);
  });

  it('findByNormalizedName never resolves another tenant\'s record', async () => {
    const repo = makeRepo();
    await repo.create({ name: 'Only In A', normalizedName: 'ONLY IN A', active: true } as any, TENANT_A, 'u1');

    const asTenantB = await repo.findByNormalizedName('ONLY IN A', TENANT_B);
    expect(asTenantB).toBeNull();
  });

  // ── Empty scope fails closed (item 10). ─────────────────────────────

  it('an empty/missing tenantId fails closed on every read -- never silently widens to platform scope', async () => {
    const repo = makeRepo();
    await expect(repo.search('anything', '')).rejects.toBeInstanceOf(TenantScopeError);
    await expect(repo.findByNormalizedName('ANYTHING', '')).rejects.toBeInstanceOf(TenantScopeError);
    await expect(repo.listPaginated('', { page: 1, limit: 20 })).rejects.toBeInstanceOf(TenantScopeError);
  });

  it('an empty/missing tenantId fails closed on create too', async () => {
    const repo = makeRepo();
    await expect(
      repo.create({ name: 'Nobody', normalizedName: 'NOBODY', active: true } as any, '', 'u1')
    ).rejects.toBeInstanceOf(TenantScopeError);
  });
});

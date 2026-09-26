// tests/unit/transport-cost/transporter-vehicle-search.repository.spec.ts
//
// OLIVINE LIVE OPERATING MODEL, SLICE 1-5 PRODUCTION VERIFICATION PASS,
// HIGH PRIORITY. Direct repository-level coverage for
// TransportPartnerRepository.searchConfirmedByName and
// ContractedVehicleRepository.searchConfirmedByRegistration -- the two
// methods behind the reported production defect ("the form appears to
// show only approximately 20 transporters" / the identical symptom for
// vehicle registration search).
//
// tests/unit/transport-cost/master-data.service.spec.ts already covers
// MasterDataService's own mapping/joining logic with these two
// repositories MOCKED away entirely -- it cannot catch a bug in the
// repositories' own filter construction, sort order, or the hasMore
// truncation-detection logic itself. This file exercises the real
// filter/sort/limit pipeline against FakeCollection (the same pattern
// tests/unit/transport-cost/customer-destination.repository.spec.ts and
// tests/unit/transport-cost/normalization-review-gap-closure.spec.ts
// already use), so a regression in the actual query -- e.g. reviewStatus
// no longer filtered, a merged/rejected row leaking back in, tenant
// isolation breaking, or hasMore silently going stale -- is caught here,
// not just at the service's mocked boundary.

import { TransportPartnerRepository } from '../../../modules/transport-cost/repositories/transport-partner.repository';
import { ContractedVehicleRepository } from '../../../modules/transport-cost/repositories/contracted-vehicle.repository';
import { TenantScopeError } from '../../../server/tenancy/tenant-scope';
import { FakeCollection } from '../../helpers/fake-collection';

const TENANT_A = 'olivine-group-search-a';
const TENANT_B = 'olivine-group-search-b';

function makePartnerRepo() {
  const fake = new FakeCollection();
  class TestRepo extends TransportPartnerRepository {
    async getCollection() {
      return fake as any;
    }
  }
  return new TestRepo();
}

function makeVehicleRepo() {
  const fake = new FakeCollection();
  class TestRepo extends ContractedVehicleRepository {
    async getCollection() {
      return fake as any;
    }
  }
  return new TestRepo();
}

describe('TransportPartnerRepository.searchConfirmedByName', () => {
  it('returns only CONFIRMED rows -- an auto-suggested or needs-review identity is not yet safe to offer for direct selection', async () => {
    const repo = makePartnerRepo();
    await repo.create({ canonicalName: 'CONFIRMED CARRIER', aliases: [], reviewStatus: 'confirmed' }, TENANT_A, 'u1');
    await repo.create({ canonicalName: 'PENDING CARRIER', aliases: [], reviewStatus: 'needs-review' }, TENANT_A, 'u1');
    await repo.create({ canonicalName: 'SUGGESTED CARRIER', aliases: [], reviewStatus: 'auto-suggested' }, TENANT_A, 'u1');

    const { results } = await repo.searchConfirmedByName('carrier', TENANT_A);
    expect(results.map((r) => r.canonicalName)).toEqual(['CONFIRMED CARRIER']);
  });

  it('excludes a row that has been merged into another partner', async () => {
    const repo = makePartnerRepo();
    const survivor = await repo.create({ canonicalName: 'SURVIVOR CARRIER', aliases: [], reviewStatus: 'confirmed' }, TENANT_A, 'u1');
    await repo.create(
      { canonicalName: 'ABSORBED CARRIER', aliases: [], reviewStatus: 'confirmed', mergedIntoPartnerId: survivor._id },
      TENANT_A,
      'u1'
    );

    const { results } = await repo.searchConfirmedByName('carrier', TENANT_A);
    expect(results.map((r) => r.canonicalName)).toEqual(['SURVIVOR CARRIER']);
  });

  it('does a case-insensitive "contains" match on canonicalName, not a prefix match', async () => {
    const repo = makePartnerRepo();
    await repo.create({ canonicalName: 'NORTHERN PRINORTH LOGISTICS', aliases: [], reviewStatus: 'confirmed' }, TENANT_A, 'u1');

    const { results } = await repo.searchConfirmedByName('prinorth', TENANT_A);
    expect(results).toHaveLength(1);
  });

  // ── PRODUCTION FIX verification: hasMore truncation signal ─────────

  it('hasMore is false, and every matching row is returned, when the result set fits on one page', async () => {
    const repo = makePartnerRepo();
    for (let i = 0; i < 5; i += 1) {
      await repo.create(
        { canonicalName: `Carrier ${String(i).padStart(2, '0')}`, aliases: [], reviewStatus: 'confirmed' },
        TENANT_A,
        'u1'
      );
    }

    const { results, hasMore } = await repo.searchConfirmedByName('Carrier', TENANT_A, 10);
    expect(results).toHaveLength(5);
    expect(hasMore).toBe(false);
  });

  it('hasMore is true, and results is capped at exactly the page limit, when MORE confirmed transporters exist than fit on one page -- the exact production defect ("only ~20 transporters" / here reproduced with a small page size for a fast test)', async () => {
    const repo = makePartnerRepo();
    for (let i = 0; i < 25; i += 1) {
      await repo.create(
        { canonicalName: `Carrier ${String(i).padStart(2, '0')}`, aliases: [], reviewStatus: 'confirmed' },
        TENANT_A,
        'u1'
      );
    }

    // Opening the picker with no typed query yet (the reported failure
    // mode) still must signal there are more than fit on the page.
    const { results, hasMore } = await repo.searchConfirmedByName('', TENANT_A, 20);
    expect(results).toHaveLength(20);
    expect(hasMore).toBe(true);
    // Alphabetical top-20, not an arbitrary 20 -- the 21st (probe) row
    // is detected and discarded, never surfaced as a phantom result.
    expect(results[0].canonicalName).toBe('Carrier 00');
    expect(results[19].canonicalName).toBe('Carrier 19');
  });

  it('the default page size is 50, not 20 -- a modest secondary headroom improvement paired with the hasMore signal (NOT the fix itself)', async () => {
    const repo = makePartnerRepo();
    for (let i = 0; i < 30; i += 1) {
      await repo.create(
        { canonicalName: `Carrier ${String(i).padStart(2, '0')}`, aliases: [], reviewStatus: 'confirmed' },
        TENANT_A,
        'u1'
      );
    }

    const { results, hasMore } = await repo.searchConfirmedByName('', TENANT_A);
    expect(results).toHaveLength(30);
    expect(hasMore).toBe(false);
  });

  // ── Tenant isolation (adversarial: identical name, different tenant) ─

  it('never returns another tenant\'s transporters, even with an identical canonical name', async () => {
    const repo = makePartnerRepo();
    await repo.create({ canonicalName: 'SHARED NAME CARRIER', aliases: [], reviewStatus: 'confirmed' }, TENANT_A, 'u1');
    await repo.create({ canonicalName: 'SHARED NAME CARRIER', aliases: [], reviewStatus: 'confirmed' }, TENANT_B, 'u1');

    const asTenantA = await repo.searchConfirmedByName('Shared', TENANT_A);
    const asTenantB = await repo.searchConfirmedByName('Shared', TENANT_B);
    expect(asTenantA.results).toHaveLength(1);
    expect(asTenantB.results).toHaveLength(1);
    expect(asTenantA.results[0]._id).not.toBe(asTenantB.results[0]._id);
  });

  it('an empty/missing tenantId fails closed rather than silently widening to platform scope', async () => {
    const repo = makePartnerRepo();
    await expect(repo.searchConfirmedByName('anything', '')).rejects.toBeInstanceOf(TenantScopeError);
  });
});

describe('ContractedVehicleRepository.searchConfirmedByRegistration', () => {
  async function seedTransporter(tenantId: string) {
    const repo = makePartnerRepo();
    return repo.create({ canonicalName: 'PRINORTH', aliases: [], reviewStatus: 'confirmed' }, tenantId, 'u1');
  }

  it('returns only CONFIRMED vehicles', async () => {
    const repo = makeVehicleRepo();
    const transporter = await seedTransporter(TENANT_A);
    await repo.create(
      { registration: 'AGL8230', registrationRaw: 'AGL 8230', transporterPartnerId: transporter._id!, isMultiPlate: false, reviewStatus: 'confirmed' },
      TENANT_A,
      'u1'
    );
    await repo.create(
      { registration: 'AGL8231', registrationRaw: 'AGL 8231', transporterPartnerId: transporter._id!, isMultiPlate: false, reviewStatus: 'needs-review' },
      TENANT_A,
      'u1'
    );

    const { results } = await repo.searchConfirmedByRegistration('AGL', TENANT_A);
    expect(results.map((r) => r.registration)).toEqual(['AGL8230']);
  });

  it('normalizes the query (strips whitespace, uppercases) before matching, matching the stored registration format', async () => {
    const repo = makeVehicleRepo();
    const transporter = await seedTransporter(TENANT_A);
    await repo.create(
      { registration: 'AGL8230', registrationRaw: 'AGL 8230', transporterPartnerId: transporter._id!, isMultiPlate: false, reviewStatus: 'confirmed' },
      TENANT_A,
      'u1'
    );

    const { results } = await repo.searchConfirmedByRegistration('agl 82', TENANT_A);
    expect(results).toHaveLength(1);
  });

  it('narrows to one transporter\'s own fleet when transporterPartnerId is supplied', async () => {
    const repo = makeVehicleRepo();
    const transporterA = await seedTransporter(TENANT_A);
    const transporterB = await seedTransporter(TENANT_A);
    await repo.create(
      { registration: 'AGL8230', registrationRaw: 'AGL 8230', transporterPartnerId: transporterA._id!, isMultiPlate: false, reviewStatus: 'confirmed' },
      TENANT_A,
      'u1'
    );
    await repo.create(
      { registration: 'AGL8231', registrationRaw: 'AGL 8231', transporterPartnerId: transporterB._id!, isMultiPlate: false, reviewStatus: 'confirmed' },
      TENANT_A,
      'u1'
    );

    const { results } = await repo.searchConfirmedByRegistration('AGL', TENANT_A, transporterA._id!);
    expect(results.map((r) => r.registration)).toEqual(['AGL8230']);
  });

  // ── PRODUCTION FIX verification: hasMore truncation signal ─────────

  it('hasMore is true, and results is capped at exactly the page limit, when MORE confirmed vehicles exist than fit on one page -- the exact production defect reported for truck/vehicle registration search', async () => {
    const repo = makeVehicleRepo();
    const transporter = await seedTransporter(TENANT_A);
    for (let i = 0; i < 25; i += 1) {
      const reg = `AGL${String(8200 + i)}`;
      await repo.create(
        { registration: reg, registrationRaw: reg, transporterPartnerId: transporter._id!, isMultiPlate: false, reviewStatus: 'confirmed' },
        TENANT_A,
        'u1'
      );
    }

    const { results, hasMore } = await repo.searchConfirmedByRegistration('', TENANT_A, undefined, 20);
    expect(results).toHaveLength(20);
    expect(hasMore).toBe(true);
  });

  it('hasMore is false when every confirmed vehicle fits on one page', async () => {
    const repo = makeVehicleRepo();
    const transporter = await seedTransporter(TENANT_A);
    await repo.create(
      { registration: 'AGL8230', registrationRaw: 'AGL 8230', transporterPartnerId: transporter._id!, isMultiPlate: false, reviewStatus: 'confirmed' },
      TENANT_A,
      'u1'
    );

    const { results, hasMore } = await repo.searchConfirmedByRegistration('', TENANT_A);
    expect(results).toHaveLength(1);
    expect(hasMore).toBe(false);
  });

  // ── Tenant isolation (adversarial: identical registration, different tenant) ─

  it('never returns another tenant\'s vehicles, even with an identical registration', async () => {
    const repo = makeVehicleRepo();
    const transporterA = await seedTransporter(TENANT_A);
    const transporterB = await seedTransporter(TENANT_B);
    await repo.create(
      { registration: 'AGL8230', registrationRaw: 'AGL 8230', transporterPartnerId: transporterA._id!, isMultiPlate: false, reviewStatus: 'confirmed' },
      TENANT_A,
      'u1'
    );
    await repo.create(
      { registration: 'AGL8230', registrationRaw: 'AGL 8230', transporterPartnerId: transporterB._id!, isMultiPlate: false, reviewStatus: 'confirmed' },
      TENANT_B,
      'u1'
    );

    const asTenantA = await repo.searchConfirmedByRegistration('AGL8230', TENANT_A);
    const asTenantB = await repo.searchConfirmedByRegistration('AGL8230', TENANT_B);
    expect(asTenantA.results).toHaveLength(1);
    expect(asTenantB.results).toHaveLength(1);
    expect(asTenantA.results[0]._id).not.toBe(asTenantB.results[0]._id);
  });

  it('an empty/missing tenantId fails closed rather than silently widening to platform scope', async () => {
    const repo = makeVehicleRepo();
    await expect(repo.searchConfirmedByRegistration('anything', '')).rejects.toBeInstanceOf(TenantScopeError);
  });
});

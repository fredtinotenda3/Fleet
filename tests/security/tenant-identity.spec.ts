// tests/security/tenant-identity.spec.ts
//
// Guards the identity-resolution bug that real production data exposed.
//
// tenant-forensics.ts and backfill-user-tenants.ts both assumed
// `tenantId === String(organization._id)`. In the live database the
// canonical identifier is the organization SLUG. That single wrong
// assumption caused forensics to report "0.0% recoverable" (every
// recoverability check compared a slug against ObjectId hex and never
// matched) and would have made the backfill write ObjectIds onto accounts
// whose fleet data is keyed by slug — logging them in to an empty fleet.
//
// The fixtures below use the exact shapes from the live export.

import {
  buildTenantIdentityIndex,
  resolveCanonical,
  isLegacySentinel,
  isUnusableTenantValue,
} from '../../scripts/lib/tenant-identity';

/** Minimal stand-in for the two Db calls the index builder makes. */
function stubDb(orgs: Array<Record<string, unknown>>) {
  return {
    collection: () => ({
      find: () => ({ toArray: async () => orgs }),
    }),
  } as never;
}

// Shapes taken verbatim from the live tblorganizations export.
const LIVE_ORGS = [
  {
    _id: '6a4e10b4a644b5ae2e61d1a3',
    tenantId: 'willsgrove-farm-enterprises-9e80ed',
    slug: 'willsgrove-farm-enterprises-9e80ed',
    name: 'Willsgrove Farm Enterprises_Harare',
    status: 'active',
  },
  { _id: '6a63248a42672a8899f88d6b', tenantId: 'rsc-f37f58', slug: 'rsc-f37f58', name: 'RSC' },
  {
    _id: '6a705d7b7c2bdb34803b8ad4',
    tenantId: 'toyota-zimbabwe-63078f',
    slug: 'toyota-zimbabwe-63078f',
    name: 'Toyota Zimbabwe',
  },
  {
    _id: '6a7060675983ed1e51ef055d',
    tenantId: 'toyota-zimbabwe-949d94',
    slug: 'toyota-zimbabwe-949d94',
    name: 'Toyota Zimbabwe',
  },
  {
    _id: '6a70606f5983ed1e51ef057f',
    tenantId: 'honda-zimbabwe-9e191a',
    slug: 'honda-zimbabwe-9e191a',
    name: 'Honda Zimbabwe',
  },
];

describe('tenant identity resolution', () => {
  it('treats the organization slug as canonical, not the ObjectId', async () => {
    const index = await buildTenantIdentityIndex(stubDb(LIVE_ORGS));
    expect(index.canonicalSet.has('willsgrove-farm-enterprises-9e80ed')).toBe(true);
    // The ObjectId is an accepted ALIAS but never the canonical form.
    expect(index.canonicalSet.has('6a4e10b4a644b5ae2e61d1a3')).toBe(false);
  });

  it('resolves a slug to itself', async () => {
    const index = await buildTenantIdentityIndex(stubDb(LIVE_ORGS));
    expect(resolveCanonical(index, 'toyota-zimbabwe-949d94')).toBe('toyota-zimbabwe-949d94');
  });

  it('resolves an ObjectId alias to the canonical slug', async () => {
    // THE REGRESSION. The old code compared a slug against a set of
    // ObjectIds and returned nothing, so ownership looked unrecoverable.
    const index = await buildTenantIdentityIndex(stubDb(LIVE_ORGS));
    expect(resolveCanonical(index, '6a7060675983ed1e51ef055d')).toBe('toyota-zimbabwe-949d94');
  });

  it('never resolves a legacy sentinel to an organization', async () => {
    const index = await buildTenantIdentityIndex(stubDb(LIVE_ORGS));
    for (const sentinel of ['default', 'system', 'super_admin', 'DEFAULT']) {
      expect(resolveCanonical(index, sentinel)).toBeUndefined();
    }
  });

  it('never resolves an empty or absent value', async () => {
    const index = await buildTenantIdentityIndex(stubDb(LIVE_ORGS));
    for (const value of [undefined, null, '', '   ']) {
      expect(resolveCanonical(index, value)).toBeUndefined();
    }
  });

  it('keeps two same-named organizations strictly separate', async () => {
    // The live database has two distinct "Toyota Zimbabwe" tenants. They
    // must never collapse into one — merging tenants would mix customer
    // fleets together.
    const index = await buildTenantIdentityIndex(stubDb(LIVE_ORGS));
    const a = resolveCanonical(index, 'toyota-zimbabwe-63078f');
    const b = resolveCanonical(index, 'toyota-zimbabwe-949d94');
    expect(a).not.toBe(b);
    expect(index.canonicalSet.size).toBe(5);
  });

  it('flags duplicate display names for human review without merging', async () => {
    const index = await buildTenantIdentityIndex(stubDb(LIVE_ORGS));
    const dupes = index.duplicateNames.get('toyota zimbabwe');
    expect(dupes).toHaveLength(2);
    expect(index.organizations).toHaveLength(5);
  });

  it('falls back to the ObjectId when an org has neither tenantId nor slug', async () => {
    const index = await buildTenantIdentityIndex(
      stubDb([{ _id: '6a0000000000000000000001', name: 'Legacy Org' }])
    );
    expect(index.canonicalSet.has('6a0000000000000000000001')).toBe(true);
  });

  it('classifies unusable tenant values consistently', () => {
    expect(isLegacySentinel('default')).toBe(true);
    expect(isLegacySentinel('Super_Admin')).toBe(true);
    expect(isLegacySentinel('toyota-zimbabwe-949d94')).toBe(false);

    expect(isUnusableTenantValue('')).toBe(true);
    expect(isUnusableTenantValue(undefined)).toBe(true);
    expect(isUnusableTenantValue('system')).toBe(true);
    expect(isUnusableTenantValue('rsc-f37f58')).toBe(false);
  });
});

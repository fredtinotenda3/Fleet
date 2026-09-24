// tests/security/transport-cost-indexes.spec.ts
//
// Phase O1/O2/O3/Slice 3: verifies the index definitions added for
// tbltransportcostsourcerecords, tbltransportpartners,
// tblcontractedvehicles, tblnormalizationreviewitems, (Phase O3)
// tbltransportcostvatconfigs, and (Slice 3) tblcustomers/tbldestinations
// are structurally sound and actually wired into the merged INDEXES
// export, mirroring tests/security/finance-indexes.spec.ts's approach
// and rationale (cannot prove an EXPLAIN plan without a live Mongo
// instance; proves the addendum isn't defined-but-forgotten, is
// tenant-isolated, and doesn't collide with any other addendum's index
// names).

import { INDEXES } from '../../infrastructure/database/indexes';
import { TRANSPORT_COST_INDEXES } from '../../infrastructure/database/indexes.transport-cost-addendum';

const TRANSPORT_COST_COLLECTIONS = [
  'tbltransportcostsourcerecords',
  'tbltransportpartners',
  'tblcontractedvehicles',
  'tblnormalizationreviewitems',
  // Phase O3.
  'tbltransportcostvatconfigs',
  // Slice 3.
  'tblcustomers',
  'tbldestinations',
] as const;

describe('Olivine transport-cost collection indexes (Phase O1/O2/O3)', () => {
  it('defines at least one index for each transport-cost collection', () => {
    for (const collection of TRANSPORT_COST_COLLECTIONS) {
      expect(TRANSPORT_COST_INDEXES[collection]).toBeDefined();
      expect(TRANSPORT_COST_INDEXES[collection].length).toBeGreaterThan(0);
    }
  });

  it('is actually merged into the exported INDEXES map (not defined but forgotten)', () => {
    for (const collection of TRANSPORT_COST_COLLECTIONS) {
      expect((INDEXES as any)[collection]).toEqual(TRANSPORT_COST_INDEXES[collection]);
    }
  });

  it('every transport-cost index leads with tenantId -- no index can be satisfied without a tenant match', () => {
    for (const collection of TRANSPORT_COST_COLLECTIONS) {
      for (const index of TRANSPORT_COST_INDEXES[collection]) {
        const firstKey = Object.keys(index.key)[0];
        expect(firstKey).toBe('tenantId');
      }
    }
  });

  it('every transport-cost index name is unique within the merged INDEXES map', () => {
    const ownNames = new Set<string>();
    for (const collection of TRANSPORT_COST_COLLECTIONS) {
      for (const index of TRANSPORT_COST_INDEXES[collection]) {
        ownNames.add(index.name);
      }
    }

    const seenOutside: string[] = [];
    for (const collection of Object.keys(INDEXES) as Array<keyof typeof INDEXES>) {
      if ((TRANSPORT_COST_COLLECTIONS as readonly string[]).includes(collection as string)) continue;
      for (const index of INDEXES[collection] as ReadonlyArray<{ name: string }>) {
        if (ownNames.has(index.name)) seenOutside.push(index.name);
      }
    }
    expect(seenOutside).toEqual([]);

    for (const collection of TRANSPORT_COST_COLLECTIONS) {
      const names = TRANSPORT_COST_INDEXES[collection].map((i) => i.name);
      expect(new Set(names).size).toBe(names.length);
    }
  });

  it('findLikelyDuplicate is backed by a {tenantId, sheetFamily, registration, date} index', () => {
    const has = TRANSPORT_COST_INDEXES.tbltransportcostsourcerecords.some(
      (index) => JSON.stringify(index.key) === JSON.stringify({ tenantId: 1, sheetFamily: 1, registration: 1, date: 1 })
    );
    expect(has).toBe(true);
  });

  it('findByImportBatch/countByImportBatch is backed by a {tenantId, importBatchId, ...} index', () => {
    const has = TRANSPORT_COST_INDEXES.tbltransportcostsourcerecords.some(
      (index) => Object.keys(index.key)[0] === 'tenantId' && Object.keys(index.key)[1] === 'importBatchId'
    );
    expect(has).toBe(true);
  });

  it('ContractedVehicle registration is a UNIQUE index per tenant -- one plate cannot resolve to two identities', () => {
    const uniqueIndex = TRANSPORT_COST_INDEXES.tblcontractedvehicles.find(
      (index) => index.name === 'uniq_contractedvehicle_tenant_registration'
    );
    expect(uniqueIndex).toBeDefined();
    expect((uniqueIndex as any).unique).toBe(true);
    expect(uniqueIndex!.key).toEqual({ tenantId: 1, registration: 1 });
  });

  it('findByExactNameOrAlias is backed by indexes on both canonicalName and aliases', () => {
    const hasCanonical = TRANSPORT_COST_INDEXES.tbltransportpartners.some(
      (index) => JSON.stringify(index.key) === JSON.stringify({ tenantId: 1, canonicalName: 1 })
    );
    const hasAliases = TRANSPORT_COST_INDEXES.tbltransportpartners.some(
      (index) => JSON.stringify(index.key) === JSON.stringify({ tenantId: 1, aliases: 1 })
    );
    expect(hasCanonical).toBe(true);
    expect(hasAliases).toBe(true);
  });

  it('findPendingByRawValue is backed by a {tenantId, kind, rawValue, status} index', () => {
    const has = TRANSPORT_COST_INDEXES.tblnormalizationreviewitems.some(
      (index) => JSON.stringify(index.key) === JSON.stringify({ tenantId: 1, kind: 1, rawValue: 1, status: 1 })
    );
    expect(has).toBe(true);
  });

  // ── Slice 3: Master Data Search + "+ Add New". ──────────────────────

  it('Customer normalizedName is a UNIQUE index per tenant -- the find-or-create duplicate-protection floor', () => {
    const uniqueIndex = TRANSPORT_COST_INDEXES.tblcustomers.find(
      (index) => index.name === 'uniq_customer_tenant_normalizedname'
    );
    expect(uniqueIndex).toBeDefined();
    expect((uniqueIndex as any).unique).toBe(true);
    expect(uniqueIndex!.key).toEqual({ tenantId: 1, normalizedName: 1 });
  });

  it('Destination normalizedName is a UNIQUE index per tenant -- the find-or-create duplicate-protection floor', () => {
    const uniqueIndex = TRANSPORT_COST_INDEXES.tbldestinations.find(
      (index) => index.name === 'uniq_destination_tenant_normalizedname'
    );
    expect(uniqueIndex).toBeDefined();
    expect((uniqueIndex as any).unique).toBe(true);
    expect(uniqueIndex!.key).toEqual({ tenantId: 1, normalizedName: 1 });
  });

  it('CustomerRepository.search / DestinationRepository.search are backed by {tenantId, active, name} indexes', () => {
    const hasCustomer = TRANSPORT_COST_INDEXES.tblcustomers.some(
      (index) => JSON.stringify(index.key) === JSON.stringify({ tenantId: 1, active: 1, name: 1 })
    );
    const hasDestination = TRANSPORT_COST_INDEXES.tbldestinations.some(
      (index) => JSON.stringify(index.key) === JSON.stringify({ tenantId: 1, active: 1, name: 1 })
    );
    expect(hasCustomer).toBe(true);
    expect(hasDestination).toBe(true);
  });
});

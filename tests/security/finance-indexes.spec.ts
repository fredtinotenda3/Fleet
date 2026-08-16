// tests/security/finance-indexes.spec.ts
//
// PHASE 0, ITEM 4: verifies the index definitions added for
// tblallocationledger, tbldepreciationprofiles, and tblglsubmissions
// (previously undefined anywhere in infrastructure/database/) are
// structurally sound and actually wired into the merged INDEXES export
// that infrastructure/database's index-provisioning step reads from.
//
// This does not (and, without a live Mongo instance, cannot) prove an
// EXPLAIN plan uses these indexes -- that is a runtime/integration
// concern outside this pass. What it does prove, statically:
//   1. every finance index is present in the merged INDEXES map that
//      ships to the database (a plausible bug: define an addendum but
//      forget to spread it in, which silently no-ops);
//   2. every index leads with `tenantId` (tenant isolation baseline --
//      no finance index can be satisfied by a cross-tenant scan);
//   3. every index name is globally unique (a duplicate name across
//      addendums would make one silently clobber the other in Mongo);
//   4. the two explicitly `unique: true` constraints elsewhere in this
//      file are undisturbed by this addendum (regression guard, since
//      FINANCE_INDEXES is merged by object spread and a key collision
//      would silently drop one collection's indexes).

import { INDEXES } from '../../infrastructure/database/indexes';
import { FINANCE_INDEXES } from '../../infrastructure/database/indexes.finance-addendum';

const FINANCE_COLLECTIONS = ['tblallocationledger', 'tbldepreciationprofiles', 'tblglsubmissions'] as const;

describe('Phase 0: finance collection indexes', () => {
  it('defines at least one index for each of the three previously-unindexed finance collections', () => {
    for (const collection of FINANCE_COLLECTIONS) {
      expect(FINANCE_INDEXES[collection]).toBeDefined();
      expect(FINANCE_INDEXES[collection].length).toBeGreaterThan(0);
    }
  });

  it('is actually merged into the exported INDEXES map (not defined but forgotten)', () => {
    for (const collection of FINANCE_COLLECTIONS) {
      expect((INDEXES as any)[collection]).toEqual(FINANCE_INDEXES[collection]);
    }
  });

  it('every finance index leads with tenantId -- no index can be satisfied without a tenant match', () => {
    for (const collection of FINANCE_COLLECTIONS) {
      for (const index of FINANCE_INDEXES[collection]) {
        const firstKey = Object.keys(index.key)[0];
        expect(firstKey).toBe('tenantId');
      }
    }
  });

  it('every finance index name is unique within the merged INDEXES map', () => {
    const financeNames = new Set<string>();
    for (const collection of FINANCE_COLLECTIONS) {
      for (const index of FINANCE_INDEXES[collection]) {
        financeNames.add(index.name);
      }
    }

    // Only asserts the FINANCE indexes introduced by this pass don't
    // collide with each other or with any pre-existing index name
    // elsewhere in the codebase -- not a general audit of every
    // index name in INDEXES (a pre-existing, out-of-scope duplicate
    // in an unrelated addendum is not this pass's concern; see the
    // Phase 0 report's "remaining gaps" section).
    const seenOutsideFinance: string[] = [];
    for (const collection of Object.keys(INDEXES) as Array<keyof typeof INDEXES>) {
      if ((FINANCE_COLLECTIONS as readonly string[]).includes(collection as string)) continue;
      for (const index of INDEXES[collection] as ReadonlyArray<{ name: string }>) {
        if (financeNames.has(index.name)) seenOutsideFinance.push(index.name);
      }
    }
    expect(seenOutsideFinance).toEqual([]);

    const withinFinance: string[] = [];
    for (const collection of FINANCE_COLLECTIONS) {
      const names = FINANCE_INDEXES[collection].map((i) => i.name);
      expect(new Set(names).size).toBe(names.length);
      withinFinance.push(...names);
    }
  });

  it('findByVehicleInScope / getNetTotalsByCategory are backed by a {tenantId, vehicleId, ...} index on tblallocationledger', () => {
    const hasVehicleIndex = FINANCE_INDEXES.tblallocationledger.some(
      (index) => Object.keys(index.key)[0] === 'tenantId' && Object.keys(index.key)[1] === 'vehicleId'
    );
    expect(hasVehicleIndex).toBe(true);
  });

  it('findReversalOf is backed by a {tenantId, reversalOfPostingId} index on tblallocationledger', () => {
    const hasReversalIndex = FINANCE_INDEXES.tblallocationledger.some(
      (index) => JSON.stringify(index.key) === JSON.stringify({ tenantId: 1, reversalOfPostingId: 1 })
    );
    expect(hasReversalIndex).toBe(true);
  });

  it('getNetTotalsByGlAccount is backed by a {tenantId, glAccountCode, ...} index on tblallocationledger', () => {
    const hasGlAccountIndex = FINANCE_INDEXES.tblallocationledger.some(
      (index) => Object.keys(index.key)[0] === 'tenantId' && Object.keys(index.key)[1] === 'glAccountCode'
    );
    expect(hasGlAccountIndex).toBe(true);
  });

  it('findByVehicleInScope is backed by a {tenantId, vehicleId, ...} index on tbldepreciationprofiles', () => {
    const hasVehicleIndex = FINANCE_INDEXES.tbldepreciationprofiles.some(
      (index) => Object.keys(index.key)[0] === 'tenantId' && Object.keys(index.key)[1] === 'vehicleId'
    );
    expect(hasVehicleIndex).toBe(true);
  });

  it('findInPeriodInScope is backed by a {tenantId, periodStart, ...} index on tblglsubmissions', () => {
    const hasPeriodIndex = FINANCE_INDEXES.tblglsubmissions.some(
      (index) => Object.keys(index.key)[0] === 'tenantId' && Object.keys(index.key)[1] === 'periodStart'
    );
    expect(hasPeriodIndex).toBe(true);
  });

  it('does not disturb the pre-existing unique attention/value-ledger index constraints', () => {
    const attentionUnique = (INDEXES as any).tblattentionitems.find(
      (i: any) => i.name === 'idx_attentionitem_tenant_itemkey'
    );
    const ledgerUnique = (INDEXES as any).tblvalueledger.find(
      (i: any) => i.name === 'idx_valueledger_tenant_itemkey'
    );
    expect(attentionUnique?.unique).toBe(true);
    expect(ledgerUnique?.unique).toBe(true);
  });
});

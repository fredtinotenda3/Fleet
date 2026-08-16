// tests/security/attention-item-backfill.spec.ts
//
// PHASE 0 -- Database/Migration Safety. Covers
// scripts/backfill-attention-item-ownership.ts's `reconstructTarget()`,
// the function that rebuilds an AttentionOwnerTarget from a PERSISTED
// AttentionItem row's stored `source`/`entityId`/`entityLabel` fields.
// This is the part of the migration that is meaningfully testable
// without a live MongoDB instance -- the rest (the scan-and-correct
// loop, the audit trail, --revert) is a thin driver around
// AttentionOwnershipResolver.resolveOrgUnitId(), already covered by
// tests/security/needs-attention-scope.spec.ts and the resolver's own
// tests.
//
// Importing the script module does NOT trigger a MongoDB connection --
// see the `if (require.main === module)` guard at its bottom.

import { reconstructTarget } from '../../scripts/backfill-attention-item-ownership';

describe('Phase 0 migration: reconstructTarget (attention-item backfill)', () => {
  it('predictive_maintenance: entityId is a vehicle Mongo _id', () => {
    expect(reconstructTarget({ source: 'predictive_maintenance', entityId: 'vehicle-1' })).toEqual({
      kind: 'vehicle',
      vehicleId: 'vehicle-1',
    });
  });

  it('fuel_fraud: entityId is a vehicle Mongo _id', () => {
    expect(reconstructTarget({ source: 'fuel_fraud', entityId: 'vehicle-2' })).toEqual({
      kind: 'vehicle',
      vehicleId: 'vehicle-2',
    });
  });

  it('driver_risk: entityId is an organization-member userId, not a tbldrivers row', () => {
    expect(reconstructTarget({ source: 'driver_risk', entityId: 'user-9' })).toEqual({
      kind: 'organization-member',
      userId: 'user-9',
    });
  });

  it('expense_anomaly: entityId is the expense record\'s own _id', () => {
    expect(reconstructTarget({ source: 'expense_anomaly', entityId: 'expense-1' })).toEqual({
      kind: 'expense',
      expenseId: 'expense-1',
    });
  });

  it('compliance: entityId could be a vehicle OR driver id (entityType was never persisted) -- reconstructed as vehicle-or-driver, never guessed', () => {
    expect(reconstructTarget({ source: 'compliance', entityId: 'entity-1' })).toEqual({
      kind: 'vehicle-or-driver',
      id: 'entity-1',
    });
  });

  it('maintenance: entityId was never persisted for this source -- reconstructed from entityLabel (license plate)', () => {
    expect(reconstructTarget({ source: 'maintenance', entityId: null, entityLabel: 'HRE1234' })).toEqual({
      kind: 'vehicle-by-plate',
      licensePlate: 'HRE1234',
    });
  });

  it('fleet_health: no single owning entity -- always reconstructs to none', () => {
    expect(reconstructTarget({ source: 'fleet_health', entityLabel: 'HRE1234, BYO5678' })).toEqual({
      kind: 'none',
    });
  });

  it('an unrecognised/future source value fails closed to none rather than guessing a kind', () => {
    expect(reconstructTarget({ source: 'some_future_source' })).toEqual({ kind: 'none' });
  });

  it('a missing entityId on a vehicle-sourced item reconstructs to a target the resolver will itself fail closed on', () => {
    expect(reconstructTarget({ source: 'fuel_fraud', entityId: null })).toEqual({
      kind: 'vehicle',
      vehicleId: undefined,
    });
  });
});

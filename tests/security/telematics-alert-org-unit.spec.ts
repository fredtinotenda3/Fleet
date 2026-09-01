// tests/security/telematics-alert-org-unit.spec.ts
//
// BACKLOG ITEM 2 (audit finding N-3).
//
// THE DEFECT: `createAlert` wrote no `orgUnitId` while
// `getActiveAlertsInScope` filters on one, so the alert list was
// permanently empty for every org-unit-scoped role -- fail-closed, so
// never a leak, and invisible, because an empty list looks exactly like
// "no alerts".
//
// The suite asserts both halves that matter:
//   * a scoped caller now SEES their own unit's alerts (the function
//     that was lost), and
//   * still does NOT see another unit's (the isolation that must not be
//     traded away to restore it).
//
// The second is why the fix is not "drop the predicate".

import { FakeCollection } from '../helpers/fake-collection';

const mockVehicleRepository = {
  findById: jest.fn(),
};

jest.mock('@/modules/vehicles/repositories/vehicle.repository', () => ({
  vehicleRepository: mockVehicleRepository,
}));
jest.mock('@/infrastructure/monitoring/logger', () => ({
  monitoring: { logError: jest.fn(), logWarn: jest.fn(), logInfo: jest.fn(), logDebug: jest.fn() },
}));

import {
  resolveAlertOwnership,
  resetAlertOwnershipCache,
  OWNERSHIP_TTL_MS,
} from '@/modules/telematics/services/alert-ownership.resolver';
import { telematicsRepository } from '@/modules/telematics/repositories/telematics.repository';
import type { TelematicsAlert } from '@/modules/telematics/types/telematics.types';
import type { TenantContext } from '@/modules/tenancy/services/tenant-context.service';

const TENANT = 'willsgrove-farm-enterprises-9e80ed';
const HARARE = 'unit-harare';
const BULAWAYO = 'unit-bulawayo';

function context(accessibleOrgUnitIds: string[] | null): TenantContext {
  return {
    organizationId: TENANT,
    organizationName: 'Willsgrove',
    accessibleOrgUnitIds,
    assignedOrgUnitIds: accessibleOrgUnitIds ?? [],
    isPlatformScope: false,
  } as unknown as TenantContext;
}

function alert(message: string): TelematicsAlert {
  return {
    type: 'speeding',
    severity: 'high',
    message,
    timestamp: new Date('2026-08-01T10:00:00Z'),
  } as TelematicsAlert;
}

/** Installs a fake tbltelematics_alerts under the repository's private accessor. */
function installFakeAlertsCollection(): FakeCollection {
  const collection = new FakeCollection();
  (telematicsRepository as unknown as { alertsCollection: () => Promise<unknown> }).alertsCollection =
    async () => collection as unknown;
  return collection;
}

beforeEach(() => {
  jest.clearAllMocks();
  resetAlertOwnershipCache();
});

// ─────────────────────────────────────────────────────────────────────
describe('alert ownership resolution', () => {
  it('reads the org unit off the vehicle the alert is about', async () => {
    mockVehicleRepository.findById.mockResolvedValue({ _id: 'v-1', orgUnitId: BULAWAYO });

    const ownership = await resolveAlertOwnership('v-1', TENANT);

    expect(ownership).toEqual({ orgUnitId: BULAWAYO, resolution: 'vehicle' });
    expect(mockVehicleRepository.findById).toHaveBeenCalledWith('v-1', TENANT);
  });

  it('fails closed for a vehicle that has no org unit of its own', async () => {
    mockVehicleRepository.findById.mockResolvedValue({ _id: 'v-1' });

    const ownership = await resolveAlertOwnership('v-1', TENANT);

    // Unassigned means "we do not know who owns this", not "everyone".
    // Same rule assertVehicleInScope applies.
    expect(ownership.orgUnitId).toBeUndefined();
    expect(ownership.resolution).toBe('vehicle-unassigned');
  });

  it('fails closed for a vehicle that is not in this tenant', async () => {
    mockVehicleRepository.findById.mockResolvedValue(null);

    const ownership = await resolveAlertOwnership('v-other-tenant', TENANT);

    expect(ownership.orgUnitId).toBeUndefined();
    expect(ownership.resolution).toBe('vehicle-not-found');
  });

  it('never throws when the lookup fails -- the alert must still be recorded', async () => {
    mockVehicleRepository.findById.mockRejectedValue(new Error('connection reset'));

    const ownership = await resolveAlertOwnership('v-1', TENANT);

    expect(ownership.resolution).toBe('lookup-failed');
    expect(ownership.orgUnitId).toBeUndefined();
  });

  it('memoises per vehicle so a speeding vehicle does not query per fix', async () => {
    mockVehicleRepository.findById.mockResolvedValue({ _id: 'v-1', orgUnitId: HARARE });

    await resolveAlertOwnership('v-1', TENANT, 1_000);
    await resolveAlertOwnership('v-1', TENANT, 1_100);
    await resolveAlertOwnership('v-1', TENANT, 1_200);

    expect(mockVehicleRepository.findById).toHaveBeenCalledTimes(1);
  });

  it('re-reads once the memo expires, so a reassignment is picked up', async () => {
    mockVehicleRepository.findById.mockResolvedValue({ _id: 'v-1', orgUnitId: HARARE });
    await resolveAlertOwnership('v-1', TENANT, 1_000);

    mockVehicleRepository.findById.mockResolvedValue({ _id: 'v-1', orgUnitId: BULAWAYO });
    const after = await resolveAlertOwnership('v-1', TENANT, 1_000 + OWNERSHIP_TTL_MS + 1);

    expect(after.orgUnitId).toBe(BULAWAYO);
    expect(mockVehicleRepository.findById).toHaveBeenCalledTimes(2);
  });

  it('keys the memo by tenant, so the same vehicle id in two tenants cannot share an answer', async () => {
    mockVehicleRepository.findById.mockImplementation(async (_id: string, tenantId: string) => ({
      _id: 'v-1',
      orgUnitId: tenantId === TENANT ? HARARE : 'other-tenant-unit',
    }));

    const mine = await resolveAlertOwnership('v-1', TENANT, 1_000);
    const theirs = await resolveAlertOwnership('v-1', 'toyota-zimbabwe-63078f', 1_000);

    expect(mine.orgUnitId).toBe(HARARE);
    expect(theirs.orgUnitId).toBe('other-tenant-unit');
  });

  it('does not cache a failed lookup -- a blip must not pin the vehicle for 30s', async () => {
    mockVehicleRepository.findById.mockRejectedValueOnce(new Error('blip'));
    await resolveAlertOwnership('v-1', TENANT, 1_000);

    mockVehicleRepository.findById.mockResolvedValue({ _id: 'v-1', orgUnitId: HARARE });
    const second = await resolveAlertOwnership('v-1', TENANT, 1_001);

    expect(second.orgUnitId).toBe(HARARE);
  });
});

// ─────────────────────────────────────────────────────────────────────
describe('createAlert stores the resolved org unit', () => {
  it('writes orgUnitId onto the row', async () => {
    const collection = installFakeAlertsCollection();

    await telematicsRepository.createAlert('v-1', alert('speeding'), TENANT, {
      orgUnitId: HARARE,
      resolution: 'vehicle',
    });

    expect(collection.docs).toHaveLength(1);
    expect(collection.docs[0].orgUnitId).toBe(HARARE);
    expect(collection.docs[0].orgUnitResolution).toBe('vehicle');
  });

  it('leaves orgUnitId unset -- and records why -- when ownership is unresolvable', async () => {
    const collection = installFakeAlertsCollection();

    await telematicsRepository.createAlert('v-1', alert('speeding'), TENANT, {
      resolution: 'vehicle-unassigned',
    });

    // Invisible to scoped readers, which is the safe direction, but no
    // longer indistinguishable from a bug.
    expect(collection.docs[0].orgUnitId).toBeUndefined();
    expect(collection.docs[0].orgUnitResolution).toBe('vehicle-unassigned');
  });

  it('lets resolved ownership win over an orgUnitId carried on the alert object', async () => {
    const collection = installFakeAlertsCollection();

    const spoofed = { ...alert('speeding'), orgUnitId: BULAWAYO } as TelematicsAlert;
    await telematicsRepository.createAlert('v-1', spoofed, TENANT, {
      orgUnitId: HARARE,
      resolution: 'vehicle',
    });

    // Spread order: ownership is authoritative. Same rule as the scope
    // predicate being spread last in every scoped filter.
    expect(collection.docs[0].orgUnitId).toBe(HARARE);
  });
});

// ─────────────────────────────────────────────────────────────────────
describe('scoped reads see their own unit and no other', () => {
  async function seedTwoBranches(): Promise<FakeCollection> {
    const collection = installFakeAlertsCollection();

    mockVehicleRepository.findById.mockImplementation(async (vehicleId: string) => ({
      _id: vehicleId,
      orgUnitId: vehicleId === 'v-harare' ? HARARE : BULAWAYO,
    }));

    for (const vehicleId of ['v-harare', 'v-bulawayo']) {
      const ownership = await resolveAlertOwnership(vehicleId, TENANT);
      await telematicsRepository.createAlert(vehicleId, alert(`${vehicleId} speeding`), TENANT, ownership);
    }

    return collection;
  }

  it('a Harare-scoped caller sees the Harare alert -- the function the defect removed', async () => {
    await seedTwoBranches();

    const rows = await telematicsRepository.getActiveAlertsInScope('v-harare', context([HARARE]));

    // Before this fix this assertion returned [] no matter what was
    // stored, because every row lacked the field the predicate matches.
    expect(rows).toHaveLength(1);
    expect((rows[0] as TelematicsAlert).message).toContain('v-harare');
  });

  it('a Harare-scoped caller does NOT see the Bulawayo alert', async () => {
    await seedTwoBranches();

    const rows = await telematicsRepository.getActiveAlertsInScope('v-bulawayo', context([HARARE]));

    expect(rows).toHaveLength(0);
  });

  it('an org-wide caller sees both', async () => {
    await seedTwoBranches();

    const harare = await telematicsRepository.getActiveAlertsInScope('v-harare', context(null));
    const bulawayo = await telematicsRepository.getActiveAlertsInScope('v-bulawayo', context(null));

    expect(harare).toHaveLength(1);
    expect(bulawayo).toHaveLength(1);
  });

  it('an alert whose owner could not be resolved stays invisible to a scoped caller', async () => {
    installFakeAlertsCollection();
    mockVehicleRepository.findById.mockResolvedValue(null);

    const ownership = await resolveAlertOwnership('v-ghost', TENANT);
    await telematicsRepository.createAlert('v-ghost', alert('speeding'), TENANT, ownership);

    const scoped = await telematicsRepository.getActiveAlertsInScope('v-ghost', context([HARARE]));
    const orgWide = await telematicsRepository.getActiveAlertsInScope('v-ghost', context(null));

    // Fail closed: unknown ownership is not "shared with everyone".
    expect(scoped).toHaveLength(0);
    // But it is not lost either -- an org-wide reader can still find it,
    // and the backfill can repair it.
    expect(orgWide).toHaveLength(1);
  });
});

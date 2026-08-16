// tests/security/anomaly-ownership.spec.ts
//
// PHASE 0, ITEM 7 SPILLOVER: adversarial coverage for the write-time
// orgUnitId fix in AnomalyDetectionService.persistBatch() -- the same
// bug class as item 1 (AttentionItem ownership), found while writing
// up the Anomaly-vs-AttentionItem decision. See
// modules/intelligence/services/ANOMALY_VS_ATTENTIONITEM.md.
//
// Exercises the REAL AnomalyRepository (backed by FakeCollection) and
// the REAL VehicleIdentityResolver (backed by a second FakeCollection
// standing in for tblvehicles) -- not mocks of the resolution logic
// itself -- so this proves the actual persisted orgUnitId, not an
// assumption about what persistBatch() intends to do.

import { AnomalyDetectionService } from '../../modules/intelligence/services/anomaly-detection.service';
import { AnomalyRepository } from '../../modules/intelligence/repositories/anomaly.repository';
import { VehicleRepository } from '../../modules/vehicles/repositories/vehicle.repository';
import { FakeCollection } from '../helpers/fake-collection';

const TENANT = 'willsgrove-farm-enterprises-9e80ed';
const HARARE_BRANCH = 'branch-harare';
const BULAWAYO_BRANCH = 'branch-bulawayo';

const anomalyCollection = new FakeCollection();
const vehicleCollection = new FakeCollection();

class TestAnomalyRepository extends AnomalyRepository {
  protected async getCollection(): Promise<any> {
    return anomalyCollection as unknown as any;
  }
}

class TestVehicleRepository extends VehicleRepository {
  protected async getCollection(): Promise<any> {
    return vehicleCollection as unknown as any;
  }
}

const testAnomalyRepository = new TestAnomalyRepository();
const testVehicleRepository = new TestVehicleRepository();

// Swap the module-level singletons the service under test imports for
// our fake-collection-backed instances.
jest.mock('../../modules/intelligence/repositories/anomaly.repository', () => {
  const actual = jest.requireActual('../../modules/intelligence/repositories/anomaly.repository');
  return { ...actual, anomalyRepository: undefined };
});
jest.mock('../../modules/vehicles/repositories/vehicle.repository', () => {
  const actual = jest.requireActual('../../modules/vehicles/repositories/vehicle.repository');
  return { ...actual, vehicleRepository: undefined };
});

describe('Phase 0: Anomaly orgUnitId resolved at write time', () => {
  beforeEach(() => {
    anomalyCollection.docs = [];
    anomalyCollection.seenFilters = [];
    vehicleCollection.docs = [];
    vehicleCollection.seenFilters = [];

    (require('../../modules/intelligence/repositories/anomaly.repository') as any).anomalyRepository =
      testAnomalyRepository;
    (require('../../modules/vehicles/repositories/vehicle.repository') as any).vehicleRepository =
      testVehicleRepository;
  });

  function seedVehicles() {
    vehicleCollection.seed([
      {
        tenantId: TENANT,
        license_plate: 'HRE1234',
        orgUnitId: HARARE_BRANCH,
        isDeleted: false,
        status: 'active',
      },
      {
        tenantId: TENANT,
        license_plate: 'BYO5678',
        orgUnitId: BULAWAYO_BRANCH,
        isDeleted: false,
        status: 'active',
      },
      {
        tenantId: TENANT,
        license_plate: 'UNASSIGNED1',
        // No orgUnitId -- not yet backfilled to a branch.
        isDeleted: false,
        status: 'active',
      },
    ]);
  }

  function makeServiceWithDetections(detected: Array<{ licensePlate?: string }>) {
    const service = new AnomalyDetectionService();
    jest.spyOn(service, 'detectFuelAnomalies').mockResolvedValue(
      detected.map((d) => ({
        type: 'fuel' as const,
        severity: 'medium' as const,
        message: 'Unusual fuel consumption',
        data: {},
        recommendation: 'Investigate',
        licensePlate: d.licensePlate,
      }))
    );
    return service;
  }

  it("persists an anomaly for a Harare vehicle with orgUnitId = Harare, not the caller's active branch", async () => {
    seedVehicles();
    const service = makeServiceWithDetections([{ licensePlate: 'HRE1234' }]);

    await service.detectAndPersistFuelAnomalies(TENANT, 'user-1');

    expect(anomalyCollection.docs).toHaveLength(1);
    expect(anomalyCollection.docs[0].orgUnitId).toBe(HARARE_BRANCH);
  });

  it('persists a DIFFERENT orgUnitId per vehicle within the same detection batch', async () => {
    seedVehicles();
    const service = makeServiceWithDetections([
      { licensePlate: 'HRE1234' },
      { licensePlate: 'BYO5678' },
    ]);

    await service.detectAndPersistFuelAnomalies(TENANT, 'user-1');

    const harareDoc = anomalyCollection.docs.find((d) => d.licensePlate === 'HRE1234');
    const bulawayoDoc = anomalyCollection.docs.find((d) => d.licensePlate === 'BYO5678');

    expect(harareDoc?.orgUnitId).toBe(HARARE_BRANCH);
    expect(bulawayoDoc?.orgUnitId).toBe(BULAWAYO_BRANCH);
  });

  it('fails closed (orgUnitId undefined) when the vehicle has not been backfilled with its own orgUnitId', async () => {
    seedVehicles();
    const service = makeServiceWithDetections([{ licensePlate: 'UNASSIGNED1' }]);

    await service.detectAndPersistFuelAnomalies(TENANT, 'user-1');

    expect(anomalyCollection.docs).toHaveLength(1);
    expect(anomalyCollection.docs[0].orgUnitId).toBeUndefined();
  });

  it('fails closed (orgUnitId undefined) when the vehicle cannot be found at all -- never guesses', async () => {
    seedVehicles();
    const service = makeServiceWithDetections([{ licensePlate: 'DOES-NOT-EXIST' }]);

    await service.detectAndPersistFuelAnomalies(TENANT, 'user-1');

    expect(anomalyCollection.docs).toHaveLength(1);
    expect(anomalyCollection.docs[0].orgUnitId).toBeUndefined();
  });

  it('fails closed (orgUnitId undefined) on an ambiguous plate shared by two vehicles -- never picks one arbitrarily', async () => {
    vehicleCollection.seed([
      { tenantId: TENANT, license_plate: 'DUP123', orgUnitId: HARARE_BRANCH, isDeleted: false, status: 'active' },
      { tenantId: TENANT, license_plate: 'DUP123', orgUnitId: BULAWAYO_BRANCH, isDeleted: false, status: 'active' },
    ]);
    const service = makeServiceWithDetections([{ licensePlate: 'DUP123' }]);

    await service.detectAndPersistFuelAnomalies(TENANT, 'user-1');

    expect(anomalyCollection.docs).toHaveLength(1);
    expect(anomalyCollection.docs[0].orgUnitId).toBeUndefined();
  });

  it('never resolves a vehicle belonging to a different tenant', async () => {
    vehicleCollection.seed([
      {
        tenantId: 'a-different-tenant-abc123',
        license_plate: 'HRE1234',
        orgUnitId: HARARE_BRANCH,
        isDeleted: false,
        status: 'active',
      },
    ]);
    const service = makeServiceWithDetections([{ licensePlate: 'HRE1234' }]);

    await service.detectAndPersistFuelAnomalies(TENANT, 'user-1');

    expect(anomalyCollection.docs).toHaveLength(1);
    expect(anomalyCollection.docs[0].orgUnitId).toBeUndefined();
  });
});

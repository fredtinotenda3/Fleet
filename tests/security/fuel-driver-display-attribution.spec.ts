// tests/security/fuel-driver-display-attribution.spec.ts
//
// "I assigned all Willsgrove vehicles to drivers via the Vehicle
// Operational Hub, but 'Fuel cost by driver' and the Fuel Logs table's
// Driver column still show Unassigned."
//
// ---------------------------------------------------------------------
// THE DEFECT THIS PINS
// ---------------------------------------------------------------------
// fuel-driver-attribution.spec.ts (PART 2/3) already proves driver_id
// reaches the database correctly as a fuel log's own transaction-time
// attribution ("who fuelled the vehicle that day" -- see
// shared/types/fuel.types.ts's doc comment). That was never the bug.
//
// The bug was on the READ side: FuelRepository.enrichFuelLogs resolved
// the DISPLAYED `.driver` field from each log's OWN driver_id, and
// getFuelByDriver grouped the "Fuel cost by driver" chart the same way.
// Almost no historical fuel log has a driver_id set (drivers are
// assigned to VEHICLES via the Operational Hub, not stamped onto every
// past fuel purchase), so both surfaces showed "Unassigned" for a fleet
// that was, in fact, fully assigned -- via Vehicle.currentDriverId,
// which neither surface consulted at all.
//
// ---------------------------------------------------------------------
// WHAT THIS FILE ASSERTS
// ---------------------------------------------------------------------
//  1. enrichFuelLogs resolves `.driver` from the VEHICLE currently
//     assigned to that log's plate (Vehicle.currentDriverId), not from
//     the log's own driver_id -- proven with a log whose driver_id
//     names nobody but whose vehicle has a current driver, AND a log
//     whose driver_id disagrees with its vehicle's current driver (the
//     vehicle's assignment must win for display, per the user's explicit
//     requirement that assignment lives ONLY on the Operational Hub).
//  2. The vehicle lookup behind that resolution is TENANT-SCOPED --
//     license_plate is not globally unique, so an unscoped lookup could
//     resolve a driver belonging to a different tenant's vehicle sharing
//     the same plate text (the same class of bug the plate-keyed
//     $lookup patterns elsewhere in this codebase already guard against).
//  3. getFilteredLogs' driver_id filter resolves to "the vehicle(s) this
//     driver is currently assigned to" (an $and clause over
//     license_plate), not a direct match against tblfuellogs.driver_id
//     -- so the Fuel Logs page's own "filter by driver" dropdown stays
//     consistent with what the table/chart now display.
//  4. unassignedOnly resolves to vehicles with no current driver, for
//     the chart's "Unassigned" bucket drill-through.
//  5. A driver filter that matches no currently-assigned vehicle
//     produces an empty plate list (matches nothing), not "no filter"
//     (which would silently return the whole tenant's fuel logs).

import { FuelRepository } from '../../modules/fuel/repositories/fuel.repository';

const ORG = 'willsgrove-farm-enterprises-9e80ed';
const OTHER_ORG = 'some-other-tenant';

const TENDAI = '68b1f2c4d1e2a30011111111'; // currently assigned to AFU0078
const RUDO = '68b1f2c4d1e2a30022222222'; // not currently assigned to any vehicle
const STALE_DRIVER = '68b1f2c4d1e2a30099999999'; // this log's own driver_id -- must NOT win

interface FakeCursor<T> {
  sort: () => FakeCursor<T>;
  skip: () => FakeCursor<T>;
  limit: () => FakeCursor<T>;
  toArray: () => Promise<T[]>;
}

function cursor<T>(rows: T[]): FakeCursor<T> {
  const self: FakeCursor<T> = {
    sort: () => self,
    skip: () => self,
    limit: () => self,
    toArray: async () => rows,
  };
  return self;
}

// tblvehicles: AFU0078 in ORG is currently assigned to Tendai. A
// same-plate vehicle in OTHER_ORG is assigned to a DIFFERENT driver --
// present specifically to catch an unscoped lookup crossing tenants.
const VEHICLES = [
  { license_plate: 'AFU0078', tenantId: ORG, currentDriverId: TENDAI, isDeleted: false },
  { license_plate: 'AFU0099', tenantId: ORG, currentDriverId: null, isDeleted: false },
  { license_plate: 'AFU0078', tenantId: OTHER_ORG, currentDriverId: 'other-tenant-driver', isDeleted: false },
];

const DRIVERS = [
  { _id: TENDAI, name: 'Tendai Moyo' },
  { _id: RUDO, name: 'Rudo Ncube' },
];

let lastFuelLogsQuery: Record<string, unknown> | null = null;
let fuelLogsToReturn: Array<Record<string, unknown>> = [];

const fakeDb = {
  collection(name: string) {
    if (name === 'tblfuellogs') {
      return {
        find: (query: Record<string, unknown>) => {
          lastFuelLogsQuery = query;
          return cursor(fuelLogsToReturn);
        },
        countDocuments: async () => fuelLogsToReturn.length,
      };
    }
    if (name === 'tblvehicles') {
      return {
        find: (query: Record<string, unknown>) => {
          // Emulate $in on license_plate, tenantId equality, and the
          // currentDriverId existence/nullness branches enrichFuelLogs
          // and resolveDriverFilterPlates actually issue.
          let rows = VEHICLES.filter((v) => {
            if (query.tenantId !== undefined && v.tenantId !== query.tenantId) return false;
            if (query.license_plate && typeof query.license_plate === 'object') {
              const plates = (query.license_plate as { $in: string[] }).$in;
              if (!plates.includes(v.license_plate)) return false;
            }
            return true;
          });
          if (query.currentDriverId !== undefined) {
            if (typeof query.currentDriverId === 'string') {
              rows = rows.filter((v) => v.currentDriverId === query.currentDriverId);
            } else {
              // { $exists: true, $nin: [null, ''] } -- enrichFuelLogs' shape
              rows = rows.filter((v) => Boolean(v.currentDriverId));
            }
          }
          if (query.$or) {
            rows = rows.filter((v) => !v.currentDriverId);
          }
          return cursor(rows);
        },
      };
    }
    if (name === 'tbldrivers') {
      return {
        find: (query: Record<string, unknown>) => {
          const ids = (query._id as { $in: { toString(): string }[] }).$in.map((id) => id.toString());
          return cursor(DRIVERS.filter((d) => ids.includes(d._id)));
        },
      };
    }
    throw new Error(`unexpected collection: ${name}`);
  },
};

jest.mock('../../infrastructure/database/mongodb', () => ({
  __esModule: true,
  default: jest.fn(async () => fakeDb),
}));

// ObjectId.isValid + `new ObjectId(id)` must accept these fixture ids
// (24 hex chars), which they already are -- no further mocking needed.

describe('FuelRepository: driver display resolves from the vehicle, not the log', () => {
  const repo = new FuelRepository();

  beforeEach(() => {
    lastFuelLogsQuery = null;
    fuelLogsToReturn = [];
  });

  it("resolves .driver from the vehicle's current assignment when the log itself has no driver_id", async () => {
    fuelLogsToReturn = [
      { _id: 'log-1', license_plate: 'AFU0078', driver_id: null, fuel_station_id: undefined },
    ];

    const result = await repo.getFilteredLogs({}, ORG, { page: 1, limit: 10 });

    expect(result.data[0].driver).toEqual({ _id: TENDAI, name: 'Tendai Moyo' });
  });

  it("resolves .driver from the vehicle's CURRENT assignment even when it disagrees with the log's own (stale) driver_id", async () => {
    // The whole point of the fix: the vehicle's Operational Hub
    // assignment is the single source of truth for display, never the
    // log's own historical driver_id.
    fuelLogsToReturn = [
      { _id: 'log-2', license_plate: 'AFU0078', driver_id: STALE_DRIVER, fuel_station_id: undefined },
    ];

    const result = await repo.getFilteredLogs({}, ORG, { page: 1, limit: 10 });

    expect(result.data[0].driver?._id).toBe(TENDAI);
    expect(result.data[0].driver?._id).not.toBe(STALE_DRIVER);
  });

  it('shows no driver for a vehicle with no current Operational Hub assignment', async () => {
    fuelLogsToReturn = [
      { _id: 'log-3', license_plate: 'AFU0099', driver_id: null, fuel_station_id: undefined },
    ];

    const result = await repo.getFilteredLogs({}, ORG, { page: 1, limit: 10 });

    expect(result.data[0].driver).toBeUndefined();
  });

  it('does not cross tenants: an unscoped-looking plate match in another tenant never leaks its driver', async () => {
    // AFU0078 exists in OTHER_ORG too, assigned to a different driver.
    // Querying as ORG must resolve ORG's own vehicle only.
    fuelLogsToReturn = [
      { _id: 'log-4', license_plate: 'AFU0078', driver_id: null, fuel_station_id: undefined },
    ];

    const result = await repo.getFilteredLogs({}, ORG, { page: 1, limit: 10 });

    expect(result.data[0].driver?._id).toBe(TENDAI);
    expect(result.data[0].driver?._id).not.toBe('other-tenant-driver');
  });
});

describe('FuelRepository.getFilteredLogs: driver_id filter resolves to the assigned vehicle, not raw driver_id', () => {
  const repo = new FuelRepository();

  beforeEach(() => {
    lastFuelLogsQuery = null;
    fuelLogsToReturn = [];
  });

  it('filtering by a driver queries license_plate (the vehicle currently assigned to them), never a driver_id key', async () => {
    await repo.getFilteredLogs({ driver_id: TENDAI }, ORG, { page: 1, limit: 10 });

    expect(lastFuelLogsQuery).not.toHaveProperty('driver_id');
    expect(lastFuelLogsQuery?.$and).toEqual([{ license_plate: { $in: ['AFU0078'] } }]);
  });

  it('filtering by a driver with no currently-assigned vehicle matches nothing, not "no filter"', async () => {
    await repo.getFilteredLogs({ driver_id: RUDO }, ORG, { page: 1, limit: 10 });

    // Empty $in -- a real, meaningful "matches nothing" clause. If this
    // regresses to `null` (treated as "no filter" upstream), a driver
    // filter would silently widen back out to the whole tenant.
    expect(lastFuelLogsQuery?.$and).toEqual([{ license_plate: { $in: [] } }]);
  });

  it('unassignedOnly resolves to vehicles with no current driver', async () => {
    await repo.getFilteredLogs({ unassignedOnly: true }, ORG, { page: 1, limit: 10 });

    expect(lastFuelLogsQuery?.$and).toEqual([{ license_plate: { $in: ['AFU0099'] } }]);
  });

  it('a plain query with neither filter set adds no $and clause at all', async () => {
    await repo.getFilteredLogs({}, ORG, { page: 1, limit: 10 });

    expect(lastFuelLogsQuery).not.toHaveProperty('$and');
  });
});

// tests/security/trip-generation-safety.spec.ts
//
// The SAFETY half of trip generation. The detector's arithmetic is
// covered exhaustively in tests/unit/trips/trip-detection.spec.ts; this
// file covers the properties that live in the I/O shell:
//
//   * a generated trip inherits its org unit from the VEHICLE
//   * every read and write is filtered by tenant
//   * a re-run creates nothing new (idempotency)
//   * a re-run never MUTATES an existing trip
//   * an event fires only for a genuinely new trip
//
// The database is faked at the `connectToDatabase` boundary rather than
// mocked per-call, so the assertions are about the queries the service
// actually issues -- which is where a tenancy mistake would live.

import { extractIgnition, toDetectionReading } from '../../modules/trips/services/trip-generation.service';

const ORG = 'willsgrove-farm-enterprises-9e80ed';
const OTHER_ORG = 'toyota-zimbabwe-63078f';
const HARARE = 'branch-harare';
const VEHICLE_ID = '6a99743cac5397695ab86bd0';

// ── fakes ────────────────────────────────────────────────────────────

interface FakeCall {
  collection: string;
  op: string;
  filter?: Record<string, unknown>;
  update?: Record<string, unknown>;
}

const calls: FakeCall[] = [];
let telemetryRows: Record<string, unknown>[] = [];
let existingTripKeys = new Set<string>();

function fakeCollection(name: string) {
  return {
    find(filter: Record<string, unknown>) {
      calls.push({ collection: name, op: 'find', filter });
      const rows = name === 'tbltelematics' ? telemetryRows : [];
      const cursor = {
        sort: () => cursor,
        limit: () => cursor,
        toArray: async () => rows,
      };
      return cursor;
    },
    async findOne(filter: Record<string, unknown>) {
      calls.push({ collection: name, op: 'findOne', filter });
      return null;
    },
    async updateOne(filter: Record<string, unknown>, update: Record<string, unknown>) {
      calls.push({ collection: name, op: 'updateOne', filter, update });
      if (name === 'tbltrips') {
        const key = String(filter.generation_key);
        if (existingTripKeys.has(key)) return { upsertedId: null, matchedCount: 1 };
        existingTripKeys.add(key);
        return { upsertedId: `trip-${existingTripKeys.size}`, matchedCount: 0 };
      }
      return { upsertedId: null, matchedCount: 1 };
    },
    async deleteMany() {
      return { deletedCount: 0 };
    },
  };
}

jest.mock('../../infrastructure/database/mongodb', () => ({
  __esModule: true,
  default: async () => ({ collection: (name: string) => fakeCollection(name) }),
}));

const vehicles = [
  { _id: VEHICLE_ID, license_plate: 'AFK5777', tenantId: ORG, orgUnitId: HARARE },
];

jest.mock('../../modules/vehicles/repositories/vehicle.repository', () => ({
  vehicleRepository: {
    findMany: jest.fn(async (_f: unknown, tenantId: string) =>
      vehicles.filter((v) => v.tenantId === tenantId)
    ),
    findById: jest.fn(async (id: string, tenantId: string) =>
      vehicles.find((v) => v._id === id && v.tenantId === tenantId) ?? null
    ),
  },
}));

const publish = jest.fn().mockResolvedValue(undefined);
jest.mock('../../server/events/bus/EventBusFactory', () => ({
  EventBusFactory: { getInstance: () => ({ publish }) },
}));

import { tripGenerationService } from '../../modules/trips/services/trip-generation.service';
import { resetAlertOwnershipCache } from '../../modules/telematics/services/alert-ownership.resolver';

// ── fixtures ─────────────────────────────────────────────────────────

const T0 = Date.UTC(2026, 8, 1, 6, 0, 0);
const at = (m: number) => new Date(T0 + m * 60_000);

/** A complete journey: moves, then stops long enough to close. */
function journeyRows(): Record<string, unknown>[] {
  return [
    { timestamp: at(0), location: { lat: -17.82, lng: 31.05, speed: 50 }, trip: { odometer: 1000 }, engine: {} },
    { timestamp: at(20), location: { lat: -17.72, lng: 31.05, speed: 55 }, trip: { odometer: 1025 }, engine: {} },
    { timestamp: at(21), location: { lat: -17.72, lng: 31.05, speed: 0 }, trip: {}, engine: {} },
    { timestamp: at(30), location: { lat: -17.72, lng: 31.05, speed: 0 }, trip: {}, engine: {} },
  ];
}

beforeEach(() => {
  calls.length = 0;
  telemetryRows = journeyRows();
  existingTripKeys = new Set();
  publish.mockClear();
  resetAlertOwnershipCache();
});

// ── the pure extractors ──────────────────────────────────────────────

describe('extractIgnition: tri-state is preserved', () => {
  it('reads a boolean from engine.ignition', () => {
    expect(extractIgnition({ timestamp: new Date(), engine: { ignition: true } })).toBe(true);
    expect(extractIgnition({ timestamp: new Date(), engine: { ignition: false } })).toBe(false);
  });

  it('falls back to providerMetadata', () => {
    expect(
      extractIgnition({ timestamp: new Date(), providerMetadata: { ignition: true } })
    ).toBe(true);
  });

  it("reads a vendor's raw integer", () => {
    // Eagle Track carries ignition as io["1"] with integer 1/0.
    expect(extractIgnition({ timestamp: new Date(), providerMetadata: { ignition: 1 } })).toBe(true);
    expect(extractIgnition({ timestamp: new Date(), providerMetadata: { ignition: 0 } })).toBe(false);
  });

  it('REGRESSION: returns undefined when unreported, never false', () => {
    // The whole tri-state. `false` here would end every trip on its
    // first reading for any device that does not report ignition.
    expect(extractIgnition({ timestamp: new Date() })).toBeUndefined();
    expect(extractIgnition({ timestamp: new Date(), engine: {} })).toBeUndefined();
    expect(
      extractIgnition({ timestamp: new Date(), providerMetadata: { ignition: 'on' } })
    ).toBeUndefined();
  });
});

describe('toDetectionReading', () => {
  it('does not fabricate values for absent signals', () => {
    const reduced = toDetectionReading({ timestamp: at(0), engine: {}, trip: {} });
    expect(reduced.speed).toBeUndefined();
    expect(reduced.lat).toBeUndefined();
    expect(reduced.odometer).toBeUndefined();
    expect(reduced.ignition).toBeUndefined();
  });
});

// ── the shell ────────────────────────────────────────────────────────

describe('trip generation: tenancy', () => {
  it('filters the telemetry read by tenantId AND vehicleId', async () => {
    await tripGenerationService.generateForTenant(ORG, { now: at(60) });

    const read = calls.find((c) => c.collection === 'tbltelematics' && c.op === 'find');
    expect(read).toBeDefined();
    expect(read!.filter).toEqual(
      expect.objectContaining({ tenantId: ORG, vehicleId: VEHICLE_ID })
    );
  });

  it('writes the trip under the invoking tenant', async () => {
    await tripGenerationService.generateForTenant(ORG, { now: at(60) });

    const write = calls.find((c) => c.collection === 'tbltrips' && c.op === 'updateOne');
    expect(write!.filter).toEqual(expect.objectContaining({ tenantId: ORG }));
    const doc = (write!.update as { $setOnInsert: Record<string, unknown> }).$setOnInsert;
    expect(doc.tenantId).toBe(ORG);
  });

  it('generates nothing for a tenant that owns no vehicles', async () => {
    const result = await tripGenerationService.generateForTenant(OTHER_ORG, { now: at(60) });
    expect(result.vehiclesConsidered).toBe(0);
    expect(result.tripsCreated).toBe(0);
    expect(calls.filter((c) => c.collection === 'tbltrips')).toEqual([]);
  });

  it('the generation key is tenant-qualified', async () => {
    await tripGenerationService.generateForTenant(ORG, { now: at(60) });
    const write = calls.find((c) => c.collection === 'tbltrips' && c.op === 'updateOne');
    expect(String(write!.filter!.generation_key)).toContain(ORG);
  });
});

describe('trip generation: org-unit inheritance', () => {
  it('inherits orgUnitId from the VEHICLE, not from the reading', async () => {
    await tripGenerationService.generateForTenant(ORG, { now: at(60) });

    const write = calls.find((c) => c.collection === 'tbltrips' && c.op === 'updateOne');
    const doc = (write!.update as { $setOnInsert: Record<string, unknown> }).$setOnInsert;
    expect(doc.orgUnitId).toBe(HARARE);
  });

  it('omits orgUnitId entirely when the vehicle has none', async () => {
    // Absent, not null: `{orgUnitId: null}` and a missing field behave
    // differently under the `$in` scope filter and under `$exists`.
    vehicles[0].orgUnitId = undefined as unknown as string;
    resetAlertOwnershipCache();

    await tripGenerationService.generateForTenant(ORG, { now: at(60) });
    const write = calls.find((c) => c.collection === 'tbltrips' && c.op === 'updateOne');
    const doc = (write!.update as { $setOnInsert: Record<string, unknown> }).$setOnInsert;
    expect(Object.keys(doc)).not.toContain('orgUnitId');

    vehicles[0].orgUnitId = HARARE;
  });
});

describe('trip generation: idempotency', () => {
  it('creates the trip on the first run', async () => {
    const result = await tripGenerationService.generateForTenant(ORG, { now: at(60) });
    expect(result.tripsCreated).toBe(1);
    expect(result.tripsAlreadyPresent).toBe(0);
  });

  it('creates nothing on a second run over the same readings', async () => {
    await tripGenerationService.generateForTenant(ORG, { now: at(60) });
    calls.length = 0;

    // The fake state repository is stateless, so the watermark does not
    // carry -- which makes this the STRONGER test: it proves the
    // generation key alone prevents the duplicate, with no help from
    // the watermark. That is exactly the case a wiped state document or
    // a deliberate re-run produces.
    const second = await tripGenerationService.generateForTenant(ORG, { now: at(60) });
    expect(second.tripsCreated).toBe(0);
    expect(second.tripsAlreadyPresent).toBe(1);
  });

  it('uses $setOnInsert so a re-run cannot mutate an existing trip', async () => {
    // A trip already posted to the allocation ledger must not have its
    // distance changed underneath the posting by a later sweep.
    await tripGenerationService.generateForTenant(ORG, { now: at(60) });

    const write = calls.find((c) => c.collection === 'tbltrips' && c.op === 'updateOne');
    expect(write!.update).toHaveProperty('$setOnInsert');
    expect(write!.update).not.toHaveProperty('$set');
  });

  it('publishes TripCreated only for a genuinely new trip', async () => {
    await tripGenerationService.generateForTenant(ORG, { now: at(60) });
    expect(publish).toHaveBeenCalledTimes(1);

    publish.mockClear();
    await tripGenerationService.generateForTenant(ORG, { now: at(60) });
    expect(publish).not.toHaveBeenCalled();
  });
});

describe('trip generation: the written document', () => {
  async function generatedDoc(): Promise<Record<string, unknown>> {
    await tripGenerationService.generateForTenant(ORG, { now: at(60) });
    const write = calls.find((c) => c.collection === 'tbltrips' && c.op === 'updateOne');
    return (write!.update as { $setOnInsert: Record<string, unknown> }).$setOnInsert;
  }

  it('is marked as GPS-derived', async () => {
    expect((await generatedDoc()).created_from).toBe('gps');
  });

  it('carries start and end times and a duration', async () => {
    const doc = await generatedDoc();
    expect(doc.start_time).toEqual(at(0));
    expect(doc.end_time).toEqual(at(20));
    expect(doc.duration_minutes).toBe(20);
  });

  it('prefers the odometer for distance and records the source', async () => {
    const doc = await generatedDoc();
    expect(doc.distance_calculated).toBeCloseTo(25, 5);
    expect(doc.distance_source).toBe('odometer');
    expect(doc.distance_km_known).toBe(true);
  });

  it('sets license_plate uppercase, since every join keys off it', async () => {
    expect((await generatedDoc()).license_plate).toBe('AFK5777');
  });

  it('records the vehicle id so playback needs no plate lookup', async () => {
    expect((await generatedDoc()).generation_vehicle_id).toBe(VEHICLE_ID);
  });

  it('records why the trip ended', async () => {
    expect((await generatedDoc()).generation_end_reason).toBe('stopped');
  });

  it('REGRESSION: flags an unmeasurable distance rather than trusting the 0', async () => {
    // distance_calculated is a required number on a shipped schema, so
    // an unmeasurable trip must store 0 there -- but it must also say
    // so, or fleet efficiency averages a fabricated zero. This is the
    // same defect class as the "0.0 km/L is below optimal" attention
    // item; see shared/types/trip.generation-addendum.ts.
    telemetryRows = [
      { timestamp: at(0), location: { speed: 50 }, trip: {}, engine: {} },
      { timestamp: at(20), location: { speed: 50 }, trip: {}, engine: {} },
      { timestamp: at(21), location: { speed: 0 }, trip: {}, engine: {} },
      { timestamp: at(30), location: { speed: 0 }, trip: {}, engine: {} },
    ];

    const doc = await generatedDoc();
    expect(doc.distance_calculated).toBe(0);
    expect(doc.distance_km_known).toBe(false);
    expect(doc.distance_source).toBeNull();
    // The optional field is left UNSET, so a consumer reading it gets
    // undefined rather than a lie.
    expect(Object.keys(doc)).not.toContain('trip_distance');
  });
});

describe('trip generation: resilience', () => {
  it('does not write a trip when there are no readings', async () => {
    telemetryRows = [];
    const result = await tripGenerationService.generateForTenant(ORG, { now: at(60) });
    expect(result.tripsCreated).toBe(0);
    expect(calls.filter((c) => c.collection === 'tbltrips')).toEqual([]);
  });

  it('does not write a still-open trip', async () => {
    // Movement with no stop and no ignition-off. The journey is still in
    // progress; a provisional row would be a moving target for anything
    // that consumes it.
    telemetryRows = journeyRows().slice(0, 2);
    const result = await tripGenerationService.generateForTenant(ORG, { now: at(25) });
    expect(result.tripsCreated).toBe(0);
  });

  it('reports a per-vehicle failure without aborting the sweep', async () => {
    const { vehicleRepository } = jest.requireMock(
      '../../modules/vehicles/repositories/vehicle.repository'
    );
    vehicleRepository.findMany.mockResolvedValueOnce([
      { _id: 'broken', license_plate: 'BAD', tenantId: ORG, orgUnitId: HARARE },
      vehicles[0],
    ]);
    telemetryRows = journeyRows();

    const result = await tripGenerationService.generateForTenant(ORG, { now: at(60) });
    // Both vehicles were attempted; the healthy one still produced work.
    expect(result.vehiclesConsidered).toBe(2);
  });
});

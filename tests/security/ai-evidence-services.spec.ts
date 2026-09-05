// tests/security/ai-evidence-services.spec.ts
//
// BACKLOG ITEM 7, part two -- the three services whose evidence has to
// be proved through a full run rather than through one pure method.
//
// `ai-evidence-emission.spec.ts` covers the builder and the three
// services with an extractable pure step (fuel fraud, expense anomaly,
// intelligence anomalies). Predictive maintenance, fleet health and
// driver risk each read five or more repositories before they produce
// anything, so the only honest way to assert what they CITE is to feed
// them known rows and check the citations point back at those rows.
//
// That is the property that matters. "Evidence is non-empty" can be
// satisfied by a fabricated entry; "every reference is one of the ids I
// put in" cannot.

const rows = {
  vehicles: [] as Array<Record<string, unknown>>,
  maintenance: [] as Array<Record<string, unknown>>,
  expenses: [] as Array<Record<string, unknown>>,
  trips: [] as Array<Record<string, unknown>>,
  fuel: [] as Array<Record<string, unknown>>,
  telematics: [] as Array<Record<string, unknown>>,
  latestTelematics: null as Record<string, unknown> | null,
  members: [] as Array<Record<string, unknown>>,
  drivers: [] as Array<Record<string, unknown>>,
};

jest.mock('@/modules/vehicles/repositories/vehicle.repository', () => ({
  vehicleRepository: { findMany: jest.fn(async () => rows.vehicles) },
}));
jest.mock('@/modules/maintenance/repositories/maintenance.repository', () => ({
  maintenanceRepository: { findMany: jest.fn(async () => rows.maintenance) },
}));
jest.mock('@/modules/expenses/repositories/expense.repository', () => ({
  expenseRepository: { findMany: jest.fn(async () => rows.expenses) },
}));
jest.mock('@/modules/trips/repositories/trip.repository', () => ({
  tripRepository: { findMany: jest.fn(async () => rows.trips) },
}));
jest.mock('@/modules/fuel/repositories/fuel.repository', () => ({
  fuelRepository: { findMany: jest.fn(async () => rows.fuel) },
}));
jest.mock('@/modules/telematics/repositories/telematics.repository', () => ({
  telematicsRepository: {
    findMany: jest.fn(async () => rows.telematics),
    getLatestTelematicsData: jest.fn(async () => rows.latestTelematics),
  },
}));
jest.mock('@/server/tenancy/organization-resolver', () => ({
  resolveOrganization: jest.fn(async () => ({ members: rows.members })),
}));
jest.mock('@/modules/drivers/repositories/driver.repository', () => ({
  driverRepository: {
    findAll: jest.fn(async () => rows.drivers),
    findAllInScope: jest.fn(async () => rows.drivers),
  },
}));
jest.mock('@/infrastructure/monitoring/logger', () => ({
  monitoring: { logError: jest.fn(), logWarn: jest.fn(), logInfo: jest.fn(), logDebug: jest.fn() },
}));

import { predictiveMaintenanceService } from '@/modules/ai/services/predictive-maintenance.service';
import { fleetHealthService } from '@/modules/ai/services/fleet-health.service';
import { driverRiskService } from '@/modules/ai/services/driver-risk.service';
import type { AIEvidence } from '@/modules/ai/types/ai-evidence.types';

const TENANT = 'willsgrove-farm-enterprises-9e80ed';

function citations(evidence: AIEvidence[] | undefined, source: string): string[] {
  return (evidence ?? []).filter((e) => e.source === source).map((e) => e.reference);
}

/** Every entry names a collection and a fetchable id. */
function expectUsableEvidence(evidence: AIEvidence[] | undefined): void {
  expect(evidence).toBeDefined();
  expect(evidence!.length).toBeGreaterThan(0);
  for (const entry of evidence!) {
    expect(entry.source).toBeTruthy();
    expect(entry.reference).toBeTruthy();
    expect(['undefined', 'null', 'unknown', 'computed', '[object Object]']).not.toContain(
      entry.reference
    );
  }
}

beforeEach(() => {
  rows.vehicles = [];
  rows.maintenance = [];
  rows.expenses = [];
  rows.trips = [];
  rows.fuel = [];
  rows.telematics = [];
  rows.latestTelematics = null;
  rows.members = [];
  rows.drivers = [];
});

// ─────────────────────────────────────────────────────────────────────
describe('predictive maintenance', () => {
  beforeEach(() => {
    rows.vehicles = [
      {
        _id: 'vehicle-1',
        license_plate: 'ADY2531',
        make: 'Toyota',
        model: 'Hilux',
        year: 2015,
        odometer: 240_000,
        orgUnitId: 'unit-harare',
      },
    ];
    rows.maintenance = [
      { _id: 'rem-1', license_plate: 'ADY2531', title: 'Engine service', category: 'engine', status: 'completed', due_date: new Date(2025, 1, 1) },
      { _id: 'rem-2', license_plate: 'ADY2531', title: 'Brake pads', category: 'brakes', status: 'overdue', due_date: new Date(2026, 5, 1) },
    ];
    rows.trips = [
      { _id: 'trip-1', license_plate: 'ADY2531', date: new Date(2026, 6, 1), distance_calculated: 800 },
    ];
    rows.fuel = [
      { _id: 'fuel-1', license_plate: 'ADY2531', date: new Date(2026, 6, 1), fuel_volume: 70, cost: 900 },
    ];
    rows.latestTelematics = {
      _id: 'telemetry-1',
      vehicleId: 'vehicle-1',
      timestamp: new Date(2026, 7, 30),
      engine: { coolantTemp: 112, rpm: 4200 },
    };
  });

  it('emits evidence naming the maintenance history, the telemetry reading and the vehicle', async () => {
    const batch = await predictiveMaintenanceService.predictAll(TENANT);
    const prediction = batch.results.find((r) => r.success && r.data)?.data;

    expect(prediction).toBeDefined();
    expectUsableEvidence(prediction!.evidence);

    // Maintenance supplies every component's historical failure rate.
    expect(citations(prediction!.evidence, 'tblreminders').sort()).toEqual(['rem-1', 'rem-2']);
    // The latest reading's coolant temperature feeds the engine
    // assessment directly -- a single value that can flip a component.
    expect(citations(prediction!.evidence, 'tbltelematics')).toEqual(['telemetry-1']);
    // Odometer and age are inputs to every component.
    expect(citations(prediction!.evidence, 'tblvehicles')).toEqual(['vehicle-1']);
  });

  it('cites only rows it was actually given', async () => {
    const batch = await predictiveMaintenanceService.predictAll(TENANT);
    const prediction = batch.results.find((r) => r.success && r.data)?.data;

    const known = new Set([
      'vehicle-1',
      'rem-1',
      'rem-2',
      'trip-1',
      'telemetry-1',
    ]);
    for (const entry of prediction!.evidence!) {
      expect(known.has(entry.reference)).toBe(true);
    }
  });

  it('does not cite fuel logs, which reach the prediction only as a scalar', async () => {
    const batch = await predictiveMaintenanceService.predictAll(TENANT);
    const prediction = batch.results.find((r) => r.success && r.data)?.data;

    // avgFuelEfficiency is derived from every log, so citing twenty of
    // them would point a reader at rows that individually changed
    // nothing about the finding.
    expect(citations(prediction!.evidence, 'tblfuellogs')).toEqual([]);
  });
});

// ─────────────────────────────────────────────────────────────────────
describe('fleet health', () => {
  it('cites the vehicles scored and the maintenance behind the component scores', async () => {
    rows.vehicles = [
      { _id: 'vehicle-1', license_plate: 'ADY2531', year: 2015, odometer: 240_000 },
      { _id: 'vehicle-2', license_plate: 'AFU0078', year: 2020, odometer: 60_000 },
    ];
    rows.maintenance = [
      { _id: 'rem-1', license_plate: 'ADY2531', title: 'Brake pads', category: 'brakes', status: 'overdue', due_date: new Date(2026, 5, 1) },
    ];

    const result = await fleetHealthService.calculateHealthScore(TENANT);

    expect(result.success).toBe(true);
    expectUsableEvidence(result.data!.evidence);
    expect(citations(result.data!.evidence, 'tblvehicles').sort()).toEqual(['vehicle-1', 'vehicle-2']);
    expect(citations(result.data!.evidence, 'tblreminders')).toEqual(['rem-1']);
  });

  it('omits evidence entirely for an empty fleet, rather than shipping an empty array', async () => {
    const result = await fleetHealthService.calculateHealthScore(TENANT);

    expect(result.success).toBe(true);
    // An empty array reads as "we checked and found nothing to cite".
    // Absent says "there was nothing to look at", which is the truth
    // for a tenant with no vehicles.
    expect(result.data!.evidence).toBeUndefined();
  });
});

// ─────────────────────────────────────────────────────────────────────
// ─────────────────────────────────────────────────────────────────────
// FIX (driver-risk roster): driverRiskService now sources its driver
// roster from driverRepository (real tbldrivers records), not
// organization.members -- see driver-risk.service.ts and
// tests/security/driver-risk-scope.spec.ts. This block's fixture and
// mock were updated to match; the resolveOrganization/`members` mock
// above is still used by the fleet-health and predictive-maintenance
// blocks elsewhere in this file.
describe('driver risk', () => {
  beforeEach(() => {
    rows.drivers = [
      { _id: 'user-1', name: 'T. Moyo', tenantId: TENANT, status: 'active', orgUnitId: 'unit-harare' },
    ];
    rows.trips = [
      { _id: 'trip-1', license_plate: 'ADY2531', driver_id: 'user-1', date: new Date(2026, 7, 20), distance_calculated: 400, trip_duration: 9 },
      { _id: 'trip-2', license_plate: 'ADY2531', driver_id: 'user-1', date: new Date(2026, 7, 22), distance_calculated: 300, trip_duration: 7 },
    ];
    rows.telematics = [
      { _id: 'telemetry-1', vehicleId: 'v1', license_plate: 'ADY2531', timestamp: new Date(2026, 7, 20), location: { speed: 145, lat: -17.8, lng: 31.0 }, alerts: [] },
      { _id: 'telemetry-2', vehicleId: 'v1', license_plate: 'ADY2531', timestamp: new Date(2026, 7, 21), location: { speed: 60, lat: -17.8, lng: 31.0 }, alerts: [{ type: 'hard_brake', timestamp: new Date(2026, 7, 21) }] },
    ];
  });

  it('cites the telemetry readings and trips a risk score was computed from', async () => {
    const batch = await driverRiskService.calculateDriverRisk(TENANT);
    const score = batch.results.find((r) => r.success && r.data)?.data;

    expect(score).toBeDefined();
    expectUsableEvidence(score!.evidence);

    // The speeding / hard-brake counts in `metrics` come entirely from
    // these readings, so they are the rows a driver disputing this
    // score needs to see.
    expect(citations(score!.evidence, 'tbltelematics').sort()).toEqual([
      'telemetry-1',
      'telemetry-2',
    ]);
    expect(citations(score!.evidence, 'tbltrips').sort()).toEqual(['trip-1', 'trip-2']);
  });

  it('orders telemetry citations newest first, so the sample is reproducible', async () => {
    const batch = await driverRiskService.calculateDriverRisk(TENANT);
    const score = batch.results.find((r) => r.success && r.data)?.data;

    expect(citations(score!.evidence, 'tbltelematics')[0]).toBe('telemetry-2');
  });

  it('omits evidence for a driver with no trips and no telemetry', async () => {
    rows.trips = [];
    rows.telematics = [];

    const batch = await driverRiskService.calculateDriverRisk(TENANT);
    const score = batch.results.find((r) => r.success && r.data)?.data;

    // A default-safe score with nothing behind it. Omitted, so "scored
    // on no data" is visible rather than looking audited.
    expect(score!.evidence).toBeUndefined();
  });
});

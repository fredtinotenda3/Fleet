// tests/unit/telematics/cartrack-adapter-absent-vs-zero.spec.ts
//
// PHASE 1, F-2 regression suite.
//
// There were NO Cartrack adapter tests at all before this file, which is
// precisely why F-2 survived a type widening explicitly designed to
// prevent it: telematics.types.ts was widened to make measurement fields
// optional, the Eagle Track adapter was updated to use the widening, and
// the Cartrack adapter was not. Nothing failed, because nothing looked.
//
// The suite asserts on what the adapter HANDS TO
// telematicsService.ingestTelematicsData -- the canonical payload -- so
// it is testing the mapping contract rather than the wire format.

const mockIngest = jest.fn();
const mockFindByPlate = jest.fn();
const mockGetDevice = jest.fn();
const mockRegisterDevice = jest.fn();
const mockUpdateLastPing = jest.fn();
const mockGetResolvedConfig = jest.fn();
const mockRecordSyncResult = jest.fn();

jest.mock('@/modules/telematics/services/telematics.service', () => ({
  telematicsService: { ingestTelematicsData: mockIngest },
}));
jest.mock('@/modules/vehicles/repositories/vehicle.repository', () => ({
  vehicleRepository: { findByLicensePlate: mockFindByPlate },
}));
jest.mock('@/modules/telematics/repositories/telematics.repository', () => ({
  telematicsRepository: {
    getDevice: mockGetDevice,
    registerDevice: mockRegisterDevice,
    updateDeviceLastPing: mockUpdateLastPing,
  },
}));
jest.mock('@/modules/telematics/repositories/cartrack-config.repository', () => ({
  cartrackConfigRepository: {
    getResolvedConfig: mockGetResolvedConfig,
    recordSyncResult: mockRecordSyncResult,
  },
}));
jest.mock('@/infrastructure/monitoring/logger', () => ({
  monitoring: { logError: jest.fn(), logWarn: jest.fn(), logInfo: jest.fn() },
}));

const mockFetchStatuses = jest.fn();
jest.mock('@/modules/telematics/adapters/cartrack/cartrack-api.client', () => ({
  CartrackApiClient: jest.fn().mockImplementation(() => ({
    getFleetStatus: mockFetchStatuses,
    verifyCredentials: jest.fn(),
  })),
}));

import { cartrackAdapter } from '@/modules/telematics/adapters/cartrack/cartrack.adapter';
import { CartrackVehicleStatus } from '@/modules/telematics/adapters/cartrack/cartrack.types';
import { deriveReadingAlerts } from '@/modules/telematics/services/reading-alerts';

const TENANT = 'tenant-a';

/** A Cartrack payload carrying ONLY the fields Cartrack always supplies. */
function minimalStatus(overrides: Partial<CartrackVehicleStatus> = {}): CartrackVehicleStatus {
  return {
    terminal_serial: 'CT-0001',
    registration: 'ADY2531',
    position: {
      latitude: -17.82,
      longitude: 31.05,
      speed: 54,
      heading: 91,
      position_date: '2026-08-20T09:15:00.000Z',
    },
    ignition_on: true,
    ...overrides,
  };
}

/** Runs one status through the adapter and returns the canonical payload it ingested. */
async function ingestedPayloadFor(status: CartrackVehicleStatus) {
  mockGetResolvedConfig.mockResolvedValue({
    enabled: true,
    baseUrl: 'https://example.invalid',
    accountId: 'acct',
    apiKey: 'key',
    apiSecret: 'secret',
  });
  mockFetchStatuses.mockResolvedValue([status]);
  mockFindByPlate.mockResolvedValue({ _id: 'vehicle-1', license_plate: status.registration });
  mockGetDevice.mockResolvedValue({ deviceId: 'cartrack-CT-0001', vehicleId: 'vehicle-1' });

  await cartrackAdapter.syncOrganization(TENANT);

  expect(mockIngest).toHaveBeenCalledTimes(1);
  return mockIngest.mock.calls[0][0];
}

describe('F-2: the Cartrack adapter never fabricates a measurement', () => {
  beforeEach(() => jest.clearAllMocks());

  describe('engine signals', () => {
    it('omits fuelLevel when Cartrack does not report it', async () => {
      // THE headline regression. `fuelLevel: 0` satisfies
      // deriveReadingAlerts' `< 10` branch, so every Cartrack vehicle
      // without a fuel sensor raised a HIGH-severity low-fuel alert plus
      // a fleet-manager notification ON EVERY POLL.
      const payload = await ingestedPayloadFor(minimalStatus());

      expect(payload.engine.fuelLevel).toBeUndefined();
      expect(payload.engine).not.toHaveProperty('fuelLevel');
    });

    it('preserves a reported fuel level, including a genuine 0', async () => {
      // Absent and zero are different facts. An actually-empty tank must
      // still raise the alert.
      const payload = await ingestedPayloadFor(
        minimalStatus({ fuel_level_percent: 0 })
      );
      expect(payload.engine.fuelLevel).toBe(0);
    });

    it('preserves an ordinary reported fuel level', async () => {
      const payload = await ingestedPayloadFor(
        minimalStatus({ fuel_level_percent: 62 })
      );
      expect(payload.engine.fuelLevel).toBe(62);
    });

    it('omits rpm, coolantTemp, throttlePosition and engineLoad entirely', async () => {
      // Cartrack's status payload has no engine telemetry beyond fuel.
      // These were all hardcoded to 0, which renders in the vehicle
      // detail panel as a stalled, frozen engine with a closed throttle.
      const payload = await ingestedPayloadFor(minimalStatus());

      expect(payload.engine.rpm).toBeUndefined();
      expect(payload.engine.coolantTemp).toBeUndefined();
      expect(payload.engine.throttlePosition).toBeUndefined();
      expect(payload.engine.engineLoad).toBeUndefined();
    });
  });

  describe('trip aggregates', () => {
    it('omits odometer when Cartrack does not report it', async () => {
      // `odometer: 0` did not merely display wrongly -- it WON over the
      // vehicle's own recorded odometer in digital-twin's fallback chain.
      const payload = await ingestedPayloadFor(minimalStatus());

      expect(payload.trip.odometer).toBeUndefined();
      expect(payload.trip).not.toHaveProperty('odometer');
    });

    it('preserves a reported odometer', async () => {
      const payload = await ingestedPayloadFor(minimalStatus({ odometer_km: 128_400 }));
      expect(payload.trip.odometer).toBe(128_400);
    });

    it('does NOT map instantaneous speed into averageSpeed or maxSpeed', async () => {
      // Cartrack's status payload is a point-in-time fix with no trip
      // aggregation. The old mapping set both to `position.speed`, so a
      // vehicle sampled at a red light reported a trip average of 0 and
      // one sampled while stationary reported a trip maximum of 0.
      const payload = await ingestedPayloadFor(minimalStatus({ position: {
        latitude: -17.82, longitude: 31.05, speed: 54, heading: 91,
        position_date: '2026-08-20T09:15:00.000Z',
      } }));

      expect(payload.trip.averageSpeed).toBeUndefined();
      expect(payload.trip.maxSpeed).toBeUndefined();
    });

    it('omits tripDistance, tripDuration and idleTime', async () => {
      // idleTime in particular was `ignition_on && speed === 0 ? 1 : 0`
      // -- a boolean state written into a field the rest of the codebase
      // reads as a DURATION, so the accumulated figure measured polling
      // frequency rather than time spent idling.
      const payload = await ingestedPayloadFor(
        minimalStatus({ ignition_on: true, position: {
          latitude: -17.82, longitude: 31.05, speed: 0, heading: 0,
          position_date: '2026-08-20T09:15:00.000Z',
        } })
      );

      expect(payload.trip.tripDistance).toBeUndefined();
      expect(payload.trip.tripDuration).toBeUndefined();
      expect(payload.trip.idleTime).toBeUndefined();
    });
  });

  describe('fuel-flow signals', () => {
    it('reports no fuel-flow signals at all', async () => {
      // Cartrack supplies none. All three were hardcoded to 0.
      const payload = await ingestedPayloadFor(minimalStatus());

      expect(payload.fuel.consumptionRate).toBeUndefined();
      expect(payload.fuel.instantConsumption).toBeUndefined();
      expect(payload.fuel.fuelUsed).toBeUndefined();
      expect(Object.keys(payload.fuel)).toHaveLength(0);
    });
  });

  describe('location', () => {
    it('preserves speed, including a genuine 0 for a stationary vehicle', async () => {
      const payload = await ingestedPayloadFor(
        minimalStatus({ position: {
          latitude: -17.82, longitude: 31.05, speed: 0, heading: 45,
          position_date: '2026-08-20T09:15:00.000Z',
        } })
      );
      expect(payload.location.speed).toBe(0);
    });

    it('omits altitude when absent and preserves it when present', async () => {
      const without = await ingestedPayloadFor(minimalStatus());
      expect(without.location.altitude).toBeUndefined();

      jest.clearAllMocks();

      const withAlt = await ingestedPayloadFor(
        minimalStatus({ position: {
          latitude: -17.82, longitude: 31.05, speed: 10, heading: 0, altitude: 1480,
          position_date: '2026-08-20T09:15:00.000Z',
        } })
      );
      expect(withAlt.location.altitude).toBe(1480);
    });

    it('never reports an accuracy, because Cartrack has no such field', async () => {
      // `accuracy: 0` does not read as "unknown" -- it reads as a
      // PERFECT fix, the most precise value the field can express.
      const payload = await ingestedPayloadFor(minimalStatus());
      expect(payload.location.accuracy).toBeUndefined();
    });
  });

  describe('the whole payload', () => {
    it('contains no zero-valued measurement for a minimal Cartrack status', async () => {
      // The generalisation: with the exception of genuinely-reported
      // values, nothing in a minimal reading should be 0.
      const payload = await ingestedPayloadFor(minimalStatus());

      const zeros: string[] = [];
      for (const container of ['engine', 'trip', 'fuel'] as const) {
        for (const [k, v] of Object.entries(payload[container] ?? {})) {
          if (v === 0) zeros.push(`${container}.${k}`);
        }
      }
      expect(zeros).toEqual([]);
    });
  });
});

describe('F-2: the low-fuel alert no longer fires on an absent reading', () => {
  // The low-fuel alert is emitted with type 'maintenance' (there is no
  // dedicated 'low_fuel' member on the TelematicsAlert union), so these
  // match on the message rather than the type -- matching on type alone
  // would also catch a DTC alert and pass for the wrong reason.
  const lowFuelAlert = (alerts: Array<{ type: string; message: string; severity: string }>) =>
    alerts.find((a) => a.message.startsWith('Low fuel level'));

  it('raises NO alert when fuelLevel is absent', () => {
    // This is the behavioural consequence that made F-2 a credibility
    // problem rather than a cosmetic one, asserted against the real
    // shared threshold logic rather than a copy of it.
    const alerts = deriveReadingAlerts({
      timestamp: new Date(),
      location: { lat: -17.8, lng: 31.0, speed: 40, timestamp: new Date() },
      engine: {},
    });

    expect(lowFuelAlert(alerts)).toBeUndefined();
  });

  it('still raises the alert on a genuine low reading', () => {
    const alerts = deriveReadingAlerts({
      timestamp: new Date(),
      location: { lat: -17.8, lng: 31.0, speed: 40, timestamp: new Date() },
      engine: { fuelLevel: 4 },
    });

    expect(lowFuelAlert(alerts)).toBeDefined();
    expect(lowFuelAlert(alerts)?.severity).toBe('high');
  });

  it('raises the alert on a genuine ZERO reading -- an empty tank is real', () => {
    const alerts = deriveReadingAlerts({
      timestamp: new Date(),
      location: { lat: -17.8, lng: 31.0, speed: 0, timestamp: new Date() },
      engine: { fuelLevel: 0 },
    });

    expect(lowFuelAlert(alerts)).toBeDefined();
  });
});

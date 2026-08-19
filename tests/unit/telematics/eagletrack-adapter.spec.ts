// tests/unit/telematics/eagletrack-adapter.spec.ts
//
// Two halves:
//
//   1. The PURE mapper (mapStatusToTelematicsData and its helpers),
//      tested directly against the vendor's own published sample
//      payload. No mocks needed -- that is the reason the mapping was
//      factored out of the adapter class.
//   2. syncOrganization's accounting, with the repositories/service
//      mocked. The property under test is that every tracker the sync
//      sees is accounted for in exactly one bucket -- nothing is
//      silently dropped, and nothing is silently guessed.

import {
  hasUsableFix,
  mapStatusToTelematicsData,
  parseEagleTrackDate,
  plateFromTracker,
  eagletrackDeviceIdFor,
} from '../../../modules/telematics/adapters/eagletrack/eagletrack.adapter';
import { EAGLETRACK_IO } from '../../../modules/telematics/adapters/eagletrack/eagletrack-io.map';
import type {
  EagleTrackTracker,
  EagleTrackTrackerStatus,
} from '../../../modules/telematics/adapters/eagletrack/eagletrack.types';

/** The vendor's own `last` sample, verbatim from the API V2 documentation. */
const VENDOR_SAMPLE: EagleTrackTrackerStatus = {
  signalex: 'f98',
  signal: 1,
  lat: 22.556045,
  lng: 113.937238,
  date: '2020-04-29 17:57:14',
  offline: false,
  speed: 29.97,
  bearing: 229,
  io: { '40': 0, '32': 0, '33': 0, '34': 0, '35': 1, '56': 0, '7': 0.82, '1': 1 },
  id: 119888,
  uin: '9171892960',
  alert: { cmd: 0, trigger: 0 },
  sensors: [],
  odometer: 0.82,
};

const CONTEXT = {
  tenantId: 'willsgrove-farm-enterprises-9e80ed',
  vehicleId: '507f1f77bcf86cd799439011',
  deviceId: 'eagletrack-9171892960',
};

describe('parseEagleTrackDate', () => {
  it('parses the vendor format as UTC, NOT as server-local time', () => {
    // The vendor sends no offset. Parsing as server-local would make the
    // same payload produce different timestamps on different machines.
    const parsed = parseEagleTrackDate('2020-04-29 17:57:14');
    expect(parsed?.toISOString()).toBe('2020-04-29T17:57:14.000Z');
  });

  it('respects an explicit offset when the vendor does supply one', () => {
    expect(parseEagleTrackDate('2020-04-29T17:57:14Z')?.toISOString()).toBe('2020-04-29T17:57:14.000Z');
    expect(parseEagleTrackDate('2020-04-29T17:57:14+02:00')?.toISOString()).toBe('2020-04-29T15:57:14.000Z');
  });

  it('returns null rather than an Invalid Date, which would poison every range query on the collection', () => {
    expect(parseEagleTrackDate('not a date')).toBeNull();
    expect(parseEagleTrackDate('')).toBeNull();
    expect(parseEagleTrackDate(undefined)).toBeNull();
  });

  it('rejects a zero-date sentinel instead of rolling it over into 1899', () => {
    // Date.UTC silently corrects out-of-range components, so
    // "0000-00-00" becomes 1899-11-30. Stored, that is a permanent
    // outlier at the head of every history query and it makes the
    // staleness guard treat every later fix as newer.
    expect(parseEagleTrackDate('0000-00-00 00:00:00')).toBeNull();
  });

  it('rejects a calendar-invalid date instead of rolling it into the next month', () => {
    expect(parseEagleTrackDate('2026-02-30 12:00:00')).toBeNull();
    expect(parseEagleTrackDate('2026-13-01 12:00:00')).toBeNull();
    expect(parseEagleTrackDate('2026-04-31 12:00:00')).toBeNull();
    expect(parseEagleTrackDate('2026-04-01 25:00:00')).toBeNull();
  });

  it('still accepts genuine boundary values', () => {
    expect(parseEagleTrackDate('2024-02-29 00:00:00')?.toISOString()).toBe('2024-02-29T00:00:00.000Z');
    expect(parseEagleTrackDate('2026-12-31 23:59:59')?.toISOString()).toBe('2026-12-31T23:59:59.000Z');
    // Seconds are optional in the vendor format.
    expect(parseEagleTrackDate('2026-08-18 08:00')?.toISOString()).toBe('2026-08-18T08:00:00.000Z');
  });
});

describe('hasUsableFix', () => {
  it('accepts a real fix', () => {
    expect(hasUsableFix(VENDOR_SAMPLE)).toBe(true);
  });

  it('rejects exact (0,0) -- a tracker with no satellite lock, not a vehicle in the Gulf of Guinea', () => {
    expect(hasUsableFix({ ...VENDOR_SAMPLE, lat: 0, lng: 0 })).toBe(false);
  });

  it('accepts a genuine zero on ONE axis (the equator and the prime meridian both exist)', () => {
    expect(hasUsableFix({ ...VENDOR_SAMPLE, lat: 0 })).toBe(true);
    expect(hasUsableFix({ ...VENDOR_SAMPLE, lng: 0 })).toBe(true);
  });

  it('rejects missing, non-numeric and out-of-range coordinates', () => {
    expect(hasUsableFix({ ...VENDOR_SAMPLE, lat: undefined })).toBe(false);
    expect(hasUsableFix({ ...VENDOR_SAMPLE, lat: 'x' as unknown as number })).toBe(false);
    expect(hasUsableFix({ ...VENDOR_SAMPLE, lat: 91 })).toBe(false);
    expect(hasUsableFix({ ...VENDOR_SAMPLE, lng: -181 })).toBe(false);
    expect(hasUsableFix({ ...VENDOR_SAMPLE, lat: NaN })).toBe(false);
  });
});

describe('plateFromTracker', () => {
  it('uses __platenumber when it is present and non-empty', () => {
    expect(plateFromTracker({ uin: '1', __platenumber: 'ABC 123' })).toBe('ABC 123');
    expect(plateFromTracker({ uin: '1', __platenumber: '  ABC 123  ' })).toBe('ABC 123');
  });

  it('returns null rather than falling back to `name` -- no fuzzy matching, by design', () => {
    // "BEV 664" looks like a plate. Guessing would attribute another
    // vehicle's GPS trace, odometer and alerts to this one.
    expect(plateFromTracker({ uin: '1', name: 'BEV 664' })).toBeNull();
    expect(plateFromTracker({ uin: '1', name: 'PT201B abc long long title name' })).toBeNull();
    expect(plateFromTracker({ uin: '1', __platenumber: '' })).toBeNull();
    expect(plateFromTracker({ uin: '1', __platenumber: '   ' })).toBeNull();
    expect(plateFromTracker(undefined)).toBeNull();
  });
});

describe('mapStatusToTelematicsData', () => {
  it('maps the vendor sample payload onto our shape', () => {
    const mapped = mapStatusToTelematicsData(VENDOR_SAMPLE, CONTEXT);
    expect(mapped).not.toBeNull();

    const { payload } = mapped!;
    expect(payload.deviceId).toBe('eagletrack-9171892960');
    expect(payload.vehicleId).toBe(CONTEXT.vehicleId);
    expect(payload.tenantId).toBe(CONTEXT.tenantId);
    expect(payload.location).toMatchObject({
      lat: 22.556045,
      lng: 113.937238,
      speed: 29.97,
      heading: 229, // vendor calls this `bearing`
    });
    expect(payload.timestamp.toISOString()).toBe('2020-04-29T17:57:14.000Z');
    // io["7"] is the only odometer code in the sample.
    expect(payload.trip.odometer).toBe(0.82);
  });

  it('OMITS engine.fuelLevel when no fuel percentage is reported, instead of writing 0', () => {
    // A 0 here means telematics.service.ts raises a high-severity
    // "Low fuel level: 0%" alert AND notifies fleet managers on every
    // single poll, for every vehicle without fuel telemetry.
    const mapped = mapStatusToTelematicsData(VENDOR_SAMPLE, CONTEXT);
    expect(mapped!.payload.engine.fuelLevel).toBeUndefined();
    expect('fuelLevel' in mapped!.payload.engine).toBe(false);
  });

  it('sets engine.fuelLevel from a reported percentage, preferring the CAN code', () => {
    const status = {
      ...VENDOR_SAMPLE,
      io: { ...VENDOR_SAMPLE.io, [EAGLETRACK_IO.FUEL_LEVEL_PERCENT]: 40, [EAGLETRACK_IO.CAN_FUEL_LEVEL_PERCENT]: 55 },
    };
    const mapped = mapStatusToTelematicsData(status, CONTEXT);
    expect(mapped!.payload.engine.fuelLevel).toBe(55);
    expect(mapped!.payload.providerMetadata?.fuelPercentSourceCode).toBe(EAGLETRACK_IO.CAN_FUEL_LEVEL_PERCENT);
  });

  it('never writes litres into the percentage field, recording them in metadata instead', () => {
    const status = { ...VENDOR_SAMPLE, io: { ...VENDOR_SAMPLE.io, [EAGLETRACK_IO.FUEL_LEVEL_L_1]: 8 } };
    const mapped = mapStatusToTelematicsData(status, CONTEXT);

    expect(mapped!.payload.engine.fuelLevel).toBeUndefined();
    expect(mapped!.payload.providerMetadata?.fuelLevelLitres).toBe(8);
  });

  it('prefers the CAN odometer and records WHICH code it used, so a scale jump is diagnosable', () => {
    const status = {
      ...VENDOR_SAMPLE,
      io: { ...VENDOR_SAMPLE.io, [EAGLETRACK_IO.CAN_ODOMETER]: 152_340 },
    };
    const mapped = mapStatusToTelematicsData(status, CONTEXT);

    expect(mapped!.payload.trip.odometer).toBe(152_340);
    expect(mapped!.payload.providerMetadata?.odometerSourceCode).toBe(EAGLETRACK_IO.CAN_ODOMETER);
  });

  it('derives idleTime from ignition-on plus zero speed, matching the Cartrack convention', () => {
    const idling = { ...VENDOR_SAMPLE, speed: 0, io: { ...VENDOR_SAMPLE.io, [EAGLETRACK_IO.IGNITION]: 1 } };
    const moving = { ...VENDOR_SAMPLE, speed: 30, io: { ...VENDOR_SAMPLE.io, [EAGLETRACK_IO.IGNITION]: 1 } };
    const ignitionOff = { ...VENDOR_SAMPLE, speed: 0, io: { ...VENDOR_SAMPLE.io, [EAGLETRACK_IO.IGNITION]: 0 } };
    const notReported = { ...VENDOR_SAMPLE, speed: 0, io: { '35': 1 } };

    expect(mapStatusToTelematicsData(idling, CONTEXT)!.payload.trip.idleTime).toBe(1);
    expect(mapStatusToTelematicsData(moving, CONTEXT)!.payload.trip.idleTime).toBe(0);
    expect(mapStatusToTelematicsData(ignitionOff, CONTEXT)!.payload.trip.idleTime).toBe(0);
    // Not reported must not be claimed as idle.
    expect(mapStatusToTelematicsData(notReported, CONTEXT)!.payload.trip.idleTime).toBe(0);
  });

  it('records signalex and the raw date in provider metadata, not on any TelematicsData field', () => {
    const mapped = mapStatusToTelematicsData(VENDOR_SAMPLE, CONTEXT);
    const meta = mapped!.payload.providerMetadata!;

    expect(meta.source).toBe('eagletrack');
    expect(meta.uin).toBe('9171892960');
    expect(meta.signalQuality).toEqual({ batteryPercent: 100, gsmQuality: 19, gpsSatellites: 8 });
    // Kept so a confirmed timezone convention can be applied retroactively.
    expect(meta.rawDate).toBe('2020-04-29 17:57:14');
    expect(meta.offline).toBe(false);
  });

  it('records battery/power volts in metadata rather than forcing them into an unrelated numeric field', () => {
    const status = {
      ...VENDOR_SAMPLE,
      io: { ...VENDOR_SAMPLE.io, [EAGLETRACK_IO.BATTERY_VOLTS]: 4.1, [EAGLETRACK_IO.POWER_VOLTS]: 12.6 },
    };
    const mapped = mapStatusToTelematicsData(status, CONTEXT);

    expect(mapped!.payload.providerMetadata?.io).toEqual({ Battery: 4.1, Power: 12.6 });
    // coolantTemp must not have been hijacked to carry a voltage.
    expect(mapped!.payload.engine.coolantTemp).toBe(0);
  });

  it('returns null for an unparseable timestamp rather than stamping a stale fix as "now"', () => {
    expect(mapStatusToTelematicsData({ ...VENDOR_SAMPLE, date: 'garbage' }, CONTEXT)).toBeNull();
    expect(mapStatusToTelematicsData({ ...VENDOR_SAMPLE, date: undefined }, CONTEXT)).toBeNull();
  });
});

describe('eagletrackDeviceIdFor', () => {
  it('namespaces the device id by provider so two providers cannot collide on the same uin', () => {
    expect(eagletrackDeviceIdFor('9171892960')).toBe('eagletrack-9171892960');
  });
});

// ---------------------------------------------------------------------
// syncOrganization accounting
// ---------------------------------------------------------------------

jest.mock('../../../modules/telematics/repositories/eagletrack-config.repository', () => ({
  eagletrackConfigRepository: {
    getResolvedConfig: jest.fn(),
    recordSyncResult: jest.fn(),
  },
}));
jest.mock('../../../modules/vehicles/repositories/vehicle.repository', () => ({
  vehicleRepository: { findByLicensePlate: jest.fn() },
}));
jest.mock('../../../modules/telematics/services/telematics.service', () => ({
  telematicsService: { ingestTelematicsData: jest.fn() },
}));
jest.mock('../../../modules/telematics/repositories/telematics.repository', () => ({
  telematicsRepository: {
    getDevice: jest.fn(),
    registerDevice: jest.fn(),
    updateDeviceLastPing: jest.fn(),
  },
}));
jest.mock('../../../infrastructure/monitoring/logger', () => ({
  monitoring: { logError: jest.fn() },
}));

// Imported after the mocks so the adapter picks them up.
// eslint-disable-next-line @typescript-eslint/no-var-requires
const { EagleTrackAdapter } = require('../../../modules/telematics/adapters/eagletrack/eagletrack.adapter');
// eslint-disable-next-line @typescript-eslint/no-var-requires
const { eagletrackConfigRepository } = require('../../../modules/telematics/repositories/eagletrack-config.repository');
// eslint-disable-next-line @typescript-eslint/no-var-requires
const { vehicleRepository } = require('../../../modules/vehicles/repositories/vehicle.repository');
// eslint-disable-next-line @typescript-eslint/no-var-requires
const { telematicsService } = require('../../../modules/telematics/services/telematics.service');
// eslint-disable-next-line @typescript-eslint/no-var-requires
const { telematicsRepository } = require('../../../modules/telematics/repositories/telematics.repository');

const TENANT = 'willsgrove-farm-enterprises-9e80ed';

/** Installs a fake fetch that answers /api2/trackers and /api2/last from the supplied fixtures. */
function stubApi(roster: EagleTrackTracker[], last: Record<string, EagleTrackTrackerStatus>) {
  (global as unknown as { fetch: unknown }).fetch = jest.fn(async (url: unknown) => {
    const href = String(url);
    const body = href.includes('/api2/trackers')
      ? { error: 0, msg: '', data: roster }
      : { error: 0, msg: '', data: last };

    return { ok: true, status: 200, statusText: 'OK', json: async () => body, text: async () => '' };
  });
}

describe('EagleTrackAdapter.syncOrganization', () => {
  const originalFetch = global.fetch;

  beforeEach(() => {
    jest.clearAllMocks();
    eagletrackConfigRepository.getResolvedConfig.mockResolvedValue({
      tenantId: TENANT,
      enabled: true,
      domain: 'https://gps.example.com',
      token: 'secret-token-value',
    });
    telematicsRepository.getDevice.mockResolvedValue(null);
  });

  afterEach(() => {
    (global as unknown as { fetch: unknown }).fetch = originalFetch;
  });

  it('accounts for every tracker in exactly one bucket -- matched, unmatched, or without a fix', async () => {
    stubApi(
      [
        { uin: '1', __platenumber: 'ABC123' }, // matches a vehicle
        { uin: '2', __platenumber: 'NOPE99' }, // plate present, no vehicle
        { uin: '3', name: 'DashCam2' }, // no plate at all
        { uin: '4', __platenumber: 'XYZ111' }, // in the roster, no fix returned
      ],
      {
        '1': { uin: '1', lat: -17.8, lng: 31.05, date: '2026-08-18 08:00:00', speed: 40 },
        '2': { uin: '2', lat: -17.8, lng: 31.06, date: '2026-08-18 08:00:00' },
        '3': { uin: '3', lat: -17.8, lng: 31.07, date: '2026-08-18 08:00:00' },
      }
    );

    vehicleRepository.findByLicensePlate.mockImplementation(async (plate: string) =>
      plate === 'ABC123' ? { _id: 'veh-1', license_plate: 'ABC123' } : null
    );

    const result = await new EagleTrackAdapter().syncOrganization(TENANT);

    expect(result.matched).toBe(1);
    expect(result.unmatchedTrackers.sort()).toEqual(['2', '3']);
    expect(result.trackersWithoutFix).toEqual(['4']);
    expect(result.errors).toEqual([]);
    expect(telematicsService.ingestTelematicsData).toHaveBeenCalledTimes(1);
  });

  it('never auto-creates a vehicle for an unmatched tracker', async () => {
    stubApi([{ uin: '2', __platenumber: 'NOPE99' }], {
      '2': { uin: '2', lat: -17.8, lng: 31.05, date: '2026-08-18 08:00:00' },
    });
    vehicleRepository.findByLicensePlate.mockResolvedValue(null);

    const result = await new EagleTrackAdapter().syncOrganization(TENANT);

    expect(result.unmatchedTrackers).toEqual(['2']);
    expect(telematicsService.ingestTelematicsData).not.toHaveBeenCalled();
    expect(telematicsRepository.registerDevice).not.toHaveBeenCalled();
  });

  it('scopes the vehicle lookup to the calling tenant', async () => {
    stubApi([{ uin: '1', __platenumber: 'ABC123' }], {
      '1': { uin: '1', lat: -17.8, lng: 31.05, date: '2026-08-18 08:00:00' },
    });
    vehicleRepository.findByLicensePlate.mockResolvedValue({ _id: 'veh-1' });

    await new EagleTrackAdapter().syncOrganization(TENANT);

    expect(vehicleRepository.findByLicensePlate).toHaveBeenCalledWith('ABC123', TENANT);
  });

  it('skips a fix it has already stored, so repeated polling does not append duplicate points', async () => {
    // GET /api2/last returns the LAST KNOWN fix, so a parked vehicle
    // returns the identical snapshot on every 2-minute poll.
    stubApi([{ uin: '1', __platenumber: 'ABC123' }], {
      '1': { uin: '1', lat: -17.8, lng: 31.05, date: '2026-08-18 08:00:00' },
    });
    vehicleRepository.findByLicensePlate.mockResolvedValue({ _id: 'veh-1' });
    telematicsRepository.getDevice.mockResolvedValue({
      deviceId: 'eagletrack-1',
      lastPingAt: new Date('2026-08-18T08:00:00.000Z'),
    });

    const result = await new EagleTrackAdapter().syncOrganization(TENANT);

    expect(result.skippedStale).toBe(1);
    // Still counted as matched: the vehicle IS covered by the integration.
    expect(result.matched).toBe(1);
    expect(telematicsService.ingestTelematicsData).not.toHaveBeenCalled();
    // And a stale snapshot must not re-mark a dead device as active.
    expect(telematicsRepository.updateDeviceLastPing).not.toHaveBeenCalled();
  });

  it('ingests a fix that is newer than the stored one', async () => {
    stubApi([{ uin: '1', __platenumber: 'ABC123' }], {
      '1': { uin: '1', lat: -17.8, lng: 31.05, date: '2026-08-18 09:00:00' },
    });
    vehicleRepository.findByLicensePlate.mockResolvedValue({ _id: 'veh-1' });
    telematicsRepository.getDevice.mockResolvedValue({
      deviceId: 'eagletrack-1',
      lastPingAt: new Date('2026-08-18T08:00:00.000Z'),
    });

    const result = await new EagleTrackAdapter().syncOrganization(TENANT);

    expect(result.matched).toBe(1);
    expect(result.skippedStale).toBe(0);
    expect(telematicsService.ingestTelematicsData).toHaveBeenCalledTimes(1);
  });

  it('reports a no-fix payload separately instead of ingesting a null-island position', async () => {
    stubApi([{ uin: '1', __platenumber: 'ABC123' }], {
      '1': { uin: '1', lat: 0, lng: 0, date: '2026-08-18 08:00:00' },
    });
    vehicleRepository.findByLicensePlate.mockResolvedValue({ _id: 'veh-1' });

    const result = await new EagleTrackAdapter().syncOrganization(TENANT);

    expect(result.skippedNoFix).toBe(1);
    expect(result.matched).toBe(0);
    expect(telematicsService.ingestTelematicsData).not.toHaveBeenCalled();
  });

  it('isolates a single tracker failure without abandoning the rest of the fleet', async () => {
    stubApi(
      [
        { uin: '1', __platenumber: 'ABC123' },
        { uin: '2', __platenumber: 'DEF456' },
      ],
      {
        '1': { uin: '1', lat: -17.8, lng: 31.05, date: 'garbage-timestamp' },
        '2': { uin: '2', lat: -17.8, lng: 31.06, date: '2026-08-18 08:00:00' },
      }
    );
    vehicleRepository.findByLicensePlate.mockResolvedValue({ _id: 'veh-x' });

    const result = await new EagleTrackAdapter().syncOrganization(TENANT);

    expect(result.errors).toHaveLength(1);
    expect(result.errors[0]).toContain('1:');
    expect(result.matched).toBe(1);
    expect(telematicsService.ingestTelematicsData).toHaveBeenCalledTimes(1);
  });

  it('returns an error result (not a throw) and records it when the tenant is not configured', async () => {
    eagletrackConfigRepository.getResolvedConfig.mockResolvedValue(null);

    const result = await new EagleTrackAdapter().syncOrganization(TENANT);

    expect(result.matched).toBe(0);
    expect(result.errors).toHaveLength(1);
    expect(telematicsService.ingestTelematicsData).not.toHaveBeenCalled();
  });

  it('does not sync a configured-but-disabled tenant', async () => {
    eagletrackConfigRepository.getResolvedConfig.mockResolvedValue({
      tenantId: TENANT,
      enabled: false,
      domain: 'https://gps.example.com',
      token: 'secret-token-value',
    });

    const result = await new EagleTrackAdapter().syncOrganization(TENANT);

    expect(result.errors).toHaveLength(1);
    expect(telematicsService.ingestTelematicsData).not.toHaveBeenCalled();
  });

  it('records a vendor envelope error as a sync failure rather than an empty successful sync', async () => {
    // The failure mode this guards: `{"error": 101}` on an HTTP 200 read
    // as success would look exactly like "this tenant has no vehicles".
    (global as unknown as { fetch: unknown }).fetch = jest.fn(async () => ({
      ok: true,
      status: 200,
      statusText: 'OK',
      json: async () => ({ error: 101, msg: 'Invalid token' }),
      text: async () => '',
    }));

    const result = await new EagleTrackAdapter().syncOrganization(TENANT);

    expect(result.matched).toBe(0);
    expect(result.errors[0]).toContain('101');
    expect(eagletrackConfigRepository.recordSyncResult).toHaveBeenCalledWith(
      TENANT,
      'error',
      expect.stringContaining('101')
    );
  });
});

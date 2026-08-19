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
  deriveEagleTrackUsername,
  hasUsableFix,
  mapStatusToTelematicsData,
  parseEagleTrackDate,
  plateCandidatesFromTracker,
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

describe('plateCandidatesFromTracker', () => {
  it('orders candidates plate -> __platenumber -> name', () => {
    expect(
      plateCandidatesFromTracker({ uin: '1', plate: 'AAA111', __platenumber: 'BBB222', name: 'CCC333' })
    ).toEqual([
      { value: 'AAA111', source: 'plate' },
      { value: 'BBB222', source: 'platenumber' },
      { value: 'CCC333', source: 'name' },
    ]);
  });

  it('offers `name` when the fields the vendor documents are blank or absent -- the live deployment shape', () => {
    // Real GET /api2/trackers row: plate is "", __platenumber does not
    // exist, the plate is in name. Matching exclusively on __platenumber
    // (the previous rule) matched nothing at all here.
    expect(plateCandidatesFromTracker({ uin: '865585040533451', name: 'ADY2531', plate: '' })).toEqual([
      { value: 'ADY2531', source: 'name' },
    ]);
  });

  it('skips absent, blank and whitespace-only values without a database round trip', () => {
    expect(plateCandidatesFromTracker({ uin: '1', plate: '', __platenumber: '   ' })).toEqual([]);
    expect(plateCandidatesFromTracker({ uin: '1' })).toEqual([]);
    expect(plateCandidatesFromTracker(undefined)).toEqual([]);
  });

  it('trims but does NOT otherwise normalise -- matching stays exact', () => {
    expect(plateCandidatesFromTracker({ uin: '1', plate: '  ABC 123  ' })).toEqual([
      { value: 'ABC 123', source: 'plate' },
    ]);
    // Internal spacing is preserved: "ADY 2531" is not silently turned
    // into "ADY2531". If a deployment needs that, it is a data-cleanup
    // decision, not something to guess at per reading.
    expect(plateCandidatesFromTracker({ uin: '1', name: 'ADY 2531' })[0].value).toBe('ADY 2531');
  });

  it('collapses duplicates case-insensitively, matching how findByLicensePlate compares', () => {
    expect(plateCandidatesFromTracker({ uin: '1', plate: 'ady2531', name: 'ADY2531' })).toEqual([
      { value: 'ady2531', source: 'plate' },
    ]);
  });

  it('ignores non-string values -- an object here would reach a Mongo filter as an operator', () => {
    // The declared field types are our transcription of a vendor
    // document, not a contract the wire honours.
    const hostile = {
      uin: '1',
      plate: { $ne: null } as unknown as string,
      __platenumber: 42 as unknown as string,
      name: ['ADY2531'] as unknown as string,
    };

    expect(plateCandidatesFromTracker(hostile)).toEqual([]);
  });

  it('still offers a name that merely LOOKS unlike a plate -- the vehicle table decides, not a regex', () => {
    // These are offered as candidates and will simply fail to match. No
    // plate-shaped heuristic gets to pre-emptively discard them, because
    // such a heuristic would have to encode every jurisdiction's format.
    expect(plateCandidatesFromTracker({ uin: '1', name: 'PT201B abc long long title name' })).toEqual([
      { value: 'PT201B abc long long title name', source: 'name' },
    ]);
    expect(plateCandidatesFromTracker({ uin: '1', name: 'DashCam2' })).toEqual([
      { value: 'DashCam2', source: 'name' },
    ]);
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

describe('deriveEagleTrackUsername', () => {
  it('prefers the first roster row\'s `belong` field', () => {
    const trackers = [
      { uin: '1', belong: 'Willsgrove' },
      { uin: '2', belong: 'SomeoneElse' },
    ] as EagleTrackTracker[];

    expect(deriveEagleTrackUsername(trackers)).toBe('Willsgrove');
  });

  it('never hardcodes a tenant username -- it reflects whatever the roster actually carries', () => {
    const trackers = [{ uin: '1', belong: 'AcmeLogistics' }] as EagleTrackTracker[];
    expect(deriveEagleTrackUsername(trackers)).toBe('AcmeLogistics');
  });

  it('skips rows with a blank or non-string `belong` and keeps looking', () => {
    const trackers = [
      { uin: '1', belong: '   ' },
      { uin: '2', belong: 42 as unknown as string },
      { uin: '3', belong: 'Willsgrove' },
    ] as EagleTrackTracker[];

    expect(deriveEagleTrackUsername(trackers)).toBe('Willsgrove');
  });

  it('falls back to the first key of refData.users when no roster row has a usable `belong`', () => {
    const trackers = [{ uin: '1' }, { uin: '2' }] as EagleTrackTracker[];
    const refData = { users: { Willsgrove: { title: 'Willsgrove Farm Enterprises', objId: '538' } } };

    expect(deriveEagleTrackUsername(trackers, refData)).toBe('Willsgrove');
  });

  it('returns null rather than guessing when neither source yields a username', () => {
    expect(deriveEagleTrackUsername([])).toBeNull();
    expect(deriveEagleTrackUsername([{ uin: '1' }] as EagleTrackTracker[])).toBeNull();
    expect(deriveEagleTrackUsername([{ uin: '1' }] as EagleTrackTracker[], { users: {} })).toBeNull();
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
// The API client logs too (endpoint only, never the token -- see
// tests/security/telematics-eagletrack-token-leak.spec.ts), so the mock
// has to cover more than logError or every request throws.
jest.mock('../../../infrastructure/monitoring/logger', () => ({
  monitoring: { logError: jest.fn(), logWarn: jest.fn(), logDebug: jest.fn(), logInfo: jest.fn() },
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

/**
 * Installs a fake fetch that answers /api2/trackers and /api2/last from
 * the supplied fixtures.
 *
 * Serves the body from `text()`, not `json()`: the client reads the body
 * as text and parses it itself, because this platform's Content-Type
 * says `text/html` whether the body is JSON or its login page. A stub
 * that only implemented json() would make every request look like an
 * unauthenticated one.
 */
function stubApi(
  roster: EagleTrackTracker[],
  last: Record<string, EagleTrackTrackerStatus>,
  refData?: { users?: Record<string, unknown> }
) {
  // The live-status poll now authenticates as `?user=<username>`,
  // derived from the roster's `belong` field (see
  // deriveEagleTrackUsername). Defaulting it here, unless a fixture
  // already set one, keeps every pre-existing test's roster realistic
  // without hand-editing each one -- production rosters carry `belong`
  // on every row.
  const rosterWithOwner = roster.map((tracker) => ({ belong: 'Willsgrove', ...tracker }));

  (global as unknown as { fetch: unknown }).fetch = jest.fn(async (url: unknown) => {
    const href = String(url);
    const body = href.includes('/api2/trackers')
      ? { error: 0, msg: '', data: rosterWithOwner, ...(refData ? { refData } : {}) }
      : { error: 0, msg: '', data: last };

    return { ok: true, status: 200, statusText: 'OK', text: async () => JSON.stringify(body) };
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

  it('skips the /last call entirely and returns a clean empty sync when the roster is empty', async () => {
    stubApi([], {});

    const result = await new EagleTrackAdapter().syncOrganization(TENANT);

    expect(result.matched).toBe(0);
    expect(result.errors).toEqual([]);
    expect(eagletrackConfigRepository.recordSyncResult).toHaveBeenCalledWith(TENANT, 'success');
    // Only one fetch call -- the roster -- and none to /api2/last.
    expect((global.fetch as jest.Mock).mock.calls).toHaveLength(1);
    expect(String((global.fetch as jest.Mock).mock.calls[0][0])).toContain('/api2/trackers');
  });

  it('polls /api2/last with the username derived from the roster\'s `belong` field, not a fleet-wide selector', async () => {
    stubApi([{ uin: '1', __platenumber: 'ABC123', belong: 'AcmeLogistics' }], {
      '1': { uin: '1', lat: -17.8, lng: 31.05, date: '2026-08-18 08:00:00' },
    });
    vehicleRepository.findByLicensePlate.mockResolvedValue({ _id: 'veh-1' });

    await new EagleTrackAdapter().syncOrganization(TENANT);

    const lastCall = (global.fetch as jest.Mock).mock.calls.find((call) => String(call[0]).includes('/api2/last'));
    expect(lastCall).toBeDefined();
    const url = new URL(String(lastCall![0]));
    expect(url.searchParams.get('user')).toBe('AcmeLogistics');
    expect(url.searchParams.get('uin')).toBeNull();
  });

  it('reports an error and skips /api2/last when no tracker carries a username and refData has none either', async () => {
    (global as unknown as { fetch: unknown }).fetch = jest.fn(async (url: unknown) => {
      const href = String(url);
      const body = href.includes('/api2/trackers')
        ? { error: 0, msg: '', data: [{ uin: '1', __platenumber: 'ABC123' }] } // no `belong`, no refData
        : { error: 0, msg: '', data: {} };
      return { ok: true, status: 200, statusText: 'OK', text: async () => JSON.stringify(body) };
    });

    const result = await new EagleTrackAdapter().syncOrganization(TENANT);

    expect(result.matched).toBe(0);
    expect(result.errors).toHaveLength(1);
    expect(result.errors[0]).toMatch(/username/i);
    expect(eagletrackConfigRepository.recordSyncResult).toHaveBeenCalledWith(
      TENANT,
      'error',
      expect.stringMatching(/username/i)
    );
    expect((global.fetch as jest.Mock).mock.calls.some((call) => String(call[0]).includes('/api2/last'))).toBe(false);
  });

  it('records a vendor envelope error as a sync failure rather than an empty successful sync', async () => {
    // The failure mode this guards: `{"error": 101}` on an HTTP 200 read
    // as success would look exactly like "this tenant has no vehicles".
    (global as unknown as { fetch: unknown }).fetch = jest.fn(async () => ({
      ok: true,
      status: 200,
      statusText: 'OK',
      text: async () => JSON.stringify({ error: 101, msg: 'Invalid token' }),
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

// ---------------------------------------------------------------------
// Matching order, end to end through syncOrganization
// ---------------------------------------------------------------------
//
// The unit tests above prove which CANDIDATES a roster row yields. These
// prove what the adapter does with them: which lookups it issues, in what
// order, when it stops, and what it reports afterwards.

describe('EagleTrackAdapter vehicle matching order', () => {
  const originalFetch = global.fetch;

  /** Three rows from the real GET /api2/trackers response, trimmed to the fields matching uses. */
  const LIVE_ROSTER: EagleTrackTracker[] = [
    { id: '1332', uin: '865585040533451', name: 'ADY2531', model: '10104', belong: 'Willsgrove', plate: '' },
    { id: '1317', uin: '861100068912274', name: 'AFU0078', model: '10192', belong: 'Willsgrove', plate: '' },
    { id: '1336', uin: '865585040464392', name: 'ADL5345', model: '10104', belong: 'Willsgrove', plate: '' },
  ];

  const liveLast = (): Record<string, EagleTrackTrackerStatus> => ({
    '865585040533451': { uin: '865585040533451', lat: -17.82, lng: 31.05, date: '2026-08-19 08:40:00', speed: 42 },
    '861100068912274': { uin: '861100068912274', lat: -17.83, lng: 31.06, date: '2026-08-19 08:40:00', speed: 0 },
    '865585040464392': { uin: '865585040464392', lat: -17.84, lng: 31.07, date: '2026-08-19 08:40:00', speed: 12 },
  });

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

  it('matches the live deployment roster on `name`, which the previous __platenumber-only rule could not', async () => {
    // The regression this change exists to fix: plate is "",
    // __platenumber is absent, so the old rule produced three unmatched
    // trackers and a sync that looked like "this tenant has no vehicles".
    stubApi(LIVE_ROSTER, liveLast());
    vehicleRepository.findByLicensePlate.mockImplementation(async (plate: string) =>
      ['ADY2531', 'AFU0078', 'ADL5345'].includes(plate) ? { _id: `veh-${plate}`, license_plate: plate } : null
    );

    const result = await new EagleTrackAdapter().syncOrganization(TENANT);

    expect(result.matched).toBe(3);
    expect(result.unmatchedTrackers).toEqual([]);
    expect(result.matchedBy).toEqual({ plate: 0, platenumber: 0, name: 3 });
    expect(telematicsService.ingestTelematicsData).toHaveBeenCalledTimes(3);
  });

  it('prefers `plate` over `name` when both resolve to a vehicle, and stops after the first match', async () => {
    stubApi([{ uin: '1', plate: 'AAA111', name: 'BBB222' }], {
      '1': { uin: '1', lat: -17.8, lng: 31.05, date: '2026-08-19 08:00:00' },
    });
    vehicleRepository.findByLicensePlate.mockImplementation(async (plate: string) => ({ _id: `veh-${plate}` }));

    const result = await new EagleTrackAdapter().syncOrganization(TENANT);

    expect(result.matchedBy).toEqual({ plate: 1, platenumber: 0, name: 0 });
    // `name` must not even be queried once `plate` has resolved.
    expect(vehicleRepository.findByLicensePlate).toHaveBeenCalledTimes(1);
    expect(vehicleRepository.findByLicensePlate).toHaveBeenCalledWith('AAA111', TENANT);
    expect(telematicsService.ingestTelematicsData).toHaveBeenCalledWith(
      expect.objectContaining({ vehicleId: 'veh-AAA111' })
    );
  });

  it('falls through a junk `plate` and `__platenumber` to a `name` that does match', async () => {
    // Falling through rather than first-field-wins is the point: a stale
    // vendor plate field would otherwise permanently mask a good name,
    // and every candidate still has to equal a real plate in the tenant.
    stubApi([{ uin: '1', plate: 'GONE01', __platenumber: 'abc', name: 'ADY2531' }], {
      '1': { uin: '1', lat: -17.8, lng: 31.05, date: '2026-08-19 08:00:00' },
    });
    vehicleRepository.findByLicensePlate.mockImplementation(async (plate: string) =>
      plate === 'ADY2531' ? { _id: 'veh-1' } : null
    );

    const result = await new EagleTrackAdapter().syncOrganization(TENANT);

    expect(result.matched).toBe(1);
    expect(result.matchedBy).toEqual({ plate: 0, platenumber: 0, name: 1 });
    expect(vehicleRepository.findByLicensePlate.mock.calls.map((c: unknown[]) => c[0])).toEqual([
      'GONE01',
      'abc',
      'ADY2531',
    ]);
  });

  it('still matches on `__platenumber` for deployments that populate it -- Cartrack-era behaviour is preserved', async () => {
    stubApi([{ uin: '1', plate: '', __platenumber: 'ABC123', name: 'DashCam2' }], {
      '1': { uin: '1', lat: -17.8, lng: 31.05, date: '2026-08-19 08:00:00' },
    });
    vehicleRepository.findByLicensePlate.mockImplementation(async (plate: string) =>
      plate === 'ABC123' ? { _id: 'veh-1' } : null
    );

    const result = await new EagleTrackAdapter().syncOrganization(TENANT);

    expect(result.matched).toBe(1);
    expect(result.matchedBy).toEqual({ plate: 0, platenumber: 1, name: 0 });
  });

  it('issues ONE lookup when two fields carry the same plate in different casing', async () => {
    stubApi([{ uin: '1', plate: 'ady2531', name: 'ADY2531' }], {
      '1': { uin: '1', lat: -17.8, lng: 31.05, date: '2026-08-19 08:00:00' },
    });
    vehicleRepository.findByLicensePlate.mockResolvedValue({ _id: 'veh-1' });

    await new EagleTrackAdapter().syncOrganization(TENANT);

    expect(vehicleRepository.findByLicensePlate).toHaveBeenCalledTimes(1);
  });

  it('reports a tracker whose every candidate fails as unmatched, and never auto-creates a vehicle', async () => {
    stubApi([{ uin: '1', plate: 'NOPE01', name: 'PT201B abc long long title name' }], {
      '1': { uin: '1', lat: -17.8, lng: 31.05, date: '2026-08-19 08:00:00' },
    });
    vehicleRepository.findByLicensePlate.mockResolvedValue(null);

    const result = await new EagleTrackAdapter().syncOrganization(TENANT);

    expect(result.unmatchedTrackers).toEqual(['1']);
    expect(result.matchedBy).toEqual({ plate: 0, platenumber: 0, name: 0 });
    expect(telematicsService.ingestTelematicsData).not.toHaveBeenCalled();
    expect(telematicsRepository.registerDevice).not.toHaveBeenCalled();
  });

  it('issues NO lookup at all for a roster row with nothing usable', async () => {
    stubApi([{ uin: '1', plate: '', name: '   ' }], {
      '1': { uin: '1', lat: -17.8, lng: 31.05, date: '2026-08-19 08:00:00' },
    });

    const result = await new EagleTrackAdapter().syncOrganization(TENANT);

    expect(result.unmatchedTrackers).toEqual(['1']);
    expect(vehicleRepository.findByLicensePlate).not.toHaveBeenCalled();
  });

  it('issues NO lookup for a non-string field, which would otherwise reach a Mongo filter as an operator', async () => {
    stubApi([{ uin: '1', plate: { $ne: null } as unknown as string }], {
      '1': { uin: '1', lat: -17.8, lng: 31.05, date: '2026-08-19 08:00:00' },
    });

    const result = await new EagleTrackAdapter().syncOrganization(TENANT);

    expect(result.unmatchedTrackers).toEqual(['1']);
    expect(vehicleRepository.findByLicensePlate).not.toHaveBeenCalled();
  });

  it('counts a matched-but-unusable fix in matchedBy, so the counters sum to matched + skippedNoFix', async () => {
    stubApi(
      [
        { uin: '1', name: 'ADY2531' },
        { uin: '2', name: 'AFU0078' },
      ],
      {
        '1': { uin: '1', lat: -17.8, lng: 31.05, date: '2026-08-19 08:00:00' },
        // Null island: matched to a vehicle, but no usable position.
        '2': { uin: '2', lat: 0, lng: 0, date: '2026-08-19 08:00:00' },
      }
    );
    vehicleRepository.findByLicensePlate.mockImplementation(async (plate: string) => ({ _id: `veh-${plate}` }));

    const result = await new EagleTrackAdapter().syncOrganization(TENANT);

    expect(result.matched).toBe(1);
    expect(result.skippedNoFix).toBe(1);
    const total = result.matchedBy.plate + result.matchedBy.platenumber + result.matchedBy.name;
    expect(total).toBe(result.matched + result.skippedNoFix);
  });

  it('records which field the link came from on the registered device', async () => {
    // If a tracker turns out to be attached to the wrong vehicle, this is
    // the first thing anyone needs, and it cannot be re-derived later
    // from a vendor payload nobody stored.
    stubApi([{ uin: '865585040533451', plate: '', name: 'ADY2531' }], {
      '865585040533451': { uin: '865585040533451', lat: -17.8, lng: 31.05, date: '2026-08-19 08:00:00' },
    });
    vehicleRepository.findByLicensePlate.mockResolvedValue({ _id: 'veh-1' });

    await new EagleTrackAdapter().syncOrganization(TENANT);

    expect(telematicsRepository.registerDevice).toHaveBeenCalledWith(
      expect.objectContaining({
        deviceId: 'eagletrack-865585040533451',
        vehicleId: 'veh-1',
        metadata: expect.objectContaining({ matchedBy: 'name', trackerName: 'ADY2531' }),
      }),
      TENANT
    );
  });

  it('keeps the vehicle lookup tenant-scoped for every candidate, not just the first', async () => {
    stubApi([{ uin: '1', plate: 'GONE01', __platenumber: 'GONE02', name: 'ADY2531' }], {
      '1': { uin: '1', lat: -17.8, lng: 31.05, date: '2026-08-19 08:00:00' },
    });
    vehicleRepository.findByLicensePlate.mockImplementation(async (plate: string) =>
      plate === 'ADY2531' ? { _id: 'veh-1' } : null
    );

    await new EagleTrackAdapter().syncOrganization(TENANT);

    for (const call of vehicleRepository.findByLicensePlate.mock.calls) {
      expect(call[1]).toBe(TENANT);
    }
  });
});

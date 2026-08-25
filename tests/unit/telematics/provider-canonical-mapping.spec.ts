// tests/unit/telematics/provider-canonical-mapping.spec.ts
//
// PHASE 2 -- both real adapters produce the SAME canonical shape.
//
// The projection functions are tested directly rather than through a
// live client: the mapping is the part worth pinning, and reaching it
// through a transport would test the vendor's HTTP behaviour instead.
//
// Every absent-vs-zero assertion here restates the Phase 1 rule at the
// contract boundary, because that is where it can be enforced for
// providers that do not exist yet.

import {
  toCanonicalPoint as cartrackPoint,
  toCanonicalEvent as cartrackEvent,
  CARTRACK_DESCRIPTOR,
} from '@/modules/telematics/adapters/cartrack/cartrack.provider';
import {
  toCanonicalPoint as eagletrackPoint,
  EAGLETRACK_DESCRIPTOR,
} from '@/modules/telematics/adapters/eagletrack/eagletrack.provider';
import { CartrackVehicleStatus } from '@/modules/telematics/adapters/cartrack/cartrack.types';
import { EagleTrackTrackerStatus } from '@/modules/telematics/adapters/eagletrack/eagletrack.types';
import { PROVIDER_CARTRACK, PROVIDER_EAGLETRACK } from '@/modules/telematics/providers/provider.types';

function cartrackStatus(over: Partial<CartrackVehicleStatus> = {}): CartrackVehicleStatus {
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
    ...over,
  };
}

function eagleStatus(over: Partial<EagleTrackTrackerStatus> = {}): EagleTrackTrackerStatus {
  return {
    uin: '1234567890',
    lat: -17.82,
    lng: 31.05,
    speed: 54,
    bearing: 91,
    date: '2026-08-20 09:15:00',
    ...over,
  };
}

describe('Phase 2: provider identity is explicit on every point', () => {
  it('Cartrack stamps its own id and the vendor device id, unprefixed', () => {
    const point = cartrackPoint(cartrackStatus(), 'vehicle-1')!;

    expect(point.providerId).toBe(PROVIDER_CARTRACK);
    // The vendor's own identifier, NOT our composite storage key.
    expect(point.externalDeviceId).toBe('CT-0001');
    expect(point.externalDeviceId).not.toContain('cartrack-');
    expect(point.vehicleId).toBe('vehicle-1');
  });

  it('Eagle Track stamps its own id and the uin, unprefixed', () => {
    const point = eagletrackPoint(eagleStatus(), 'vehicle-1')!;

    expect(point.providerId).toBe(PROVIDER_EAGLETRACK);
    expect(point.externalDeviceId).toBe('1234567890');
    expect(point.externalDeviceId).not.toContain('eagletrack-');
  });

  it('keeps providerId, externalDeviceId and vehicleId as three distinct fields', () => {
    const point = eagletrackPoint(eagleStatus(), 'vehicle-1')!;

    expect(point.providerId).not.toBe(point.externalDeviceId);
    expect(point.externalDeviceId).not.toBe(point.vehicleId);
  });

  it('omits vehicleId when the adapter matched no vehicle', () => {
    // Returned WITHOUT a vehicleId rather than dropped, so the caller
    // can report it. Guessing which internal vehicle a stray
    // registration belongs to is the guess this codebase refuses.
    const point = cartrackPoint(cartrackStatus())!;
    expect(point.vehicleId).toBeUndefined();
  });

  it('carries no ownership fields at all', () => {
    // An adapter has no field in which to express a tenant, so a buggy
    // or compromised one cannot forge one. Phase 0's rule, enforced by
    // the type rather than by everyone remembering.
    for (const point of [cartrackPoint(cartrackStatus(), 'v')!, eagletrackPoint(eagleStatus(), 'v')!]) {
      expect(point).not.toHaveProperty('tenantId');
      expect(point).not.toHaveProperty('orgUnitId');
    }
  });
});

describe('Phase 2: a fix with no usable timestamp is DROPPED', () => {
  it('Cartrack returns undefined rather than stamping server time', () => {
    // Substituting `new Date()` would make a malformed reading look like
    // the freshest fix in the fleet and win every "is this newer than
    // what I hold" comparison.
    expect(
      cartrackPoint(
        cartrackStatus({
          position: { latitude: 1, longitude: 2, speed: 0, heading: 0, position_date: 'rubbish' },
        })
      )
    ).toBeUndefined();
  });

  it('Eagle Track returns undefined for an unparseable date', () => {
    expect(eagletrackPoint(eagleStatus({ date: undefined }))).toBeUndefined();
    expect(eagletrackPoint(eagleStatus({ date: '' }))).toBeUndefined();
  });
});

describe('Phase 2: absent measurements stay absent', () => {
  it('Cartrack omits fuel level when unreported', () => {
    const point = cartrackPoint(cartrackStatus(), 'v')!;
    expect(point.engine?.fuelLevel).toBeUndefined();
  });

  it('Cartrack preserves a genuine zero fuel level', () => {
    const point = cartrackPoint(cartrackStatus({ fuel_level_percent: 0 }), 'v')!;
    expect(point.engine?.fuelLevel).toBe(0);
  });

  it('Cartrack omits odometer when unreported and keeps it when present', () => {
    expect(cartrackPoint(cartrackStatus(), 'v')!.trip?.odometer).toBeUndefined();
    expect(cartrackPoint(cartrackStatus({ odometer_km: 128_400 }), 'v')!.trip?.odometer).toBe(
      128_400
    );
  });

  it('neither adapter invents trip aggregates from instantaneous speed', () => {
    // Both live endpoints are point-in-time fixes with no aggregation.
    // Mapping speed onto averageSpeed/maxSpeed reported a trip maximum
    // of 0 for a vehicle sampled while stationary.
    for (const point of [cartrackPoint(cartrackStatus(), 'v')!, eagletrackPoint(eagleStatus(), 'v')!]) {
      expect(point.trip?.averageSpeed).toBeUndefined();
      expect(point.trip?.maxSpeed).toBeUndefined();
    }
  });

  it('neither adapter reports a horizontal accuracy it does not have', () => {
    // 0 does not read as "unknown" -- it reads as a PERFECT fix, the
    // most precise value the field can express.
    for (const point of [cartrackPoint(cartrackStatus(), 'v')!, eagletrackPoint(eagleStatus(), 'v')!]) {
      expect(point.position?.accuracy).toBeUndefined();
    }
  });

  it('contains no zero-valued measurement for a minimal payload', () => {
    const points = [cartrackPoint(cartrackStatus(), 'v')!, eagletrackPoint(eagleStatus(), 'v')!];

    for (const point of points) {
      const zeros: string[] = [];
      for (const container of ['engine', 'trip', 'fuel'] as const) {
        for (const [k, v] of Object.entries(point[container] ?? {})) {
          if (v === 0) zeros.push(`${point.providerId}.${container}.${k}`);
        }
      }
      expect(zeros).toEqual([]);
    }
  });
});

describe('Phase 2: position normalisation is identical across providers', () => {
  it('both preserve a genuine zero speed', () => {
    expect(
      cartrackPoint(
        cartrackStatus({
          position: {
            latitude: -17.82, longitude: 31.05, speed: 0, heading: 45,
            position_date: '2026-08-20T09:15:00.000Z',
          },
        }),
        'v'
      )!.position?.speed
    ).toBe(0);

    expect(eagletrackPoint(eagleStatus({ speed: 0 }), 'v')!.position?.speed).toBe(0);
  });

  it('both wrap an out-of-range heading identically', () => {
    expect(
      cartrackPoint(
        cartrackStatus({
          position: {
            latitude: -17.82, longitude: 31.05, speed: 10, heading: 370,
            position_date: '2026-08-20T09:15:00.000Z',
          },
        }),
        'v'
      )!.position?.heading
    ).toBe(10);

    expect(eagletrackPoint(eagleStatus({ bearing: 370 }), 'v')!.position?.heading).toBe(10);
  });

  it('both drop the position entirely when coordinates are out of range', () => {
    // Clamping a latitude of 200 to 90 would place a vehicle at the
    // north pole and look like a real fix.
    expect(
      cartrackPoint(
        cartrackStatus({
          position: {
            latitude: 200, longitude: 31.05, speed: 10, heading: 0,
            position_date: '2026-08-20T09:15:00.000Z',
          },
        }),
        'v'
      )!.position
    ).toBeUndefined();

    expect(eagletrackPoint(eagleStatus({ lat: 200 }), 'v')!.position).toBeUndefined();
  });

  it('Eagle Track resolves its zone-less timestamp as UTC', () => {
    expect(eagletrackPoint(eagleStatus(), 'v')!.recordedAt.toISOString()).toBe(
      '2026-08-20T09:15:00.000Z'
    );
  });
});

describe('Phase 2: Cartrack events map onto the platform taxonomy', () => {
  it('maps a known event type', () => {
    const event = cartrackEvent({
      event_type: 'speeding',
      event_date: '2026-08-20T09:15:00.000Z',
      value: 132,
      threshold: 120,
    })!;

    expect(event.type).toBe('speeding');
    expect(event.severity).toBe('high');
    expect(event.value).toBe(132);
  });

  it("maps an unrecognised vendor type to 'vendor', not a near-miss", () => {
    // The precedent is Eagle Track trigger type 4 (Stop), deliberately
    // NOT mapped to 'idle' -- idle means engine-running-while-stationary
    // everywhere here, and misfiling it would inflate the idle metric
    // with parked vehicles.
    const event = cartrackEvent({
      event_type: 'towing',
      event_date: '2026-08-20T09:15:00.000Z',
    })!;

    expect(event.type).toBe('vendor');
  });

  it('drops an event with an unparseable date', () => {
    expect(cartrackEvent({ event_type: 'speeding', event_date: 'nonsense' })).toBeUndefined();
  });

  it('derives severity from the event type rather than inventing it', () => {
    // Cartrack's feed carries no severity field. A random or
    // round-robin severity is the F-18 defect in a new place.
    const a = cartrackEvent({ event_type: 'harsh_braking', event_date: '2026-08-20T09:15:00Z' })!;
    const b = cartrackEvent({ event_type: 'harsh_braking', event_date: '2026-08-20T09:15:00Z' })!;
    expect(a.severity).toBe(b.severity);
  });
});

describe('Phase 2: descriptors reflect what the adapters actually do', () => {
  it('Cartrack declares only what it implements', () => {
    expect(CARTRACK_DESCRIPTOR.capabilities).toContain('live_position');
    expect(CARTRACK_DESCRIPTOR.capabilities).toContain('alerts');
    // No history endpoint, no fuel report, no driver or trigger sync
    // exists for Cartrack anywhere in this codebase.
    expect(CARTRACK_DESCRIPTOR.capabilities).not.toContain('historical_position');
    expect(CARTRACK_DESCRIPTOR.capabilities).not.toContain('fuel_report');
  });

  it('Eagle Track declares the six it implements', () => {
    for (const capability of [
      'live_position',
      'historical_position',
      'alerts',
      'fuel_report',
      'driver_sync',
      'trigger_sync',
    ]) {
      expect(EAGLETRACK_DESCRIPTOR.capabilities).toContain(capability);
    }
  });
});

// tests/unit/telematics/live-map-status.spec.ts
//
// The live-map status decision and alert derivation, tested as pure
// functions -- no Mongo, no TenantContext, no mocking. That is the whole
// reason they were extracted out of LiveMapService's private methods.
//
// THE BUG THESE EXIST TO PIN DOWN: status used to be
// `ageMinutes > STALE_FIX_MINUTES ? 'offline' : statusFromSpeed(...)`,
// i.e. a 15-minute-old fix meant offline no matter what the vehicle was
// doing. Any fleet whose trackers report on a slower duty cycle rendered
// as 100% offline -- every marker grey, no heading wedge on any of them.
// The first describe block below re-creates exactly that input and
// asserts the new answer, so a future "simplification" back to a single
// age threshold fails here rather than in production.

import {
  IDLE_SPEED_THRESHOLD_KMH,
  OFFLINE_FIX_MINUTES,
  STALE_FIX_MINUTES,
  isStaleFix,
  readProviderOffline,
  resolveAlertState,
  resolveLiveStatus,
} from '../../../modules/telematics/services/live-map.service';
import type { TelematicsData } from '../../../modules/telematics/types/telematics.types';

function reading(overrides: Partial<TelematicsData> = {}): TelematicsData {
  return {
    deviceId: 'eagletrack-9171892960',
    vehicleId: '507f1f77bcf86cd799439011',
    location: { lat: -17.82, lng: 31.03, speed: 42, heading: 90, altitude: 0, accuracy: 0, timestamp: new Date() },
    engine: {},
    trip: {},
    fuel: {},
    timestamp: new Date(),
    ...overrides,
  } as TelematicsData;
}

describe('resolveLiveStatus', () => {
  describe('the regression this change exists to fix', () => {
    it('does NOT call a moving vehicle offline just because its fix is older than the staleness threshold', () => {
      const status = resolveLiveStatus({
        hasPosition: true,
        speed: 62,
        fixAgeMinutes: STALE_FIX_MINUTES + 5,
        providerOffline: undefined,
      });

      expect(status).toBe('moving');
    });

    it('does NOT call a parked vehicle offline at the staleness threshold either -- it is idle', () => {
      const status = resolveLiveStatus({
        hasPosition: true,
        speed: 0,
        fixAgeMinutes: STALE_FIX_MINUTES + 5,
        providerOffline: undefined,
      });

      expect(status).toBe('idle');
    });

    it('keeps the two thresholds distinct: staleness never decides status', () => {
      // If these ever collapse back to one number, a fleet on a slow
      // duty cycle goes all-grey again.
      expect(OFFLINE_FIX_MINUTES).toBeGreaterThan(STALE_FIX_MINUTES);
    });
  });

  describe('offline is a disjunction of three independent conditions', () => {
    it('offline with no position, whatever the speed says', () => {
      expect(
        resolveLiveStatus({ hasPosition: false, speed: 80, fixAgeMinutes: 0, providerOffline: false })
      ).toBe('offline');
    });

    it("offline when the provider's own flag says so, on an otherwise fresh fix", () => {
      expect(
        resolveLiveStatus({ hasPosition: true, speed: 0, fixAgeMinutes: 1, providerOffline: true })
      ).toBe('offline');
    });

    it('offline past the age ceiling', () => {
      expect(
        resolveLiveStatus({
          hasPosition: true,
          speed: 0,
          fixAgeMinutes: OFFLINE_FIX_MINUTES + 1,
          providerOffline: undefined,
        })
      ).toBe('offline');
    });

    it('the age ceiling overrides a provider that claims the tracker is online', () => {
      // A vendor flag can only ever ADD offline. An hours-old snapshot
      // cannot be made live by a boolean.
      expect(
        resolveLiveStatus({
          hasPosition: true,
          speed: 0,
          fixAgeMinutes: OFFLINE_FIX_MINUTES + 120,
          providerOffline: false,
        })
      ).toBe('offline');
    });

    it('the age ceiling also stops a tracker that died mid-journey showing as permanently moving', () => {
      // The opposite failure from the one being fixed: /api2/last keeps
      // replaying the last snapshot, speed and all.
      expect(
        resolveLiveStatus({
          hasPosition: true,
          speed: 75,
          fixAgeMinutes: 180,
          providerOffline: undefined,
        })
      ).toBe('offline');
    });

    it('treats a non-finite age (never reported) as offline rather than as fresh', () => {
      expect(
        resolveLiveStatus({ hasPosition: true, speed: 0, fixAgeMinutes: Infinity, providerOffline: undefined })
      ).toBe('offline');
    });
  });

  describe('moving vs idle, once the vehicle is known to be reporting', () => {
    it('moving above the idle speed threshold', () => {
      expect(
        resolveLiveStatus({
          hasPosition: true,
          speed: IDLE_SPEED_THRESHOLD_KMH + 0.1,
          fixAgeMinutes: 2,
          providerOffline: false,
        })
      ).toBe('moving');
    });

    it('idle AT the threshold -- the comparison is strictly greater-than, so GPS jitter is not movement', () => {
      expect(
        resolveLiveStatus({
          hasPosition: true,
          speed: IDLE_SPEED_THRESHOLD_KMH,
          fixAgeMinutes: 2,
          providerOffline: false,
        })
      ).toBe('idle');
    });

    it('idle at rest', () => {
      expect(
        resolveLiveStatus({ hasPosition: true, speed: 0, fixAgeMinutes: 2, providerOffline: undefined })
      ).toBe('idle');
    });
  });
});

describe('isStaleFix', () => {
  it('flags a fix past the staleness threshold', () => {
    expect(isStaleFix(STALE_FIX_MINUTES + 1)).toBe(true);
  });

  it('does not flag a fix at or under it', () => {
    expect(isStaleFix(STALE_FIX_MINUTES)).toBe(false);
    expect(isStaleFix(0)).toBe(false);
  });

  it('is not itself a status: a stale fix can still be a moving vehicle', () => {
    const fixAgeMinutes = STALE_FIX_MINUTES + 10;

    expect(isStaleFix(fixAgeMinutes)).toBe(true);
    expect(resolveLiveStatus({ hasPosition: true, speed: 50, fixAgeMinutes })).toBe('moving');
  });
});

describe('readProviderOffline', () => {
  it("reads Eagle Track's own offline flag off providerMetadata", () => {
    expect(readProviderOffline({ source: 'eagletrack', offline: true })).toBe(true);
    expect(readProviderOffline({ source: 'eagletrack', offline: false })).toBe(false);
  });

  it('distinguishes "the provider did not say" from "the provider said online"', () => {
    // undefined must not be conflated with false -- resolveLiveStatus
    // only acts on an explicit true, so this is the difference between
    // a vendor verdict and our own inference.
    expect(readProviderOffline(undefined)).toBeUndefined();
    expect(readProviderOffline({ source: 'cartrack' })).toBeUndefined();
    expect(readProviderOffline({ offline: 'true' })).toBeUndefined();
    expect(readProviderOffline({ offline: 1 })).toBeUndefined();
  });
});

describe('resolveAlertState', () => {
  it('returns null for an unremarkable reading', () => {
    expect(resolveAlertState(reading())).toBeNull();
  });

  it('flags a speeding reading using the same threshold the ingestion path alerts on', () => {
    const alert = resolveAlertState(
      reading({
        location: { lat: -17.8, lng: 31.0, speed: 145, heading: 10, altitude: 0, accuracy: 0, timestamp: new Date() },
      })
    );

    expect(alert?.severity).toBe('high');
    expect(alert?.reasons[0]).toContain('speed limit');
  });

  it('flags engine fault codes as critical', () => {
    const alert = resolveAlertState(reading({ engine: { dtcCodes: ['P0301'] } }));

    expect(alert?.severity).toBe('critical');
    expect(alert?.reasons[0]).toContain('P0301');
  });

  it('does NOT flag low fuel for a device that simply does not report fuel', () => {
    // The absent-vs-zero distinction, end to end: engine.fuelLevel is
    // omitted by the adapter when unreported, and an omitted value must
    // not read as an empty tank.
    expect(resolveAlertState(reading({ engine: {} }))).toBeNull();
    expect(resolveAlertState(reading({ engine: { fuelLevel: 4 } }))?.severity).toBe('high');
  });

  it('takes the WORST severity when several causes coincide, and orders reasons worst-first', () => {
    const alert = resolveAlertState(
      reading({
        location: { lat: -17.8, lng: 31.0, speed: 145, heading: 10, altitude: 0, accuracy: 0, timestamp: new Date() },
        engine: { dtcCodes: ['P0420'], fuelLevel: 2 },
      })
    );

    expect(alert?.severity).toBe('critical');
    expect(alert?.reasons).toHaveLength(3);
    expect(alert?.reasons[0]).toContain('P0420');
  });

  it("surfaces the provider's own alert when it carries a non-zero id", () => {
    const alert = resolveAlertState(
      reading({ providerMetadata: { source: 'eagletrack', vendorAlert: { cmd: 0, trigger: 17 } } })
    );

    expect(alert?.severity).toBe('medium');
    expect(alert?.reasons[0]).toBe('Provider alert (trigger 17)');
  });

  it("ignores the vendor's 0/0 resting state", () => {
    expect(
      resolveAlertState(reading({ providerMetadata: { source: 'eagletrack', vendorAlert: { cmd: 0, trigger: 0 } } }))
    ).toBeNull();
  });

  it('ignores an alert that has already been acknowledged', () => {
    const alert = resolveAlertState(
      reading({
        alerts: [
          {
            type: 'idle',
            severity: 'medium',
            message: 'Excessive idling',
            timestamp: new Date(),
            acknowledgedAt: new Date(),
          },
        ],
      })
    );

    expect(alert).toBeNull();
  });

  it('honours an unacknowledged alert embedded on the reading', () => {
    const alert = resolveAlertState(
      reading({
        alerts: [{ type: 'geofence', severity: 'medium', message: 'Left depot boundary', timestamp: new Date() }],
      })
    );

    expect(alert?.reasons).toEqual(['Left depot boundary']);
  });
});

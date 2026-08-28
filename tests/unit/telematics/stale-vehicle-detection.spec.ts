// tests/unit/telematics/stale-vehicle-detection.spec.ts
//
// PHASE 7 FOLLOW-UP -- populates fleet_telematics_stale_vehicles{provider}.
//
// detectStaleVehicles() is exercised directly with injected fakes, so
// this needs no Mongo and no BullMQ -- same reasoning as
// telematics-observability.spec.ts's behavioural half.

import {
  detectStaleVehicles,
  StaleVehicleCounter,
  StaleVehicleRecorder,
  StaleVehicleProviderRef,
} from '@/modules/telematics/services/stale-vehicle-detection.service';
import {
  getStaleVehicleHorizonMinutes,
  DEFAULT_STALE_VEHICLE_HORIZON_MINUTES,
  MIN_STALE_VEHICLE_HORIZON_MINUTES,
  StaleVehicleConfigError,
} from '@/modules/telematics/services/stale-vehicle.config';

jest.mock('@/infrastructure/monitoring/logger', () => ({
  monitoring: { logError: jest.fn(), logWarn: jest.fn(), logInfo: jest.fn() },
}));

function fakeCounter(counts: Record<string, number>): StaleVehicleCounter & {
  calls: Array<{ providerId: string; cutoff: Date }>;
} {
  const calls: Array<{ providerId: string; cutoff: Date }> = [];
  return {
    calls,
    async countStaleDevicesByProvider(providerId: string, cutoff: Date): Promise<number> {
      calls.push({ providerId, cutoff });
      if (!(providerId in counts)) {
        throw new Error(`unexpected providerId in test: ${providerId}`);
      }
      return counts[providerId];
    },
  };
}

function fakeRecorder(): StaleVehicleRecorder & {
  calls: Array<{ providerId: string; count: number }>;
} {
  const calls: Array<{ providerId: string; count: number }> = [];
  return {
    calls,
    recordStaleVehicles(providerId: string, count: number): void {
      calls.push({ providerId, count });
    },
  };
}

const CARTRACK_EAGLETRACK: StaleVehicleProviderRef[] = [
  { providerId: 'cartrack' },
  { providerId: 'eagletrack' },
];

describe('PHASE 7 FOLLOW-UP: STALE_VEHICLE_HORIZON_MINUTES configuration', () => {
  const original = process.env.STALE_VEHICLE_HORIZON_MINUTES;

  afterEach(() => {
    if (original === undefined) delete process.env.STALE_VEHICLE_HORIZON_MINUTES;
    else process.env.STALE_VEHICLE_HORIZON_MINUTES = original;
  });

  it('defaults to 60 minutes when unset', () => {
    delete process.env.STALE_VEHICLE_HORIZON_MINUTES;
    expect(getStaleVehicleHorizonMinutes()).toBe(60);
    expect(DEFAULT_STALE_VEHICLE_HORIZON_MINUTES).toBe(60);
  });

  it('honours an explicit horizon', () => {
    process.env.STALE_VEHICLE_HORIZON_MINUTES = '120';
    expect(getStaleVehicleHorizonMinutes()).toBe(120);
  });

  it('treats an empty string as unset', () => {
    process.env.STALE_VEHICLE_HORIZON_MINUTES = '';
    expect(getStaleVehicleHorizonMinutes()).toBe(DEFAULT_STALE_VEHICLE_HORIZON_MINUTES);
  });

  it('refuses a non-numeric value rather than silently defaulting', () => {
    process.env.STALE_VEHICLE_HORIZON_MINUTES = 'not-a-number';
    expect(() => getStaleVehicleHorizonMinutes()).toThrow(StaleVehicleConfigError);
  });

  it('refuses a value below the minimum', () => {
    process.env.STALE_VEHICLE_HORIZON_MINUTES = '0';
    expect(() => getStaleVehicleHorizonMinutes()).toThrow(StaleVehicleConfigError);
    expect(MIN_STALE_VEHICLE_HORIZON_MINUTES).toBe(1);
  });

  it('refuses a non-integer value', () => {
    process.env.STALE_VEHICLE_HORIZON_MINUTES = '60.5';
    expect(() => getStaleVehicleHorizonMinutes()).toThrow(StaleVehicleConfigError);
  });
});

describe('PHASE 7 FOLLOW-UP: detectStaleVehicles computes and publishes counts', () => {
  it('calculates stale counts for cartrack and eagletrack', async () => {
    const counter = fakeCounter({ cartrack: 3, eagletrack: 7 });
    const recorder = fakeRecorder();

    const results = await detectStaleVehicles({
      counter,
      recorder,
      listProviders: () => CARTRACK_EAGLETRACK,
      horizonMinutes: 60,
      now: new Date('2026-08-28T12:00:00Z'),
    });

    expect(results).toEqual({ cartrack: 3, eagletrack: 7 });
    expect(counter.calls).toHaveLength(2);
  });

  it('calls recordStaleVehicles with the correct provider id and count for each provider', async () => {
    const counter = fakeCounter({ cartrack: 3, eagletrack: 7 });
    const recorder = fakeRecorder();

    await detectStaleVehicles({
      counter,
      recorder,
      listProviders: () => CARTRACK_EAGLETRACK,
      horizonMinutes: 60,
      now: new Date('2026-08-28T12:00:00Z'),
    });

    expect(recorder.calls).toEqual(
      expect.arrayContaining([
        { providerId: 'cartrack', count: 3 },
        { providerId: 'eagletrack', count: 7 },
      ])
    );
    expect(recorder.calls).toHaveLength(2);
  });

  it('derives the cutoff from `now` minus the horizon, in minutes', async () => {
    const counter = fakeCounter({ cartrack: 0 });
    const recorder = fakeRecorder();
    const now = new Date('2026-08-28T12:00:00Z');

    await detectStaleVehicles({
      counter,
      recorder,
      listProviders: () => [{ providerId: 'cartrack' }],
      horizonMinutes: 90,
      now,
    });

    expect(counter.calls[0].cutoff.getTime()).toBe(now.getTime() - 90 * 60_000);
  });

  it('uses the configured STALE_VEHICLE_HORIZON_MINUTES when no horizon is injected', async () => {
    const original = process.env.STALE_VEHICLE_HORIZON_MINUTES;
    process.env.STALE_VEHICLE_HORIZON_MINUTES = '45';
    try {
      const counter = fakeCounter({ cartrack: 0 });
      const recorder = fakeRecorder();
      const now = new Date('2026-08-28T12:00:00Z');

      await detectStaleVehicles({
        counter,
        recorder,
        listProviders: () => [{ providerId: 'cartrack' }],
        now,
      });

      expect(counter.calls[0].cutoff.getTime()).toBe(now.getTime() - 45 * 60_000);
    } finally {
      if (original === undefined) delete process.env.STALE_VEHICLE_HORIZON_MINUTES;
      else process.env.STALE_VEHICLE_HORIZON_MINUTES = original;
    }
  });

  it('isolates one provider failure so the sweep continues for the rest', async () => {
    const recorder = fakeRecorder();
    const counter: StaleVehicleCounter = {
      async countStaleDevicesByProvider(providerId: string): Promise<number> {
        if (providerId === 'cartrack') throw new Error('mongo timeout');
        return 4;
      },
    };

    const results = await detectStaleVehicles({
      counter,
      recorder,
      listProviders: () => CARTRACK_EAGLETRACK,
      horizonMinutes: 60,
      now: new Date('2026-08-28T12:00:00Z'),
    });

    // eagletrack still measured despite cartrack failing.
    expect(results).toEqual({ eagletrack: 4 });
    expect(recorder.calls).toEqual([{ providerId: 'eagletrack', count: 4 }]);
  });

  it('supports any number of registered providers, not just two', async () => {
    const counter = fakeCounter({ cartrack: 1, eagletrack: 2, thirdparty: 3 });
    const recorder = fakeRecorder();

    const results = await detectStaleVehicles({
      counter,
      recorder,
      listProviders: () => [
        { providerId: 'cartrack' },
        { providerId: 'eagletrack' },
        { providerId: 'thirdparty' },
      ],
      horizonMinutes: 60,
      now: new Date('2026-08-28T12:00:00Z'),
    });

    expect(results).toEqual({ cartrack: 1, eagletrack: 2, thirdparty: 3 });
  });
});

describe('PHASE 7 FOLLOW-UP: no tenant/vehicle label is ever added', () => {
  it('recordStaleVehicles is invoked with exactly (providerId, count) -- no third argument', async () => {
    const counter = fakeCounter({ cartrack: 5 });
    const calls: unknown[][] = [];
    const recorder: StaleVehicleRecorder = {
      recordStaleVehicles(...args: unknown[]) {
        calls.push(args);
      },
    };

    await detectStaleVehicles({
      counter,
      recorder,
      listProviders: () => [{ providerId: 'cartrack' }],
      horizonMinutes: 60,
      now: new Date('2026-08-28T12:00:00Z'),
    });

    expect(calls).toHaveLength(1);
    expect(calls[0]).toEqual(['cartrack', 5]);
  });

  it('the metrics registry gauge only declares a `provider` label', async () => {
    // Structural companion: even if a future edit tried to pass a
    // tenantId/vehicleId through to the gauge, the registry itself only
    // accepts the `provider` label name -- prom-client silently ignores
    // extra label keys that were never registered, so this is the real
    // enforcement point, not just the recorder's call signature.
    const { metricsRegistry } = await import('@/infrastructure/observability/metrics.registry');
    const gauge = metricsRegistry.telematicsStaleVehicles as unknown as {
      labelNames?: string[];
    };
    // prom-client stores configured label names on the metric instance.
    const labelNames = (gauge as any).labelNames ?? [];
    expect(labelNames).toEqual(['provider']);
    expect(labelNames).not.toContain('tenantId');
    expect(labelNames).not.toContain('vehicleId');
  });
});

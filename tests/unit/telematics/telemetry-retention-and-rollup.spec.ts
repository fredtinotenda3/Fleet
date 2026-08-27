// tests/unit/telematics/telemetry-retention-and-rollup.spec.ts
//
// PHASE 4, F-12 -- retention configuration and daily rollups.

import {
  resolveTelemetryRetentionConfig,
  resetTelemetryRetentionConfig,
  TelemetryRetentionConfigError,
  DEFAULT_RAW_RETENTION_DAYS,
  DEFAULT_ROLLUP_RETENTION_DAYS,
  MIN_RAW_RETENTION_DAYS,
} from '@/modules/telematics/services/telemetry-retention.config';
import {
  aggregateDay,
  aggregateReadings,
  dayBucket,
  RollupSourceReading,
} from '@/modules/telematics/services/telemetry-rollup.service';

const KEYS = [
  'TELEMETRY_RETENTION_DAYS',
  'TELEMETRY_ROLLUP_RETENTION_DAYS',
  'TELEMETRY_RETENTION_ENABLED',
] as const;

let saved: Record<string, string | undefined> = {};

beforeEach(() => {
  saved = {};
  for (const k of KEYS) {
    saved[k] = process.env[k];
    delete process.env[k];
  }
  resetTelemetryRetentionConfig();
});

afterEach(() => {
  for (const k of KEYS) {
    if (saved[k] === undefined) delete process.env[k];
    else process.env[k] = saved[k];
  }
  resetTelemetryRetentionConfig();
});

describe('F-12: retention configuration', () => {
  it('defaults to 90 days raw and 730 days rollup', () => {
    const config = resolveTelemetryRetentionConfig();
    expect(config.rawDays).toBe(DEFAULT_RAW_RETENTION_DAYS);
    expect(config.rollupDays).toBe(DEFAULT_ROLLUP_RETENTION_DAYS);
  });

  it('is enabled by default -- unbounded growth is not the safe default', () => {
    expect(resolveTelemetryRetentionConfig().enabled).toBe(true);
  });

  it('honours an explicit retention window', () => {
    process.env.TELEMETRY_RETENTION_DAYS = '180';
    expect(resolveTelemetryRetentionConfig().rawDays).toBe(180);
  });

  it('THROWS on a non-numeric value rather than silently defaulting', () => {
    // An operator who set 400 for a compliance requirement must not
    // discover the setting was ignored when the data is already deleted.
    process.env.TELEMETRY_RETENTION_DAYS = 'ninety';
    expect(() => resolveTelemetryRetentionConfig()).toThrow(TelemetryRetentionConfigError);
  });

  it('refuses a window below the safety floor', () => {
    // Guards a fat-fingered `=1` from destroying the history every
    // report in the platform reads.
    process.env.TELEMETRY_RETENTION_DAYS = String(MIN_RAW_RETENTION_DAYS - 1);
    expect(() => resolveTelemetryRetentionConfig()).toThrow(/>= 7/);
  });

  it('refuses rollups expiring BEFORE the raw data they summarise', () => {
    // Expiring the summary first leaves a permanent hole in every
    // long-range report while the detail is still present.
    process.env.TELEMETRY_RETENTION_DAYS = '90';
    process.env.TELEMETRY_ROLLUP_RETENTION_DAYS = '30';
    expect(() => resolveTelemetryRetentionConfig()).toThrow(/must be >=/);
  });

  it('accepts equal raw and rollup windows', () => {
    process.env.TELEMETRY_RETENTION_DAYS = '90';
    process.env.TELEMETRY_ROLLUP_RETENTION_DAYS = '90';
    expect(resolveTelemetryRetentionConfig().rollupDays).toBe(90);
  });
});

describe('F-12: daily rollup aggregation', () => {
  function reading(over: Partial<RollupSourceReading> = {}): RollupSourceReading {
    return {
      tenantId: 'tenant-a',
      orgUnitId: 'unit-harare',
      vehicleId: 'vehicle-1',
      timestamp: new Date('2026-08-20T09:00:00.000Z'),
      ...over,
    };
  }

  it('returns null for an empty day rather than a zero-filled row', () => {
    // A day with no readings did not happen. An all-zero row makes
    // "no data" and "no movement" indistinguishable in every chart.
    expect(aggregateDay([])).toBeNull();
  });

  it('computes distance from the odometer SPAN, not a sum of hops', () => {
    // Summing inter-fix distances under-counts systematically (a loop
    // between two fixes reads as going nowhere) and is corrupted by one
    // bad GPS point. The odometer is cumulative and authoritative.
    const rollup = aggregateDay([
      reading({ trip: { odometer: 100_000 } }),
      reading({ trip: { odometer: 100_120 } }),
      reading({ trip: { odometer: 100_085 } }),
    ])!;

    expect(rollup.distanceKm).toBe(120);
    expect(rollup.odometerStart).toBe(100_000);
    expect(rollup.odometerEnd).toBe(100_120);
  });

  it('omits distance when no fix reported an odometer', () => {
    // The Phase 1 rule holds in aggregates: a fabricated 0 is
    // indistinguishable from a vehicle that did not move, and
    // cost-per-km divides by this number.
    const rollup = aggregateDay([reading(), reading()])!;
    expect(rollup.distanceKm).toBeUndefined();
    expect(rollup.distanceKm).not.toBe(0);
  });

  it('omits distance when only ONE odometer reading exists', () => {
    // A single reading gives a span of 0, which would assert the vehicle
    // did not move when in truth we only know where it ended up.
    const rollup = aggregateDay([reading({ trip: { odometer: 100_000 } })])!;
    expect(rollup.distanceKm).toBeUndefined();
    expect(rollup.odometerEnd).toBe(100_000);
  });

  it('ignores a zero odometer, which is the fabricated-default signature', () => {
    // Letting a 0 into min() would make the day's distance the entire
    // vehicle lifetime.
    const rollup = aggregateDay([
      reading({ trip: { odometer: 0 } }),
      reading({ trip: { odometer: 100_000 } }),
      reading({ trip: { odometer: 100_050 } }),
    ])!;

    expect(rollup.odometerStart).toBe(100_000);
    expect(rollup.distanceKm).toBe(50);
  });

  it('computes max and mean speed from reported speeds only', () => {
    const rollup = aggregateDay([
      reading({ location: { speed: 40 } }),
      reading({ location: { speed: 80 } }),
      reading({}),
    ])!;

    expect(rollup.maxSpeedKmh).toBe(80);
    expect(rollup.avgSpeedKmh).toBe(60);
  });

  it('preserves a genuine zero speed in the mean', () => {
    const rollup = aggregateDay([
      reading({ location: { speed: 0 } }),
      reading({ location: { speed: 100 } }),
    ])!;
    expect(rollup.avgSpeedKmh).toBe(50);
  });

  it('sums fuel used and counts alerts and fixes', () => {
    const rollup = aggregateDay([
      reading({ fuel: { fuelUsed: 12.5 }, alerts: [{}, {}] }),
      reading({ fuel: { fuelUsed: 7.5 }, alerts: [{}] }),
    ])!;

    expect(rollup.fuelUsedLitres).toBe(20);
    expect(rollup.alertCount).toBe(3);
    expect(rollup.fixCount).toBe(2);
  });

  it('carries orgUnitId from the readings, never from a context', () => {
    // A rollup must be scoped exactly like the telemetry it summarises.
    const rollup = aggregateDay([reading({ orgUnitId: 'unit-bulawayo' })])!;
    expect(rollup.orgUnitId).toBe('unit-bulawayo');
  });

  it('records the first and last fix times for gap analysis', () => {
    const rollup = aggregateDay([
      reading({ timestamp: new Date('2026-08-20T18:00:00Z') }),
      reading({ timestamp: new Date('2026-08-20T06:00:00Z') }),
    ])!;

    expect(rollup.firstFixAt?.toISOString()).toBe('2026-08-20T06:00:00.000Z');
    expect(rollup.lastFixAt?.toISOString()).toBe('2026-08-20T18:00:00.000Z');
  });

  it('buckets days in UTC', () => {
    expect(dayBucket(new Date('2026-08-20T23:59:59Z')).toISOString()).toBe(
      '2026-08-20T00:00:00.000Z'
    );
  });

  it('NEVER merges two vehicles or two tenants into one rollup', () => {
    // The isolation guarantee for a job that reads cross-tenant.
    const rollups = aggregateReadings([
      reading({ tenantId: 'tenant-a', vehicleId: 'v1' }),
      reading({ tenantId: 'tenant-b', vehicleId: 'v2' }),
      reading({ tenantId: 'tenant-a', vehicleId: 'v1' }),
    ]);

    expect(rollups).toHaveLength(2);
    const a = rollups.find((r) => r.vehicleId === 'v1')!;
    expect(a.tenantId).toBe('tenant-a');
    expect(a.fixCount).toBe(2);
  });

  it('splits one vehicle across day boundaries', () => {
    const rollups = aggregateReadings([
      reading({ timestamp: new Date('2026-08-20T23:00:00Z') }),
      reading({ timestamp: new Date('2026-08-21T01:00:00Z') }),
    ]);

    expect(rollups).toHaveLength(2);
    expect(rollups.map((r) => r.day.toISOString()).sort()).toEqual([
      '2026-08-20T00:00:00.000Z',
      '2026-08-21T00:00:00.000Z',
    ]);
  });

  it('is deterministic', () => {
    const readings = [
      reading({ trip: { odometer: 100 }, location: { speed: 10 } }),
      reading({ trip: { odometer: 200 }, location: { speed: 20 } }),
    ];
    const runs = Array.from({ length: 10 }, () => JSON.stringify(aggregateDay(readings)));
    expect(new Set(runs).size).toBe(1);
  });
});

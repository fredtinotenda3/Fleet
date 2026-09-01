// tests/security/telemetry-daily-summary-rollup.spec.ts
//
// BACKLOG ITEM 5 -- the EXISTING aggregate read path, migrated.
//
// `getDailySummaryInScope` is the repository's per-day aggregate. It
// read `tbltelematics` unconditionally, so for any day older than
// TELEMETRY_RETENTION_DAYS it returned `null` -- which a caller cannot
// tell apart from "that vehicle did not report that day".
//
// It now falls back to the day's rollup row, and STAMPS the answer with
// `source` so the substitution is never silent. This suite also pins
// the scope predicate on the new rollup read, because an aggregate that
// forgets it is exactly how this codebase has leaked three times.

import { FakeCollection } from '../helpers/fake-collection';
import { telematicsRepository } from '@/modules/telematics/repositories/telematics.repository';
import { resetTelemetryRetentionConfig } from '@/modules/telematics/services/telemetry-retention.config';
import type { TenantContext } from '@/modules/tenancy/services/tenant-context.service';

const TENANT = 'willsgrove-farm-enterprises-9e80ed';
const HARARE = 'unit-harare';
const BULAWAYO = 'unit-bulawayo';

/** now = 2026-09-01T12:00Z with 90-day retention -> raw boundary 2026-06-04. */
const NOW = new Date('2026-09-01T12:00:00Z');
const OLD_DAY = new Date('2026-03-15T00:00:00Z');
const RECENT_DAY = new Date('2026-08-20T00:00:00Z');

function context(accessibleOrgUnitIds: string[] | null): TenantContext {
  return {
    organizationId: TENANT,
    organizationName: 'Willsgrove',
    accessibleOrgUnitIds,
    assignedOrgUnitIds: accessibleOrgUnitIds ?? [],
    isPlatformScope: false,
  } as unknown as TenantContext;
}

let rollups: FakeCollection;
let historyCalls: unknown[][];

beforeEach(() => {
  process.env.TELEMETRY_RETENTION_DAYS = '90';
  process.env.TELEMETRY_ROLLUP_RETENTION_DAYS = '730';
  resetTelemetryRetentionConfig();

  rollups = new FakeCollection();
  rollups.seed([
    {
      tenantId: TENANT,
      vehicleId: 'v-harare',
      orgUnitId: HARARE,
      day: new Date('2026-03-15T00:00:00Z'),
      fixCount: 1700,
      distanceKm: 142.5,
      maxSpeedKmh: 96,
      avgSpeedKmh: 41,
      fuelUsedLitres: 18.2,
      alertCount: 3,
      isDeleted: false,
    },
    {
      tenantId: TENANT,
      vehicleId: 'v-bulawayo',
      orgUnitId: BULAWAYO,
      day: new Date('2026-03-15T00:00:00Z'),
      fixCount: 1500,
      distanceKm: 88,
      alertCount: 1,
      isDeleted: false,
    },
  ]);

  (telematicsRepository as unknown as { getDb: () => Promise<unknown> }).getDb = async () => ({
    collection: () => rollups,
  });

  historyCalls = [];
  (
    telematicsRepository as unknown as {
      getTelematicsHistoryInScope: (...args: unknown[]) => Promise<unknown[]>;
    }
  ).getTelematicsHistoryInScope = async (...args: unknown[]) => {
    historyCalls.push(args);
    return [
      {
        timestamp: new Date('2026-08-20T09:00:00Z'),
        trip: { odometer: 2100, tripDuration: 3600 },
        location: { speed: 70 },
        fuel: { fuelUsed: 9 },
        alerts: [],
      },
      {
        timestamp: new Date('2026-08-20T08:00:00Z'),
        trip: { odometer: 2000, tripDuration: 0 },
        location: { speed: 50 },
        alerts: [],
      },
    ];
  };
});

afterEach(() => {
  delete process.env.TELEMETRY_RETENTION_DAYS;
  delete process.env.TELEMETRY_ROLLUP_RETENTION_DAYS;
  resetTelemetryRetentionConfig();
});

describe('getDailySummaryInScope', () => {
  it('INSIDE retention: still reads raw detail, marked source=raw', async () => {
    const summary = await telematicsRepository.getDailySummaryInScope(
      'v-harare',
      RECENT_DAY,
      context([HARARE]),
      NOW
    );

    expect(summary).not.toBeNull();
    expect(summary!.source).toBe('raw');
    expect(summary!.dataPoints).toBe(2);
    expect(summary!.totalDistance).toBe(100);
    // Trip duration exists on raw fixes and is reported.
    expect(summary!.totalDuration).toBe(3600);
    expect(historyCalls).toHaveLength(1);
  });

  it('OUTSIDE retention: answers from the rollup instead of returning null', async () => {
    const summary = await telematicsRepository.getDailySummaryInScope(
      'v-harare',
      OLD_DAY,
      context([HARARE]),
      NOW
    );

    expect(summary).not.toBeNull();
    // Before this change: null, indistinguishable from "did not report".
    expect(summary!.source).toBe('rollup');
    expect(summary!.totalDistance).toBe(142.5);
    expect(summary!.maxSpeed).toBe(96);
    expect(summary!.fuelUsed).toBe(18.2);
    expect(summary!.alertCount).toBe(3);
    // The fix count the rollup RECORDED, not rows read now.
    expect(summary!.dataPoints).toBe(1700);
    // A rollup carries no trip duration. Absent, not a fabricated 0 --
    // "0 hours" for a day the vehicle drove 142 km is a wrong number
    // that reads as a real one.
    expect(summary!.totalDuration).toBeUndefined();
    // No raw read was attempted for an expired day.
    expect(historyCalls).toHaveLength(0);
  });

  it('the rollup read is org-unit scoped: another branch s day is not visible', async () => {
    const summary = await telematicsRepository.getDailySummaryInScope(
      'v-bulawayo',
      OLD_DAY,
      context([HARARE]),
      NOW
    );

    expect(summary).toBeNull();
  });

  it('an org-wide caller sees both branches', async () => {
    const harare = await telematicsRepository.getDailySummaryInScope(
      'v-harare',
      OLD_DAY,
      context(null),
      NOW
    );
    const bulawayo = await telematicsRepository.getDailySummaryInScope(
      'v-bulawayo',
      OLD_DAY,
      context(null),
      NOW
    );

    expect(harare!.totalDistance).toBe(142.5);
    expect(bulawayo!.totalDistance).toBe(88);
  });

  it('spreads the scope predicate LAST, so it owns the orgUnitId key', async () => {
    await telematicsRepository.getDailyRollupsInScope(
      'v-harare',
      new Date('2026-03-01T00:00:00Z'),
      new Date('2026-04-01T00:00:00Z'),
      context([HARARE])
    );

    const filter = rollups.seenFilters[rollups.seenFilters.length - 1] as Record<string, unknown>;
    expect(filter.tenantId).toBe(TENANT);
    expect(filter.orgUnitId).toEqual({ $in: [HARARE] });
    // Half-open on `day`: an inclusive upper bound would put the
    // boundary day in both halves of a mixed window.
    expect(filter.day).toEqual({
      $gte: new Date('2026-03-01T00:00:00Z'),
      $lt: new Date('2026-04-01T00:00:00Z'),
    });
  });

  it('returns null for an expired day with no rollup row, rather than inventing one', async () => {
    const summary = await telematicsRepository.getDailySummaryInScope(
      'v-harare',
      new Date('2026-02-01T00:00:00Z'),
      context([HARARE]),
      NOW
    );

    // Rollups accrue from the first nightly run forward (P4-N3), so a
    // day before that genuinely has nothing. An absent rollup is honest;
    // a zero-filled one is not.
    expect(summary).toBeNull();
  });
});

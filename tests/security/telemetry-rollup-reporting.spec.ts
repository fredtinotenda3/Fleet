// tests/security/telemetry-rollup-reporting.spec.ts
//
// BACKLOG ITEM 5 (audit finding P4-N1).
//
// THE DEFECT: raw telemetry expires after TELEMETRY_RETENTION_DAYS.
// Daily rollups were added alongside it and retained for two years --
// and nothing read them. So a report over last March queried
// `tbltelematics`, found nothing, and answered zero distance. A zero
// meaning "we deleted it" is indistinguishable from a zero meaning "it
// did not move".
//
// The three cases the brief names are each asserted directly:
//   * a window INSIDE retention still reads raw detail;
//   * a window OUTSIDE it reads rollups -- and says so;
//   * a window that STRADDLES the horizon reads both, with each day
//     counted exactly once.
//
// Plus the constraint that makes the fix acceptable at all: nothing is
// substituted silently. Every non-raw answer carries `dataSource`,
// `granularity` and a notice.

import {
  planTelemetryWindow,
  windowPredatesRawRetention,
} from '@/modules/telematics/services/telemetry-window';
import type { TelemetryRetentionConfig } from '@/modules/telematics/services/telemetry-retention.config';

const CONFIG: TelemetryRetentionConfig = { rawDays: 90, rollupDays: 730, enabled: true };

/** 2026-09-01T12:00:00Z. Raw boundary lands on 2026-06-04. */
const NOW = new Date('2026-09-01T12:00:00Z');

function d(iso: string): Date {
  return new Date(iso);
}

// ─────────────────────────────────────────────────────────────────────
describe('window planning', () => {
  it('INSIDE retention: reads raw, with nothing to warn about', () => {
    const plan = planTelemetryWindow(d('2026-08-01T00:00:00Z'), d('2026-08-08T00:00:00Z'), NOW, CONFIG);

    expect(plan.mode).toBe('raw');
    expect(plan.rawFrom).toEqual(d('2026-08-01T00:00:00Z'));
    expect(plan.rollupFrom).toBeUndefined();
    // A fully-raw window is the normal case and must not be cluttered
    // with a caveat that does not apply to it.
    expect(plan.notices).toEqual([]);
  });

  it('OUTSIDE retention: reads rollups and says the result is an aggregate', () => {
    const plan = planTelemetryWindow(d('2026-03-01T00:00:00Z'), d('2026-04-01T00:00:00Z'), NOW, CONFIG);

    expect(plan.mode).toBe('rollup');
    expect(plan.rollupFrom).toEqual(d('2026-03-01T00:00:00Z'));
    expect(plan.rawFrom).toBeUndefined();
    expect(plan.notices.join(' ')).toMatch(/per-day aggregate, not per-fix detail/);
  });

  it('STRADDLING the horizon: splits at a UTC day boundary, each day counted once', () => {
    const plan = planTelemetryWindow(d('2026-05-01T00:00:00Z'), d('2026-07-01T00:00:00Z'), NOW, CONFIG);

    expect(plan.mode).toBe('mixed');
    // The two halves meet exactly, with no overlap and no gap. An
    // overlap would double-count a day; a gap would lose one, and both
    // would be invisible in the total.
    expect(plan.rollupTo).toEqual(plan.rawFrom);
    expect(plan.rollupFrom).toEqual(d('2026-05-01T00:00:00Z'));
    expect(plan.rawTo).toEqual(d('2026-07-01T00:00:00Z'));
    expect(plan.notices.join(' ')).toMatch(/spans the 90-day raw retention horizon/);
  });

  it('the boundary is a whole UTC day, so no day is split between the two stores', () => {
    const plan = planTelemetryWindow(d('2026-01-01T00:00:00Z'), NOW, NOW, CONFIG);
    const boundary = plan.rawBoundary;

    expect(boundary.getUTCHours()).toBe(0);
    expect(boundary.getUTCMinutes()).toBe(0);
    expect(boundary.getUTCSeconds()).toBe(0);
    expect(boundary.getUTCMilliseconds()).toBe(0);
  });

  it('the day containing the cutoff goes to the ROLLUP, not to a half-expired raw read', () => {
    // now - 90d = 2026-06-03T12:00Z, so 2026-06-03's raw fixes are
    // partially deleted. Reading them raw would return a real-looking
    // partial day with no sign that it is partial.
    const plan = planTelemetryWindow(d('2026-06-03T00:00:00Z'), d('2026-06-05T00:00:00Z'), NOW, CONFIG);

    expect(plan.rawBoundary).toEqual(d('2026-06-04T00:00:00Z'));
    expect(plan.mode).toBe('mixed');
    expect(plan.rollupFrom).toEqual(d('2026-06-03T00:00:00Z'));
    expect(plan.rollupTo).toEqual(d('2026-06-04T00:00:00Z'));
  });

  it('a window ending exactly ON the boundary is all rollup', () => {
    const plan = planTelemetryWindow(d('2026-05-01T00:00:00Z'), d('2026-06-04T00:00:00Z'), NOW, CONFIG);
    expect(plan.mode).toBe('rollup');
  });

  it('a window starting exactly ON the boundary is all raw', () => {
    const plan = planTelemetryWindow(d('2026-06-04T00:00:00Z'), d('2026-07-01T00:00:00Z'), NOW, CONFIG);
    expect(plan.mode).toBe('raw');
  });

  it('beyond BOTH horizons: reports unavailable rather than an empty aggregate', () => {
    const plan = planTelemetryWindow(d('2023-01-01T00:00:00Z'), d('2023-02-01T00:00:00Z'), NOW, CONFIG);

    expect(plan.mode).toBe('unavailable');
    // "Nothing is stored" and "the vehicle did not move" must not look
    // the same, which is the whole finding.
    expect(plan.notices.join(' ')).toMatch(/No telemetry is stored/);
  });

  it('truncates at the rollup horizon and says so, rather than implying full coverage', () => {
    const plan = planTelemetryWindow(d('2023-01-01T00:00:00Z'), d('2026-07-01T00:00:00Z'), NOW, CONFIG);

    expect(plan.mode).toBe('mixed');
    expect(plan.rollupFrom!.getTime()).toBeGreaterThanOrEqual(plan.rollupBoundary.getTime());
    expect(plan.notices.join(' ')).toMatch(/Window truncated/);
  });

  it('with retention disabled, everything is raw', () => {
    const plan = planTelemetryWindow(d('2020-01-01T00:00:00Z'), NOW, NOW, {
      ...CONFIG,
      enabled: false,
    });
    expect(plan.mode).toBe('raw');
    expect(plan.notices).toEqual([]);
  });

  it('an empty window is a no-op, not an error', () => {
    const plan = planTelemetryWindow(d('2026-08-01T00:00:00Z'), d('2026-08-01T00:00:00Z'), NOW, CONFIG);
    expect(plan.mode).toBe('raw');
  });

  it('windowPredatesRawRetention answers the detail paths question', () => {
    expect(windowPredatesRawRetention(d('2026-03-01T00:00:00Z'), NOW, CONFIG)).toBe(true);
    expect(windowPredatesRawRetention(d('2026-08-01T00:00:00Z'), NOW, CONFIG)).toBe(false);
    expect(windowPredatesRawRetention(d('2020-01-01T00:00:00Z'), NOW, { ...CONFIG, enabled: false })).toBe(
      false
    );
  });
});

// ─────────────────────────────────────────────────────────────────────
describe('summaries are marked, never silently substituted', () => {
  const mockRepo = {
    getDailyRollupsInScope: jest.fn(),
    getTelematicsHistoryInScope: jest.fn(),
  };

  jest.mock('@/modules/telematics/repositories/telematics.repository', () => ({
    telematicsRepository: mockRepo,
  }));

  // eslint-disable-next-line @typescript-eslint/no-var-requires
  const { TelemetryReportingService } = require('@/modules/telematics/services/telemetry-reporting.service');

  const context = {
    organizationId: 'tenant-a',
    organizationName: 'A',
    accessibleOrgUnitIds: ['unit-harare'],
    assignedOrgUnitIds: ['unit-harare'],
    isPlatformScope: false,
  } as never;

  const service = new TelemetryReportingService();

  beforeEach(() => {
    jest.clearAllMocks();
    process.env.TELEMETRY_RETENTION_DAYS = '90';
    process.env.TELEMETRY_ROLLUP_RETENTION_DAYS = '730';
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    require('@/modules/telematics/services/telemetry-retention.config').resetTelemetryRetentionConfig();
  });

  afterEach(() => {
    delete process.env.TELEMETRY_RETENTION_DAYS;
    delete process.env.TELEMETRY_ROLLUP_RETENTION_DAYS;
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    require('@/modules/telematics/services/telemetry-retention.config').resetTelemetryRetentionConfig();
  });

  it('inside the window: raw detail, granularity fix, no rollup read at all', async () => {
    mockRepo.getTelematicsHistoryInScope.mockResolvedValue([
      { timestamp: d('2026-08-02T08:00:00Z'), trip: { odometer: 1000 }, location: { speed: 60 }, alerts: [] },
      { timestamp: d('2026-08-02T09:00:00Z'), trip: { odometer: 1080 }, location: { speed: 80 }, alerts: [{}] },
    ]);

    const summary = await service.getVehicleWindowSummaryInScope(
      'v-1',
      d('2026-08-01T00:00:00Z'),
      d('2026-08-08T00:00:00Z'),
      context,
      NOW
    );

    expect(summary.dataSource).toBe('raw');
    expect(summary.granularity).toBe('fix');
    expect(summary.distanceKm).toBe(80);
    expect(summary.maxSpeedKmh).toBe(80);
    expect(summary.fixCount).toBe(2);
    expect(summary.rollupDays).toBeUndefined();
    expect(mockRepo.getDailyRollupsInScope).not.toHaveBeenCalled();
  });

  it('outside the window: rollup aggregate, explicitly marked', async () => {
    mockRepo.getDailyRollupsInScope.mockResolvedValue([
      { day: d('2026-03-01T00:00:00Z'), distanceKm: 120, maxSpeedKmh: 95, avgSpeedKmh: 40, alertCount: 2, fixCount: 1700 },
      { day: d('2026-03-02T00:00:00Z'), distanceKm: 80, maxSpeedKmh: 88, avgSpeedKmh: 30, alertCount: 1, fixCount: 1650 },
    ]);

    const summary = await service.getVehicleWindowSummaryInScope(
      'v-1',
      d('2026-03-01T00:00:00Z'),
      d('2026-03-03T00:00:00Z'),
      context,
      NOW
    );

    expect(summary.dataSource).toBe('rollup');
    expect(summary.granularity).toBe('day');
    expect(summary.distanceKm).toBe(200);
    expect(summary.maxSpeedKmh).toBe(95);
    expect(summary.alertCount).toBe(3);
    expect(summary.rollupDays).toBe(2);
    // No raw read happened, so there is no honest fix count to report.
    // A 0 here would assert the vehicle produced no fixes that month.
    expect(summary.fixCount).toBeUndefined();
    expect(summary.notices.join(' ')).toMatch(/aggregate, not per-fix detail/);
    expect(mockRepo.getTelematicsHistoryInScope).not.toHaveBeenCalled();
  });

  it('straddling: reads both, marks the result mixed, and does not overlap the two reads', async () => {
    mockRepo.getDailyRollupsInScope.mockResolvedValue([
      { day: d('2026-05-02T00:00:00Z'), distanceKm: 100, alertCount: 1 },
    ]);
    mockRepo.getTelematicsHistoryInScope.mockResolvedValue([
      { timestamp: d('2026-06-05T08:00:00Z'), trip: { odometer: 5000 }, location: { speed: 50 }, alerts: [] },
      { timestamp: d('2026-06-05T09:00:00Z'), trip: { odometer: 5050 }, location: { speed: 70 }, alerts: [] },
    ]);

    const summary = await service.getVehicleWindowSummaryInScope(
      'v-1',
      d('2026-05-01T00:00:00Z'),
      d('2026-07-01T00:00:00Z'),
      context,
      NOW
    );

    expect(summary.dataSource).toBe('mixed');
    expect(summary.granularity).toBe('mixed');
    expect(summary.distanceKm).toBe(150);
    expect(summary.rollupDays).toBe(1);
    expect(summary.fixCount).toBe(2);

    const [, rollupFrom, rollupTo] = mockRepo.getDailyRollupsInScope.mock.calls[0];
    const [, rawFrom, rawTo] = mockRepo.getTelematicsHistoryInScope.mock.calls[0];

    // The rollup read is half-open up to the boundary; the raw read
    // starts AT the boundary and stops a millisecond short of the end
    // (the history read is inclusive). No instant is in both.
    expect(rollupTo).toEqual(rawFrom);
    expect(rollupFrom).toEqual(d('2026-05-01T00:00:00Z'));
    expect((rawTo as Date).getTime()).toBe(d('2026-07-01T00:00:00Z').getTime() - 1);
  });

  it('beyond both horizons: reports unavailable rather than a confident zero', async () => {
    const summary = await service.getVehicleWindowSummaryInScope(
      'v-1',
      d('2023-01-01T00:00:00Z'),
      d('2023-02-01T00:00:00Z'),
      context,
      NOW
    );

    expect(summary.dataSource).toBe('unavailable');
    expect(summary.granularity).toBe('none');
    // Absent, not zero. A 0 km month reads as a parked vehicle.
    expect(summary.distanceKm).toBeUndefined();
    expect(summary.notices.join(' ')).toMatch(/No telemetry is stored/);
    expect(mockRepo.getDailyRollupsInScope).not.toHaveBeenCalled();
    expect(mockRepo.getTelematicsHistoryInScope).not.toHaveBeenCalled();
  });

  it('passes the caller context into BOTH reads, so the aggregate is scoped like the rows', async () => {
    mockRepo.getDailyRollupsInScope.mockResolvedValue([]);
    mockRepo.getTelematicsHistoryInScope.mockResolvedValue([]);

    await service.getVehicleWindowSummaryInScope(
      'v-1',
      d('2026-05-01T00:00:00Z'),
      d('2026-07-01T00:00:00Z'),
      context,
      NOW
    );

    // The recurring trap in this codebase: the list is filtered and the
    // total is not. Both reads must carry the scope.
    expect(mockRepo.getDailyRollupsInScope.mock.calls[0][3]).toBe(context);
    expect(mockRepo.getTelematicsHistoryInScope.mock.calls[0][3]).toBe(context);
  });

  it('reports a truncated raw read instead of returning a silent undercount', async () => {
    const readings = Array.from({ length: 20_000 }, (_, i) => ({
      timestamp: d('2026-08-02T08:00:00Z'),
      trip: { odometer: 1000 + i },
      location: { speed: 10 },
      alerts: [],
    }));
    mockRepo.getTelematicsHistoryInScope.mockResolvedValue(readings);

    const summary = await service.getVehicleWindowSummaryInScope(
      'v-1',
      d('2026-08-01T00:00:00Z'),
      d('2026-08-08T00:00:00Z'),
      context,
      NOW
    );

    expect(summary.notices.join(' ')).toMatch(/truncated/);
  });
});

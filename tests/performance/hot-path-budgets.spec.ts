// tests/performance/hot-path-budgets.spec.ts
//
// HARDENING (item 4) -- replacing `echo "no performance suite yet"`.
//
// ---------------------------------------------------------------------
// WHAT THIS IS, AND DELIBERATELY IS NOT
// ---------------------------------------------------------------------
// These are SMOKE TESTS with generous budgets, not benchmarks. They
// exist to catch a change that makes a hot path catastrophically slower
// -- an accidental O(n^2), a synchronous parse in a per-ping loop, a
// regex that backtracks -- not to measure performance.
//
// No benchmark framework was added. Jest plus `performance.now()` is
// enough for "did this get 100x worse", and a benchmark framework would
// bring statistical machinery whose output nobody would read and whose
// variance would make CI flaky.
//
// ---------------------------------------------------------------------
// WHY THE BUDGETS ARE SO GENEROUS
// ---------------------------------------------------------------------
// A CI runner is a shared, noisy, unpredictable machine. A tight budget
// on such a box produces a flaky test, and a flaky performance test is
// worse than none: it trains everybody to re-run the pipeline, which is
// exactly the habit that lets a real regression through.
//
// Every budget below is set roughly 20-50x above the measured local
// figure. A failure therefore means something is genuinely, structurally
// wrong -- not that the runner was busy.
//
// ---------------------------------------------------------------------
// ONLY PURE PATHS ARE MEASURED
// ---------------------------------------------------------------------
// Nothing here touches Mongo, Redis or the network. Those would measure
// the environment rather than the code, and would make this suite
// non-deterministic -- which is the one property a CI performance test
// cannot afford to lose.
//
// The paths chosen are the ones the audit identified as per-ping or
// per-record hot loops.

import {
  boundingBoxFor,
  isPointInBox,
  candidatesFor,
  getCachedGeofences,
  resetGeofenceCache,
  CachedGeofence,
} from '@/modules/telematics/services/geofence-evaluation';
import { Geofence } from '@/modules/telematics/types/telematics.types';
import {
  normaliseTimestamp,
  normaliseNumber,
  normaliseHeading,
} from '@/modules/telematics/providers/canonical-telemetry';
import { aggregateReadings } from '@/modules/telematics/services/telemetry-rollup.service';
import { resolveOdometer } from '@/modules/telematics/services/odometer-reconciliation';
import { buildWorkflowIdempotencyKey } from '@/modules/workflows/services/workflow-idempotency';
import { ndjsonLines } from '@/infrastructure/storage/backup-stream';
import { asyncIterationBudget, syncBudget } from '../helpers/perf-calibration';

/** Measures a synchronous block, in milliseconds. */
function measure(fn: () => void): number {
  const start = performance.now();
  fn();
  return performance.now() - start;
}

async function measureAsync(fn: () => Promise<void>): Promise<number> {
  const start = performance.now();
  await fn();
  return performance.now() - start;
}

function circle(lat: number, lng: number, radius = 500): Geofence {
  return {
    _id: `g-${lat}-${lng}`,
    name: 'Site',
    type: 'circle',
    coordinates: { center: { lat, lng }, radius },
    active: true,
    alerts: { entry: true, exit: true, inside: false },
    tenantId: 'tenant-a',
  } as unknown as Geofence;
}

describe('Performance: geofence evaluation is cheap enough for every ping', () => {
  beforeEach(() => resetGeofenceCache());

  it('prefilters 500 geofences against 1000 pings well inside budget', async () => {
    // The audit's F-13: this runs on EVERY location fix. At 1,000
    // vehicles on a 50-second cadence that is ~1,200 evaluations/minute,
    // so the per-call cost has to be trivial.
    const geofences = Array.from({ length: 500 }, (_, i) =>
      circle(-17.8 + i * 0.01, 31.0 + i * 0.01)
    );

    const cached: CachedGeofence[] = await getCachedGeofences(
      'tenant-a',
      async () => geofences
    );

    const elapsed = measure(() => {
      for (let i = 0; i < 1000; i += 1) {
        candidatesFor(cached, { lat: -17.82 + i * 0.0001, lng: 31.05 });
      }
    });

    // 500 boxes x 1000 pings = 500k comparisons. Budget derived from
    // this machine's own speed rather than a fixed figure -- see
    // tests/helpers/perf-calibration.ts for why every budget in this
    // file is relative now.
    expect(elapsed).toBeLessThan(await syncBudget(500_000, 3));
  });

  it('serves a warm cache without re-invoking the loader', async () => {
    // The cache is what turns 2 Mongo queries per ping into 0. If it
    // stopped working the functional tests would still pass and only
    // the database would notice.
    let loads = 0;
    const loader = async () => {
      loads += 1;
      return [circle(-17.82, 31.05)];
    };

    const elapsed = await measureAsync(async () => {
      for (let i = 0; i < 5000; i += 1) {
        await getCachedGeofences('tenant-a', loader);
      }
    });

    expect(loads).toBe(1);
    // 5,000 awaits. Async-iteration cost, so calibrated against that.
    expect(elapsed).toBeLessThan(await asyncIterationBudget(5_000, 20));
  });

  it('computes a bounding box in constant time regardless of polygon size', async () => {
    // Boxes are computed once per cache fill, but a pathological
    // implementation here would stall every refresh.
    const points = Array.from({ length: 10_000 }, (_, i) => ({
      lat: -17.8 + (i % 100) * 0.001,
      lng: 31.0 + (i % 100) * 0.001,
    }));

    const polygon = {
      _id: 'p1',
      type: 'polygon',
      coordinates: { points },
      active: true,
      alerts: { entry: true, exit: true, inside: false },
    } as unknown as Geofence;

    const elapsed = measure(() => {
      for (let i = 0; i < 50; i += 1) boundingBoxFor(polygon);
    });

    // 50 x 10,000 points visited.
    expect(elapsed).toBeLessThan(await syncBudget(500_000, 3));
  });

  it('point-in-box is effectively free', async () => {
    const box = boundingBoxFor(circle(-17.82, 31.05))!;
    const elapsed = measure(() => {
      for (let i = 0; i < 1_000_000; i += 1) {
        isPointInBox({ lat: -17.82, lng: 31.05 }, box);
      }
    });

    // Four float comparisons per call -- far cheaper than a calibration
    // iteration, so a tolerance below 1 still leaves large headroom.
    expect(elapsed).toBeLessThan(await syncBudget(1_000_000, 0.5));
  });
});

describe('Performance: telemetry normalisation runs per reading', () => {
  it('normalises 100k values within budget', async () => {
    // Called several times per reading, on every reading, from both
    // adapters.
    const elapsed = measure(() => {
      for (let i = 0; i < 100_000; i += 1) {
        normaliseNumber('42.5');
        normaliseHeading(370);
      }
    });

    expect(elapsed).toBeLessThan(await syncBudget(200_000, 3));
  });

  it('parses 50k provider timestamps within budget', async () => {
    // normaliseTimestamp does regex work on the zone-less provider
    // format. A backtracking regex here would stall ingestion.
    const elapsed = measure(() => {
      for (let i = 0; i < 50_000; i += 1) {
        normaliseTimestamp('2026-08-20 09:15:00');
        normaliseTimestamp('2026-08-20T09:15:00.000Z');
      }
    });

    expect(elapsed).toBeLessThan(await syncBudget(100_000, 5));
  });

  it('rejects a malformed timestamp as fast as it accepts a valid one', () => {
    // Guards against catastrophic backtracking on hostile input -- the
    // classic way a parser becomes a denial of service.
    const valid = measure(() => {
      for (let i = 0; i < 20_000; i += 1) normaliseTimestamp('2026-08-20 09:15:00');
    });
    const malformed = measure(() => {
      for (let i = 0; i < 20_000; i += 1) {
        normaliseTimestamp('2026-08-20 09:15:00' + 'x'.repeat(200));
      }
    });

    // Not "as fast", but within an order of magnitude. A backtracking
    // blowup is thousands of times slower, not twice.
    expect(malformed).toBeLessThan(Math.max(valid * 50, 2000));
  });
});

describe('Performance: rollup aggregation scales with a fleet-day', () => {
  it('aggregates one vehicle-day of readings within budget', async () => {
    // ~1,700 readings/vehicle/day at the platform's poll cadence. The
    // rollup worker flushes per vehicle, so this is the real unit of
    // work.
    const readings = Array.from({ length: 1700 }, (_, i) => ({
      tenantId: 'tenant-a',
      orgUnitId: 'unit-harare',
      vehicleId: 'vehicle-1',
      timestamp: new Date(Date.UTC(2026, 7, 20, 0, 0, i % 60)),
      location: { speed: 40 + (i % 30) },
      trip: { odometer: 100_000 + i },
    }));

    const elapsed = measure(() => {
      aggregateReadings(readings);
    });

    expect(elapsed).toBeLessThan(await syncBudget(1_700, 20));
  });

  it('groups 50 vehicles without quadratic blow-up', async () => {
    // The bucketing is a Map, so this should be linear. A nested scan
    // would show up here as a 50x cliff rather than a 50x cost.
    const readings = Array.from({ length: 50 * 200 }, (_, i) => ({
      tenantId: 'tenant-a',
      vehicleId: `vehicle-${i % 50}`,
      timestamp: new Date(Date.UTC(2026, 7, 20, 0, 0, i % 60)),
      trip: { odometer: 100_000 + i },
    }));

    const elapsed = measure(() => {
      const rollups = aggregateReadings(readings);
      expect(rollups).toHaveLength(50);
    });

    expect(elapsed).toBeLessThan(await syncBudget(10_000, 20));
  });
});

describe('Performance: per-record guards', () => {
  it('resolves 200k odometer readings within budget', async () => {
    // Runs on every digital-twin read.
    const elapsed = measure(() => {
      for (let i = 0; i < 200_000; i += 1) {
        resolveOdometer(100_000 + i, 100_000);
      }
    });

    // Comparison + object construction per call.
    expect(elapsed).toBeLessThan(await syncBudget(200_000, 3));
  });

  it('builds 20k idempotency keys within budget', async () => {
    // SHA-256 per automated workflow start. Not free, but must not be
    // the bottleneck in an event-handling loop.
    const elapsed = measure(() => {
      for (let i = 0; i < 20_000; i += 1) {
        buildWorkflowIdempotencyKey({
          source: 'event',
          workflowId: 'wf-1',
          entityId: `exp-${i}`,
          entityType: 'expense',
          causeId: `evt-${i}`,
        });
      }
    });

    // SHA-256 is materially more expensive than a calibration
    // iteration, hence the larger tolerance.
    expect(elapsed).toBeLessThan(await syncBudget(20_000, 30));
  });
});

describe('Performance: the backup writer stays streaming', () => {
  /**
   * THIS TEST USED TO BE THE FLAKY ONE.
   *
   * It consumed 50,000 documents and asserted `elapsed < 5000`. That
   * measured 73 ms on the CI sandbox and 8,568 ms on a developer's
   * Windows laptop -- a 117x spread for identical, correct code. The
   * cost is `for await` overhead (50,000 microtask ticks), which a
   * throttled VM or an on-access virus scanner multiplies in a way a
   * straight CPU loop never shows.
   *
   * The property being defended is LAZINESS -- that `ndjsonLines` stayed
   * a generator and did not go back to building a `string[]`. Wall-clock
   * time was only ever a proxy for that, and a bad one.
   *
   * So the property is now asserted DIRECTLY, and deterministically:
   * a buffering implementation must exhaust its source before it can
   * yield anything, so consuming ONE line from a 50,000-document source
   * must not have pulled 50,000 documents. That assertion cannot be
   * affected by machine speed at all.
   *
   * The timing check is kept as a secondary smoke test, but calibrated
   * against this machine's own async-iteration cost rather than an
   * absolute figure, and over 5,000 documents rather than 50,000.
   */
  const makeSource = (count: number, onProduce: () => void) => ({
    async *[Symbol.asyncIterator]() {
      for (let i = 0; i < count; i += 1) {
        onProduce();
        yield { _id: `d-${i}`, value: i, payload: 'x'.repeat(50) };
      }
    },
  });

  it('yields the first line without draining the source (the laziness property)', async () => {
    // Deterministic. No timing. This is the assertion that actually
    // catches the regression the whole test exists for: reintroducing
    // `const lines: string[] = []` makes `produced` equal 50,000 here.
    let produced = 0;
    const documents = makeSource(50_000, () => {
      produced += 1;
    });

    for await (const line of ndjsonLines([{ name: 'tbltest', documents }])) {
      expect(line.endsWith('\n')).toBe(true);
      break; // take exactly one
    }

    // A generator holds one document at a time. Allow a small margin for
    // any internal read-ahead rather than pinning it to exactly 1.
    expect(produced).toBeLessThanOrEqual(10);
  });

  it('produces every line exactly once, within a machine-relative budget', async () => {
    const COUNT = 5_000;
    let produced = 0;
    const documents = makeSource(COUNT, () => {
      produced += 1;
    });

    let emitted = 0;
    const elapsed = await measureAsync(async () => {
      for await (const line of ndjsonLines([{ name: 'tbltest', documents }])) {
        emitted += line.length > 0 ? 1 : 0;
      }
    });

    expect(emitted).toBe(COUNT);
    expect(produced).toBe(COUNT);

    // Each document costs one async iteration plus a JSON.stringify, so
    // 20x the machine's bare async-iteration cost is generous while
    // still catching an order-of-magnitude structural regression.
    const budget = await asyncIterationBudget(COUNT, 20);
    expect(elapsed).toBeLessThan(budget);
  });
});

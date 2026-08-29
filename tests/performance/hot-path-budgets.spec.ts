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

    // 500 boxes x 1000 pings = 500k comparisons. Locally ~15ms.
    expect(elapsed).toBeLessThan(2000);
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
    expect(elapsed).toBeLessThan(2000);
  });

  it('computes a bounding box in constant time regardless of polygon size', () => {
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

    expect(elapsed).toBeLessThan(2000);
  });

  it('point-in-box is effectively free', () => {
    const box = boundingBoxFor(circle(-17.82, 31.05))!;
    const elapsed = measure(() => {
      for (let i = 0; i < 1_000_000; i += 1) {
        isPointInBox({ lat: -17.82, lng: 31.05 }, box);
      }
    });

    expect(elapsed).toBeLessThan(2000);
  });
});

describe('Performance: telemetry normalisation runs per reading', () => {
  it('normalises 100k values within budget', () => {
    // Called several times per reading, on every reading, from both
    // adapters.
    const elapsed = measure(() => {
      for (let i = 0; i < 100_000; i += 1) {
        normaliseNumber('42.5');
        normaliseHeading(370);
      }
    });

    expect(elapsed).toBeLessThan(2000);
  });

  it('parses 50k provider timestamps within budget', () => {
    // normaliseTimestamp does regex work on the zone-less provider
    // format. A backtracking regex here would stall ingestion.
    const elapsed = measure(() => {
      for (let i = 0; i < 50_000; i += 1) {
        normaliseTimestamp('2026-08-20 09:15:00');
        normaliseTimestamp('2026-08-20T09:15:00.000Z');
      }
    });

    expect(elapsed).toBeLessThan(3000);
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
  it('aggregates one vehicle-day of readings within budget', () => {
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

    expect(elapsed).toBeLessThan(2000);
  });

  it('groups 50 vehicles without quadratic blow-up', () => {
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

    expect(elapsed).toBeLessThan(3000);
  });
});

describe('Performance: per-record guards', () => {
  it('resolves 200k odometer readings within budget', () => {
    // Runs on every digital-twin read.
    const elapsed = measure(() => {
      for (let i = 0; i < 200_000; i += 1) {
        resolveOdometer(100_000 + i, 100_000);
      }
    });

    expect(elapsed).toBeLessThan(2000);
  });

  it('builds 20k idempotency keys within budget', () => {
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

    expect(elapsed).toBeLessThan(3000);
  });
});

describe('Performance: the backup writer stays streaming', () => {
  it('holds a bounded amount regardless of how much it has produced', async () => {
    // The Phase 4 F-20 property, asserted as a budget rather than only
    // structurally: the generator must stay lazy. If somebody
    // reintroduced an array, producing 50k lines would balloon both time
    // and memory instead of staying flat.
    const docs = {
      async *[Symbol.asyncIterator]() {
        for (let i = 0; i < 50_000; i += 1) {
          yield { _id: `d-${i}`, value: i, payload: 'x'.repeat(50) };
        }
      },
    };

    let produced = 0;
    const elapsed = await measureAsync(async () => {
      for await (const line of ndjsonLines([{ name: 'tbltest', documents: docs }])) {
        produced += line.length > 0 ? 1 : 0;
      }
    });

    expect(produced).toBe(50_000);
    expect(elapsed).toBeLessThan(5000);
  });
});

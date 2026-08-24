// tests/unit/ai/driver-risk-severity.spec.ts
//
// PHASE 1, F-18 regression suite.
//
// THE DEFECT: modules/ai/services/driver-risk.service.ts classified every
// speeding incident with
//
//   severity: Math.random() > 0.7 ? 'High' : 'Medium',
//
// A driver's incident severity -- an input to a risk score that may
// inform employment decisions -- was a coin flip. The same query
// returned different severities on each call, so two managers reading
// the same driver on the same data saw different answers and neither
// could be audited.
//
// Most fabricated data in this module was removed and documented in an
// earlier round (generateRiskTrends, the expense-anomaly and fleet-health
// placeholders). This line survived, which is why the determinism
// assertion below is the important one: it fails on ANY reintroduction
// of randomness, not just this exact expression.

import * as fs from 'fs';
import * as path from 'path';

const ROOT = path.resolve(__dirname, '../../..');

import { driverRiskService } from '@/modules/ai/services/driver-risk.service';
import { SPEEDING_THRESHOLD_KMH } from '@/modules/telematics/services/reading-alerts';

/** collectIncidents is private; exercised through the instance under test. */
const collectIncidents = (telematics: unknown[]) =>
  (driverRiskService as unknown as {
    collectIncidents: (trips: unknown[], telematics: unknown[]) => Array<{
      type: string;
      severity: string;
    }>;
  }).collectIncidents([], telematics);

function readingAt(speed: number) {
  return {
    timestamp: new Date('2026-08-20T09:15:00.000Z'),
    location: { lat: -17.82, lng: 31.05, speed },
    alerts: [],
  };
}

describe('F-18: speeding severity is deterministic', () => {
  it('returns an identical result across repeated calls on identical data', () => {
    // The core property. Under Math.random() this failed roughly always
    // for any run of more than a couple of iterations.
    const readings = [
      readingAt(SPEEDING_THRESHOLD_KMH + 5),
      readingAt(SPEEDING_THRESHOLD_KMH + 25),
      readingAt(SPEEDING_THRESHOLD_KMH + 50),
    ];

    const runs = Array.from({ length: 25 }, () =>
      collectIncidents(readings).map((i) => i.severity).join(',')
    );

    expect(new Set(runs).size).toBe(1);
  });

  it('classifies 20 km/h or more over the threshold as High', () => {
    const incidents = collectIncidents([readingAt(SPEEDING_THRESHOLD_KMH + 20)]);
    expect(incidents).toHaveLength(1);
    expect(incidents[0].severity).toBe('High');
  });

  it('classifies a marginal overspeed as Medium', () => {
    const incidents = collectIncidents([readingAt(SPEEDING_THRESHOLD_KMH + 1)]);
    expect(incidents).toHaveLength(1);
    expect(incidents[0].severity).toBe('Medium');
  });

  it('classifies a gross overspeed as High', () => {
    const incidents = collectIncidents([readingAt(SPEEDING_THRESHOLD_KMH + 60)]);
    expect(incidents[0].severity).toBe('High');
  });

  it('is monotonic: a faster reading is never less severe', () => {
    const order = { Medium: 0, High: 1 } as Record<string, number>;
    let previous = -1;

    for (let over = 1; over <= 80; over += 1) {
      const [incident] = collectIncidents([readingAt(SPEEDING_THRESHOLD_KMH + over)]);
      const rank = order[incident.severity];
      expect(rank).toBeGreaterThanOrEqual(previous);
      previous = rank;
    }
  });

  it('raises no incident at or below the threshold', () => {
    expect(collectIncidents([readingAt(SPEEDING_THRESHOLD_KMH)])).toHaveLength(0);
    expect(collectIncidents([readingAt(SPEEDING_THRESHOLD_KMH - 30)])).toHaveLength(0);
  });

  it('emits only the two severity values the previous code emitted', () => {
    // Keeping the output domain identical means nothing downstream that
    // switches on 'High' | 'Medium' changes behaviour.
    const incidents = collectIncidents(
      Array.from({ length: 40 }, (_, i) => readingAt(SPEEDING_THRESHOLD_KMH + i * 3))
    );
    const values = new Set(incidents.map((i) => i.severity));
    expect([...values].sort()).toEqual(['High', 'Medium']);
  });
});

describe('F-18: randomness cannot be reintroduced', () => {
  it('driver-risk.service.ts contains no executable Math.random call', () => {
    // Structural, and scoped to CODE: this file's own doc comments quote
    // the removed expression in order to explain it, and several other
    // comments in the service describe earlier fabricated-data fixes.
    // An assertion that could not tell code from prose would force those
    // explanations to be deleted to stay green, which is the wrong trade.
    const code = fs
      .readFileSync(
        path.join(ROOT, 'modules/ai/services/driver-risk.service.ts'),
        'utf8'
      )
      .replace(/\/\*[\s\S]*?\*\//g, '')
      .replace(/(^|[^:])\/\/.*$/gm, '$1');

    expect(code).not.toContain('Math.random');
  });

  it('derives its threshold from the shared telematics constant', () => {
    // A duplicated literal here would silently drift from the threshold
    // that decides whether an incident exists at all -- producing
    // incidents that are 'High' by definition, or none that are, the
    // first time the alert threshold moved.
    const src = fs.readFileSync(
      path.join(ROOT, 'modules/ai/services/driver-risk.service.ts'),
      'utf8'
    );
    expect(src).toContain('SPEEDING_THRESHOLD_KMH');
    expect(src).toContain("from '@/modules/telematics/services/reading-alerts'");
  });
});

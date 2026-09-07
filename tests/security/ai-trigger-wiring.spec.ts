// tests/security/ai-trigger-wiring.spec.ts
//
// AIPredictionTriggerHandler was completely dead. Every branch read
// `payload.vehicleId`, and no domain event in this codebase has ever
// carried that field -- they all carry `entityId` + `license_plate`.
// So predictive maintenance and fuel-fraud detection were never once
// triggered by an event, and `.catch(() => undefined)` made the failure
// silent. See the header of the handler for the full account.
//
// This pins the three properties that were each independently broken:
//
//   1. the handler reads a field the events actually carry
//   2. every `case` it handles is a name bootstrap.ts subscribes it to,
//      and vice versa -- a branch with no subscription is dead code, and
//      a subscription with no branch is a silently dropped event
//   3. the trigger resolves a plate to a vehicle id rather than passing
//      an undefined straight into the model
//
// Structural, deliberately: instantiating the handler would pull in the
// AI services, Mongo and the whole event bus, and the properties above
// are properties of the wiring rather than of a run.

import * as fs from 'fs';
import * as path from 'path';

const ROOT = path.resolve(__dirname, '../..');
const HANDLER = path.join(ROOT, 'server/events/handlers/ai/AIPredictionTriggerHandler.ts');
const BOOTSTRAP = path.join(ROOT, 'server/events/bootstrap.ts');
const EVENT_NAMES = path.join(ROOT, 'server/events/event-names.ts');

/**
 * Comments stripped.
 *
 * The handler's header QUOTES the defective code it replaced -- that is
 * the most useful thing it can do for the next reader -- so a naive
 * `expect(src).not.toMatch(/payload.vehicleId/)` fails on the
 * explanation rather than on the code. Asserting against comment-free
 * source keeps the regression checks honest without forcing the file to
 * stay silent about its own history.
 */
function stripComments(src: string): string {
  return src.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '');
}

const handlerSrc = stripComments(fs.readFileSync(HANDLER, 'utf8'));
const bootstrapSrc = fs.readFileSync(BOOTSTRAP, 'utf8');
const eventNamesSrc = fs.readFileSync(EVENT_NAMES, 'utf8');

/** `export const FUEL_LOGGED = 'FuelLogged';` -> FUEL_LOGGED: 'FuelLogged' */
function eventNameConstants(): Record<string, string> {
  const out: Record<string, string> = {};
  for (const m of eventNamesSrc.matchAll(/export const ([A-Z0-9_]+)\s*=\s*'([^']+)'/g)) {
    out[m[1]] = m[2];
  }
  return out;
}

/** The `case '...'` labels the handler's switch actually handles. */
function handledEventNames(): string[] {
  return [...handlerSrc.matchAll(/case '([A-Za-z]+)':/g)].map((m) => m[1]);
}

/** The event-name constants bootstrap.ts subscribes aiPredictionHandler to. */
function subscribedEventNames(): string[] {
  const constants = eventNameConstants();
  return [...bootstrapSrc.matchAll(/bus\.subscribe\(\s*([A-Z0-9_]+)\s*,\s*aiPredictionHandler\s*\)/g)]
    .map((m) => constants[m[1]])
    .filter((n): n is string => Boolean(n));
}

describe('AIPredictionTriggerHandler wiring', () => {
  it('reads license_plate, which every domain event actually carries', () => {
    expect(handlerSrc).toMatch(/payload\.license_plate/);
  });

  it('REGRESSION: never reads payload.vehicleId, which no event sets', () => {
    // The original defect, in one line. `as string` made it compile and
    // `.catch(() => undefined)` made it silent.
    expect(handlerSrc).not.toMatch(/payload\.vehicleId/);
  });

  it('resolves the plate to a canonical vehicle id before calling a model', () => {
    expect(handlerSrc).toMatch(/vehicleIdentityResolver\.resolveByPlate/);
  });

  it('declines rather than guessing when a plate is ambiguous', () => {
    // resolveByPlate returns 'ambiguous' for two active vehicles sharing
    // a plate; only 'resolved' may proceed. Attributing a fraud signal
    // to an arbitrary one of them is worse than not running.
    expect(handlerSrc).toMatch(/result\.status === 'resolved'/);
  });

  it('subscribes to at least the five events it claims to handle', () => {
    expect(subscribedEventNames().length).toBeGreaterThanOrEqual(5);
  });

  it('handles every event it is subscribed to (no silently dropped event)', () => {
    const handled = new Set(handledEventNames());
    const unhandled = subscribedEventNames().filter((n) => !handled.has(n));
    expect(unhandled).toEqual([]);
  });

  it('is subscribed to every event it handles (no dead branch)', () => {
    // The half that would have caught the original bug's siblings:
    // `TripCompleted` and `MaintenanceCompleted` were both handled and
    // neither was ever published or subscribed.
    const subscribed = new Set(subscribedEventNames());
    const orphaned = handledEventNames().filter((n) => !subscribed.has(n));
    expect(orphaned).toEqual([]);
  });

  it('no longer references event names nothing publishes', () => {
    expect(handledEventNames()).not.toContain('TripCompleted');
    expect(handledEventNames()).not.toContain('MaintenanceCompleted');
  });

  it('still swallows model failures, but logs them', () => {
    // The swallow is correct -- a prediction must never fail the write
    // that triggered it. What was wrong was swallowing SILENTLY, which
    // is why a handler that could not possibly work looked exactly like
    // one with nothing to do.
    expect(handlerSrc).not.toMatch(/\.catch\(\(\)\s*=>\s*undefined\)/);
    const catches = handlerSrc.match(/catch \(error\) \{/g) ?? [];
    const logs = handlerSrc.match(/monitoring\.logError/g) ?? [];
    expect(catches.length).toBeGreaterThan(0);
    expect(logs.length).toBeGreaterThanOrEqual(catches.length);
  });

  it('calls AI service methods that exist', () => {
    // The trigger bodies are the one place a typo'd method name would
    // again be invisible, because the call sits inside a swallowing
    // try/catch.
    const services = {
      'modules/ai/services/predictive-maintenance.service.ts': 'predictVehicle',
      'modules/ai/services/fuel-fraud-detection.service.ts': 'detectVehicleFraud',
      'modules/ai/services/expense-anomaly-detection.service.ts': 'detectAnomalies',
    };
    for (const [file, method] of Object.entries(services)) {
      expect(handlerSrc).toMatch(new RegExp(`\\.${method}\\(`));
      expect(fs.readFileSync(path.join(ROOT, file), 'utf8')).toMatch(
        new RegExp(`async ${method}\\(`)
      );
    }
  });
});

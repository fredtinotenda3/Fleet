// tests/security/event-wiring-conformance.spec.ts
//
// "A handler correctly written, correctly subscribed, and keyed on a
// name nothing publishes."
//
// ---------------------------------------------------------------------
// THE DEFECT FAMILY THIS EXISTS TO END
// ---------------------------------------------------------------------
// Four instances have now shipped in this codebase:
//
//  1. AIPredictionTriggerHandler read `payload.vehicleId`. No domain
//     event sets that key, so all five branches were dead. `as string`
//     made it compile; `.catch(() => undefined)` made it silent.
//  2. AllocationPostingHandler's map was keyed on `FuelLogCreated` and
//     `MaintenanceCompleted`. Neither is a published name (they are
//     `FuelLogged` and `ReminderCompleted`), so the ledger received
//     expenses only -- fuel, the largest cost in any fleet, never
//     posted.
//  3. The same handler read `payload.driverId`, which nothing
//     publishes; every operational record spells it `driver_id`. The
//     ledger's driver column was always empty.
//  4. And -- worst of all, because FIXING (2) CREATED IT -- the
//     corrected map's fourth key, `WorkOrderCompleted`, was not in
//     bootstrap's hand-written `allEventNames` array, so it was
//     unroutable. Every part and every labour hour on every completed
//     work order stayed out of the ledger, under a comment in bootstrap
//     claiming the handler was "subscribed to every event".
//
// Every one of them is the same shape: TWO LISTS THAT MUST AGREE BY
// HAND, with nothing checking that they do. Nothing throws, nothing
// logs, and the symptom is a number that is merely too low or a screen
// that is merely empty.
//
// ---------------------------------------------------------------------
// WHAT THIS FILE CHECKS
// ---------------------------------------------------------------------
// Three lists, cross-checked mechanically:
//
//   PUBLISHED   -- every name passed to `super(...)` by a DomainEvent
//                  subclass, plus anonymous inline event classes.
//   SUBSCRIBED  -- every name reaching `bus.subscribe(...)` in
//                  bootstrap.ts, including the arrays looped over.
//   DECLARED    -- every constant in event-names.ts.
//
// and asserts:
//
//   A. Every SUBSCRIBED name is PUBLISHED. A subscription to a name
//      nothing publishes is a dead handler branch.
//   B. Every event a posting/routing map is keyed on is SUBSCRIBED.
//      This is finding 4, and the reason POSTING_EVENT_NAMES exists.
//   C. The set of DECLARED-but-never-published names does not GROW.
//
// A is enforced against a QUARANTINE list rather than being all-or-
// nothing, because five such subscriptions already exist and deleting
// features mid-flight is not this test's job. The list is allowed to
// shrink and never to grow, and every entry states the symptom.

import fs from 'fs';
import path from 'path';

const ROOT = path.resolve(__dirname, '../..');

function read(rel: string): string {
  return fs.readFileSync(path.join(ROOT, rel), 'utf8');
}

function walk(dir: string, out: string[] = []): string[] {
  if (!fs.existsSync(dir)) return out;
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    if (entry.name === 'node_modules' || entry.name.startsWith('.')) continue;
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) walk(full, out);
    else if (entry.name.endsWith('.ts') || entry.name.endsWith('.tsx')) out.push(full);
  }
  return out;
}

/** Comments quote dead names verbatim; a code check must not read prose. */
function stripComments(source: string): string {
  return source.replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|[^:])\/\/.*$/gm, '$1');
}

// ─────────────────────────────────────────────────────────────────────
// DECLARED
// ─────────────────────────────────────────────────────────────────────

const eventNamesSrc = read('server/events/event-names.ts');

/** `export const FUEL_LOGGED = 'FuelLogged';` -> { FUEL_LOGGED: 'FuelLogged' } */
const DECLARED: Record<string, string> = {};
for (const match of eventNamesSrc.matchAll(/export const ([A-Z0-9_]+)\s*=\s*'([^']+)'/g)) {
  DECLARED[match[1]] = match[2];
}

/**
 * Every `export const NAME = 'literal'` in the tree, so a constant
 * declared OUTSIDE event-names.ts still resolves.
 *
 * Necessary, not incidental: MFA events live in
 * modules/security/events/mfa.events.ts, the observability alert lives
 * in infrastructure/observability/event-names.ts, and drivers publish a
 * module-local 'driver.created'. A resolver that only knew the central
 * registry would report all four as "subscribed but never published" --
 * a false alarm, which is exactly how a conformance test gets muted.
 *
 * event-names.ts wins a name collision, since it is the registry.
 */
const ALL_CONSTANTS: Record<string, string> = {};

// ─────────────────────────────────────────────────────────────────────
// PUBLISHED
// ─────────────────────────────────────────────────────────────────────

/**
 * Collected from `super(<X>, ...)` inside DomainEvent subclasses, across
 * the whole tree -- not just modules/*\/events, because several events
 * are declared inline as anonymous classes at their publish site
 * (billing and dead-letter both do this).
 *
 * Module-local names are included by design: `DriverCreatedEvent`
 * publishes the literal 'driver.created' rather than a constant, and
 * that is a legitimate convention here.
 */
const PUBLISHED = new Set<string>();
{
  const files = [
    ...walk(path.join(ROOT, 'modules')),
    ...walk(path.join(ROOT, 'server')),
    ...walk(path.join(ROOT, 'infrastructure')),
  ];

  /*
    TWO PASSES, and the order matters. A constant can be defined in a
    file the walk reaches AFTER the file that publishes with it --
    OBSERVABILITY_ALERT_TRIGGERED lives in
    infrastructure/observability/event-names.ts while its only publisher
    is the alphabetically earlier alert-rules.ts. Collecting constants
    lazily in one pass reported that event as "subscribed but never
    published", which is a false alarm, and a conformance test that
    cries wolf is a conformance test that gets muted.
  */
  const sources = new Map<string, string>();
  for (const file of files) {
    const source = stripComments(fs.readFileSync(file, 'utf8'));
    sources.set(file, source);
    for (const match of source.matchAll(/export const ([A-Z0-9_]+)\s*=\s*'([^']+)'/g)) {
      if (!(match[1] in ALL_CONSTANTS)) ALL_CONSTANTS[match[1]] = match[2];
    }
  }
  Object.assign(ALL_CONSTANTS, DECLARED);

  for (const [, source] of sources) {
    if (!source.includes('DomainEvent')) continue;

    for (const match of source.matchAll(/super\(\s*'([^']+)'/g)) {
      PUBLISHED.add(match[1]);
    }
    for (const match of source.matchAll(/super\(\s*([A-Z0-9_]+)\s*,/g)) {
      // A constant declared in this file, in the central registry, or
      // anywhere else in the tree -- resolved in that order.
      const local = source.match(new RegExp(`(?:export )?const ${match[1]}\\s*=\\s*'([^']+)'`));
      const literal = local?.[1] ?? DECLARED[match[1]] ?? ALL_CONSTANTS[match[1]];
      if (literal) PUBLISHED.add(literal);
    }
  }
}

// ─────────────────────────────────────────────────────────────────────
// SUBSCRIBED
// ─────────────────────────────────────────────────────────────────────

const bootstrapSrc = stripComments(read('server/events/bootstrap.ts'));

/** `const NAME = [ A, B, C ];` -> resolved literals. */
function arrayConstant(name: string): string[] {
  const match = bootstrapSrc.match(new RegExp(`const ${name}\\s*=\\s*\\[([\\s\\S]*?)\\]`));
  if (!match) return [];
  return match[1]
    .split(',')
    .map((entry) => entry.trim())
    .filter(Boolean)
    .map((identifier) => DECLARED[identifier] ?? identifier);
}

const SUBSCRIBED = new Map<string, string[]>(); // event name -> handler identifiers
function addSubscription(eventName: string, handler: string) {
  const handlers = SUBSCRIBED.get(eventName) ?? [];
  handlers.push(handler);
  SUBSCRIBED.set(eventName, handlers);
}

{
  // Loops: `for (const name of <ARRAY>) { ... bus.subscribe(name, h) }`
  for (const loop of bootstrapSrc.matchAll(
    /for \(const name of ([A-Za-z0-9_]+)\)\s*\{([\s\S]*?)\n  \}/g
  )) {
    const names =
      loop[1] === 'POSTING_EVENT_NAMES'
        ? Object.keys(postingEventSpecs())
        : arrayConstant(loop[1]);
    for (const call of loop[2].matchAll(/bus\.subscribe\(name,\s*([A-Za-z0-9_]+)\)/g)) {
      for (const name of names) addSubscription(name, call[1]);
    }
  }

  // Direct: `bus.subscribe(CONST_OR_'literal', handler)`
  for (const call of bootstrapSrc.matchAll(
    /bus\.subscribe\(\s*(?:'([^']+)'|([A-Za-z0-9_]+))\s*,\s*([A-Za-z0-9_]+)\)/g
  )) {
    const identifier = call[2];
    if (identifier === 'name') continue; // handled by the loop pass
    const eventName =
      call[1] ?? DECLARED[identifier] ?? moduleLocalName(identifier) ?? ALL_CONSTANTS[identifier] ?? identifier;
    addSubscription(eventName, call[3]);
  }
}

/** Resolves a constant imported into bootstrap from a module's own event file. */
function moduleLocalName(identifier: string): string | undefined {
  const importMatch = bootstrapSrc.match(
    new RegExp(`import \\{[^}]*\\b${identifier}\\b[^}]*\\} from '([^']+)'`)
  );
  if (!importMatch) return undefined;
  const rel = importMatch[1].replace(/^@\//, '');
  for (const candidate of [`${rel}.ts`, `${rel}/index.ts`]) {
    const full = path.join(ROOT, candidate);
    if (!fs.existsSync(full)) continue;
    const match = fs
      .readFileSync(full, 'utf8')
      .match(new RegExp(`export const ${identifier}\\s*=\\s*'([^']+)'`));
    if (match) return match[1];
  }
  return undefined;
}

/** The allocation handler's routing map, read from its source. */
function postingEventSpecs(): Record<string, unknown> {
  const src = stripComments(read('server/events/handlers/finance/AllocationPostingHandler.ts'));
  const block = src.slice(src.indexOf('POSTING_EVENTS'), src.indexOf('export class'));
  const out: Record<string, unknown> = {};
  for (const match of block.matchAll(/\[([A-Z0-9_]+)\]:/g)) {
    const literal = DECLARED[match[1]];
    if (literal) out[literal] = true;
  }
  return out;
}

// ─────────────────────────────────────────────────────────────────────

describe('the three lists were actually collected', () => {
  // A conformance test that silently parses nothing passes vacuously,
  // which is worse than no test at all.
  it('found the declared constants', () => {
    expect(Object.keys(DECLARED).length).toBeGreaterThan(50);
  });
  it('found published event names', () => {
    expect(PUBLISHED.size).toBeGreaterThan(50);
  });
  it('found subscriptions, including the looped ones', () => {
    expect(SUBSCRIBED.size).toBeGreaterThan(25);
  });
  it('resolved a module-local event name', () => {
    // 'driver.created' is published as a module-local literal, not from
    // event-names.ts. If the resolver stopped handling those, the
    // compliance subscription would silently look like a dead one.
    expect(PUBLISHED.has('driver.created')).toBe(true);
    expect(SUBSCRIBED.has('driver.created')).toBe(true);
  });
});

/**
 * Subscriptions to names nothing publishes. Each entry is a dead handler
 * branch, and each states what a user sees.
 *
 * ALLOWED TO SHRINK, NEVER TO GROW. Deleting these is a product decision
 * -- some are features half-built rather than mistakes -- so they are
 * quarantined and counted rather than silently tolerated or silently
 * removed.
 */
const KNOWN_UNPUBLISHED_SUBSCRIPTIONS: Record<string, string> = {
  ReminderOverdue:
    'Nothing publishes it. NotificationHandler.onReminderOverdue and the digital twin\'s ' +
    'applyMaintenanceOverdue never run: a reminder going overdue notifies nobody.',
  TripCompleted:
    'Declared and never published (trips are created, never "completed"). ' +
    'WorkflowTriggerHandler and DigitalTwinProjectionHandler both branch on it.',
  TelematicsDataIngested:
    "Ingestion writes readings without publishing. The digital twin's live position and " +
    'sensor readings are therefore never populated from telemetry.',
  GeofenceAlert:
    'Geofence evaluation raises alerts directly. The twin never records a geofence breach.',
  OrganizationCreated:
    'Organizations are created without publishing. Workflow and WebSocket branches are dead.',
  MemberRemoved: 'Nothing publishes it; the WebSocket branch is dead.',
  SubscriptionUpgraded:
    'Billing audits the upgrade but publishes no event; the WebSocket branch is dead.',
  AIPredictionGenerated:
    'AIInsightHandler is subscribed to it and AIPredictionTriggerHandler does not publish it, ' +
    'so the entire real-time AI insight feed and its high-severity escalation have never run.',
};

describe('A. every subscribed event name is actually published', () => {
  const unpublished = [...SUBSCRIBED.keys()].filter((name) => !PUBLISHED.has(name));

  it('no NEW dead subscription has been introduced', () => {
    const unexpected = unpublished.filter((name) => !(name in KNOWN_UNPUBLISHED_SUBSCRIPTIONS));
    // Named in the failure, because "expected [] to equal ['X']" does
    // not tell the next engineer that handler X will never run.
    expect({ deadSubscriptions: unexpected }).toEqual({ deadSubscriptions: [] });
  });

  it('the quarantine list does not contain entries that are now fine', () => {
    // Keeps the list honest in the other direction: an entry that starts
    // being published should be removed, or the list stops meaning
    // anything.
    const nowPublished = Object.keys(KNOWN_UNPUBLISHED_SUBSCRIPTIONS).filter((name) =>
      PUBLISHED.has(name)
    );
    expect({ staleQuarantineEntries: nowPublished }).toEqual({ staleQuarantineEntries: [] });
  });

  it('the quarantine is not growing', () => {
    // A ratchet. Lower this number when a dead subscription is fixed or
    // removed; never raise it.
    expect(unpublished.length).toBeLessThanOrEqual(
      Object.keys(KNOWN_UNPUBLISHED_SUBSCRIPTIONS).length
    );
  });
});

describe('B. every event a routing map is keyed on is subscribed', () => {
  it('THE WORK-ORDER REGRESSION: the allocation posting map is fully routed', () => {
    // This is finding 4, and the reason POSTING_EVENT_NAMES exists.
    // Before it, the map's fourth key was absent from bootstrap's
    // hand-written array, so completed work orders posted nothing --
    // under a comment claiming the handler saw every event.
    const mapped = Object.keys(postingEventSpecs());
    expect(mapped.length).toBe(4);

    const unrouted = mapped.filter(
      (name) => !(SUBSCRIBED.get(name) ?? []).includes('allocationPostingHandler')
    );
    expect({ mapped, notSubscribed: unrouted }).toEqual({ mapped, notSubscribed: [] });
  });

  it('the subscription is DERIVED from the map, not written out again', () => {
    // The property that stops this recurring. Two lists that must agree
    // by hand is the whole defect family; one list cannot disagree with
    // itself.
    expect(read('server/events/bootstrap.ts')).toMatch(/for \(const name of POSTING_EVENT_NAMES\)/);
    expect(read('server/events/handlers/finance/AllocationPostingHandler.ts')).toMatch(
      /export const POSTING_EVENT_NAMES = Object\.keys\(POSTING_EVENTS\)/
    );
  });
});

describe('C. declared-but-never-published names are bounded', () => {
  const orphans = Object.entries(DECLARED)
    .filter(([, literal]) => !PUBLISHED.has(literal))
    .map(([constant]) => constant);

  it('does not grow', () => {
    // Each of these is a name a handler, a webhook subscription or a
    // workflow trigger can be keyed on while never firing. Ratchet: to
    // add a constant, publish it.
    expect(orphans.length).toBeLessThanOrEqual(16);
  });
});

describe('handlers do not read payload fields nothing sets', () => {
  it('REGRESSION: payload.vehicleId is only read where a plate fallback exists', () => {
    /*
      The original instance of this family. Almost no domain event sets
      `vehicleId` on its payload -- they carry `license_plate` and expect
      the reader to resolve it -- so `payload.vehicleId as string`
      followed by a silent early return is a dead branch that compiles.

      An outright ban would be wrong: AllocationPostingHandler reads it
      as a FIRST choice and falls back to resolving the plate, which is
      correct. So this is a ratchet over the files allowed to read it,
      each with a reason. It may shrink; it may not grow.
    */
    const ALLOWED: Record<string, string> = {
      'server/events/handlers/finance/AllocationPostingHandler.ts':
        'Read as a first choice by resolveVehicleId, which falls back to resolving license_plate.',
      'server/events/handlers/digital-twin/DigitalTwinProjectionHandler.ts':
        'Two branches (TelematicsDataIngested, GeofenceAlert) with NO fallback. Currently ' +
        'unreachable because neither event is published; recorded so that publishing either ' +
        'surfaces them rather than letting them fail silently on day one.',
      'server/events/handlers/ai/AIInsightHandler.tsx':
        'Passed straight through to a UI payload, not used as a lookup key. Moot in any case: ' +
        'nothing publishes AIPredictionGenerated, so this handler has never run.',
    };

    const handlers = walk(path.join(ROOT, 'server/events/handlers'));
    const offenders = handlers
      .filter((file) => /payload\.vehicleId/.test(stripComments(fs.readFileSync(file, 'utf8'))))
      .map((f) => path.relative(ROOT, f).split(path.sep).join('/'));

    const unexpected = offenders.filter((file) => !(file in ALLOWED));
    expect({ readsVehicleIdWithoutAReason: unexpected }).toEqual({
      readsVehicleIdWithoutAReason: [],
    });
    // And the allowlist must not outlive its entries.
    const stale = Object.keys(ALLOWED).filter((file) => !offenders.includes(file));
    expect({ staleAllowlistEntries: stale }).toEqual({ staleAllowlistEntries: [] });
  });

  it('REGRESSION: the allocation handler no longer reads a camelCase driverId only', () => {
    const builder = read('modules/finance/services/allocation-source-builder.ts');
    expect(builder).toMatch(/record\.driver_id/);
  });

  it('InvoicePaidEvent carries the ownerId its handler reads', () => {
    // NotificationHandler.onInvoicePaid guards on `payload.ownerId`, and
    // the event never set it, so the "Invoice Paid" notification was
    // never sent to anybody.
    expect(read('modules/billing/events/InvoicePaidEvent.ts')).toMatch(/ownerId,/);
    expect(stripComments(read('server/events/handlers/notification/NotificationHandler.ts'))).toMatch(
      /payload\.ownerId/
    );
  });
});

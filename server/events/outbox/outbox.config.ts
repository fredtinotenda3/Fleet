// server/events/outbox/outbox.config.ts
//
// PHASE 3 -- the single place event-durability configuration is read.
//
// ---------------------------------------------------------------------
// WHY A CONFIG BOUNDARY
// ---------------------------------------------------------------------
// `process.env` scattered through business logic is how a deployment
// ends up in a state nobody can describe. Every knob below is read
// exactly once, here, validated, and exposed as a typed object. Callers
// receive a decision, not a string.
//
// ---------------------------------------------------------------------
// THE FAIL-CLOSED RULE, AND THE ONE THAT MATTERS MOST
// ---------------------------------------------------------------------
// Outbox mode means "events are written to Mongo and delivered later by
// a processor". That is only durable if a processor actually runs.
//
// If outbox mode is selected and NOTHING is going to run the processor,
// events are recorded perfectly and delivered never -- which is WORSE
// than the in-memory bus it replaces. In-memory loses events on a crash;
// an unattended outbox loses them always, silently, while a growing
// collection makes the system look healthy.
//
// So `resolveOutboxConfig()` REFUSES that combination. An operator must
// state the topology explicitly: either the processor runs in this
// process (`OUTBOX_PROCESSOR_ENABLED=true`) or it runs elsewhere and
// they say so (`OUTBOX_PROCESSOR_EXTERNAL=true`). There is no third
// option where the platform guesses.
//
// This matters concretely here because the documented deployment target
// is Vercel, where `workers/bootstrap.ts` no-ops without `REDIS_URL` and
// long-lived processes do not exist. A deployment that flips
// EVENT_BUS_MODE=outbox on Vercel without arranging a processor is
// exactly the failure this refusal catches.
//
// ---------------------------------------------------------------------
// WHY PRODUCTION DEFAULTS TO OUTBOX
// ---------------------------------------------------------------------
// Because the alternative default is silent event loss, and a default
// that loses data is not a safe default. Making it explicit forces the
// topology question at deploy time rather than after an incident.
//
// Dev and test default to `memory`: tests must not need a Mongo
// collection to publish an event, and a developer running `npm run dev`
// should not have to run a processor to see a handler fire.

export type EventBusMode = 'memory' | 'outbox';

export interface OutboxConfig {
  mode: EventBusMode;
  /** Whether THIS process should run the processor loop. */
  processorEnabled: boolean;
  /** Operator's assertion that a processor runs in another process. */
  processorExternal: boolean;
  /** Poll interval for the processor loop. */
  intervalMs: number;
  /** Attempts before an event is dead-lettered. */
  maxAttempts: number;
  /** How long a claim is held before another processor may steal it. */
  leaseTimeoutMs: number;
  /** First retry delay; doubles each attempt up to backoffMaxMs. */
  backoffBaseMs: number;
  backoffMaxMs: number;
  /** Rows claimed per poll. */
  batchSize: number;
}

export class OutboxConfigError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'OutboxConfigError';
  }
}

function readInt(name: string, fallback: number, min: number): number {
  const raw = process.env[name];
  if (raw === undefined || raw.trim() === '') return fallback;

  const parsed = Number(raw);
  if (!Number.isFinite(parsed) || !Number.isInteger(parsed) || parsed < min) {
    // Refused rather than silently falling back. A typo'd
    // OUTBOX_MAX_ATTEMPTS=O (letter O) would otherwise become the
    // default and nobody would ever know the value they set was ignored.
    throw new OutboxConfigError(
      `${name} must be an integer >= ${min}. Received: ${JSON.stringify(raw)}`
    );
  }
  return parsed;
}

function readBool(name: string, fallback: boolean): boolean {
  const raw = process.env[name];
  if (raw === undefined || raw.trim() === '') return fallback;

  const v = raw.trim().toLowerCase();
  if (['true', '1', 'yes', 'on'].includes(v)) return true;
  if (['false', '0', 'no', 'off'].includes(v)) return false;

  throw new OutboxConfigError(
    `${name} must be a boolean (true/false). Received: ${JSON.stringify(raw)}`
  );
}

function readMode(): EventBusMode {
  const raw = process.env.EVENT_BUS_MODE;
  const isProduction = process.env.NODE_ENV === 'production';

  if (raw === undefined || raw.trim() === '') {
    return isProduction ? 'outbox' : 'memory';
  }

  const v = raw.trim().toLowerCase();
  if (v === 'memory' || v === 'outbox') return v;

  // NOT defaulted. An unrecognised mode in production would otherwise
  // resolve to whichever branch the fallback happened to take, and if
  // that branch were 'memory' the deployment would silently lose events
  // while its configuration claimed otherwise.
  throw new OutboxConfigError(
    `EVENT_BUS_MODE must be 'memory' or 'outbox'. Received: ${JSON.stringify(raw)}`
  );
}

/**
 * Reads and validates event-durability configuration.
 *
 * Throws OutboxConfigError on any invalid or self-contradictory
 * combination. Callers should let it propagate at startup: a process
 * that cannot describe its own delivery guarantees should not serve
 * traffic.
 */
export function resolveOutboxConfig(): OutboxConfig {
  const mode = readMode();
  const isProduction = process.env.NODE_ENV === 'production';

  const processorEnabled = readBool('OUTBOX_PROCESSOR_ENABLED', mode === 'outbox');
  const processorExternal = readBool('OUTBOX_PROCESSOR_EXTERNAL', false);

  // THE REFUSAL. See the header for why this is the most important line
  // in the file.
  if (mode === 'outbox' && !processorEnabled && !processorExternal) {
    throw new OutboxConfigError(
      'EVENT_BUS_MODE=outbox writes every domain event to the outbox for later ' +
        'delivery, but no processor is configured to deliver them — so events would ' +
        'be durably recorded and never dispatched. Set OUTBOX_PROCESSOR_ENABLED=true ' +
        'to run the processor in this process, or OUTBOX_PROCESSOR_EXTERNAL=true if a ' +
        'separate worker runs it (see docs/EVENT_DURABILITY.md for the topology).'
    );
  }

  const config: OutboxConfig = {
    mode,
    processorEnabled,
    processorExternal,
    intervalMs: readInt('OUTBOX_PROCESSOR_INTERVAL_MS', 5000, 100),
    maxAttempts: readInt('OUTBOX_MAX_ATTEMPTS', 5, 1),
    leaseTimeoutMs: readInt('OUTBOX_LEASE_TIMEOUT_MS', 30_000, 1000),
    backoffBaseMs: readInt('OUTBOX_BACKOFF_BASE_MS', 1000, 1),
    backoffMaxMs: readInt('OUTBOX_BACKOFF_MAX_MS', 60_000, 1),
    batchSize: readInt('OUTBOX_BATCH_SIZE', 100, 1),
  };

  if (config.backoffMaxMs < config.backoffBaseMs) {
    throw new OutboxConfigError(
      `OUTBOX_BACKOFF_MAX_MS (${config.backoffMaxMs}) must be >= OUTBOX_BACKOFF_BASE_MS (${config.backoffBaseMs}).`
    );
  }

  // A lease shorter than the poll interval means a processor's claim can
  // expire while it is still legitimately working, and a second
  // processor picks the row up mid-flight -- turning at-least-once into
  // reliably-twice for every slow handler.
  if (config.leaseTimeoutMs <= config.intervalMs) {
    throw new OutboxConfigError(
      `OUTBOX_LEASE_TIMEOUT_MS (${config.leaseTimeoutMs}) must exceed ` +
        `OUTBOX_PROCESSOR_INTERVAL_MS (${config.intervalMs}), otherwise a claim can ` +
        'expire while the claiming processor is still working and a second processor ' +
        'will dispatch the same event concurrently.'
    );
  }

  if (isProduction && mode === 'memory') {
    // Permitted (an operator may have a reason) but never silent.
    // eslint-disable-next-line no-console
    console.warn(
      '[events] EVENT_BUS_MODE=memory in production: domain events are delivered ' +
        'in-process and are LOST on crash, redeploy or instance recycle.'
    );
  }

  return config;
}

/**
 * Cached resolution.
 *
 * Config is process-level and immutable; re-reading per publish would
 * mean a mid-flight env change could split delivery semantics across two
 * events in the same request. `resetOutboxConfig()` exists for tests.
 */
let cached: OutboxConfig | null = null;

export function getOutboxConfig(): OutboxConfig {
  if (!cached) cached = resolveOutboxConfig();
  return cached;
}

/** TEST ONLY. Clears the cached resolution. */
export function resetOutboxConfig(): void {
  cached = null;
}

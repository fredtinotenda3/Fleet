// server/events/outbox/outbox-runner.ts
//
// PHASE 3 -- starting the processor, and refusing to pretend.
//
// ---------------------------------------------------------------------
// DEPLOYMENT TOPOLOGY -- THE PART THAT ACTUALLY MATTERS
// ---------------------------------------------------------------------
// The outbox only provides durability if something drains it. Where that
// something runs is a deployment decision, and this repository has a
// specific constraint that makes the decision non-obvious:
//
//   * `workers/bootstrap.ts` no-ops entirely without `REDIS_URL`, and
//     the documented deployment target is Vercel, which has no
//     long-lived process. So on the current production topology, the
//     BullMQ workers do not run at all.
//
// That gives three supported arrangements, and the config layer refuses
// anything else (see outbox.config.ts):
//
//   A. DEDICATED WORKER PROCESS (recommended). `npm run events:worker`,
//      or the existing `scripts/worker.js` container, with
//      OUTBOX_PROCESSOR_ENABLED=true. The processor runs alongside the
//      BullMQ workers.
//
//   B. EXTERNAL SCHEDULER. A cron or job runner calls
//      `npm run events:process` on a schedule; it drains once and exits.
//      Set OUTBOX_PROCESSOR_EXTERNAL=true so the config layer knows a
//      processor exists somewhere.
//
//   C. MEMORY MODE. EVENT_BUS_MODE=memory. Events are delivered
//      in-process and lost on crash -- the pre-Phase-3 behaviour, still
//      available, now an explicit choice rather than the only option.
//
// WHAT IS NOT SUPPORTED: starting the processor inside the Next.js web
// process on serverless. An instance can be recycled mid-dispatch at any
// time, and several instances would poll concurrently -- the lease makes
// that safe but pointless, since none of them is guaranteed to live long
// enough to finish a batch. `startOutboxProcessor` therefore refuses
// when it detects a serverless runtime, rather than starting something
// that appears to work and silently does not.

import { OutboxProcessor } from './OutboxProcessor';
import { getOutboxConfig } from './outbox.config';
import { EventBusFactory } from '../bus/EventBusFactory';
import { monitoring } from '@/infrastructure/monitoring/logger';

let processor: OutboxProcessor | null = null;

/**
 * Whether this process looks like a serverless function instance.
 *
 * `VERCEL` is set in every Vercel runtime; `AWS_LAMBDA_FUNCTION_NAME` is
 * the equivalent for Lambda (which Vercel functions run on). Checked
 * rather than assumed so a dedicated worker container -- which sets
 * neither -- is not accidentally refused.
 */
function isServerlessRuntime(): boolean {
  return Boolean(process.env.VERCEL || process.env.AWS_LAMBDA_FUNCTION_NAME);
}

/**
 * Builds a processor wired to the correct dispatch target.
 *
 * `getDispatchTarget()` returns the INNER in-memory bus in outbox mode --
 * the same instance `server/events/bootstrap.ts` registered every
 * handler on. Handing the processor `getInstance()` instead would make
 * it publish each claimed event straight back into the outbox it is
 * draining.
 */
export function createOutboxProcessor(): OutboxProcessor {
  return new OutboxProcessor(EventBusFactory.getDispatchTarget());
}

/**
 * Starts the poll loop if this process is the right place for it.
 *
 * Returns the processor when started, `null` when deliberately not.
 * Never throws for "not my job" -- a web process calling this at boot
 * should carry on serving traffic.
 */
export function startOutboxProcessor(): OutboxProcessor | null {
  const config = getOutboxConfig();

  if (config.mode !== 'outbox') return null;

  if (!config.processorEnabled) {
    // Legitimate: OUTBOX_PROCESSOR_EXTERNAL=true means an operator has
    // stated the processor runs elsewhere. The config layer has already
    // refused the case where nothing runs it at all.
    monitoring.logInfo(
      '[outbox] Processor not enabled in this process; relying on an external processor'
    );
    return null;
  }

  if (isServerlessRuntime()) {
    // Refused loudly. A serverless instance can vanish mid-batch, so a
    // processor here would look configured and deliver unreliably --
    // the exact class of silent failure Phase 3 exists to remove.
    monitoring.logError(
      '[outbox] Refusing to start the outbox processor in a serverless runtime',
      new Error('OUTBOX_PROCESSOR_IN_SERVERLESS'),
      {
        remedy:
          'Run it in a dedicated worker (npm run events:worker) or on a schedule ' +
          '(npm run events:process) and set OUTBOX_PROCESSOR_EXTERNAL=true.',
      }
    );
    return null;
  }

  if (processor?.running) return processor;

  processor = createOutboxProcessor();
  processor.start();
  return processor;
}

/** Stops the loop if this process started one. */
export function stopOutboxProcessor(): void {
  processor?.stop();
  processor = null;
}

/**
 * Drains the outbox once and returns the batch result.
 *
 * The entry point for `npm run events:process` and for an external
 * scheduler. Runs a single pass rather than looping, so the caller
 * controls cadence and the process exits cleanly.
 */
export async function drainOutboxOnce() {
  const config = getOutboxConfig();

  if (config.mode !== 'outbox') {
    throw new Error(
      `Cannot drain the outbox while EVENT_BUS_MODE=${config.mode}. ` +
        'Nothing is being written to it.'
    );
  }

  return createOutboxProcessor().processBatch();
}

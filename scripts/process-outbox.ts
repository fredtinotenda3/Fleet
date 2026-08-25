// scripts/process-outbox.ts
//
// PHASE 3 -- drain the outbox from the command line.
//
//   npm run events:process           drain once and exit
//   npm run events:worker            run the poll loop until stopped
//
// `events:process` is the entry point for an external scheduler
// (arrangement B in server/events/outbox/outbox-runner.ts): a cron calls
// it, it delivers whatever is due, and exits. `events:worker` is the
// long-lived form for a dedicated container.
//
// Both bootstrap the event handlers first. Without that the processor
// would claim rows, dispatch into a bus with no subscribers, and mark
// them processed -- delivering every event to nobody while reporting
// success. That is the single most important line in this file.

import 'dotenv/config';
import { bootstrapEvents } from '@/server/events/bootstrap';
import {
  createOutboxProcessor,
  drainOutboxOnce,
} from '@/server/events/outbox/outbox-runner';
import { getOutboxConfig } from '@/server/events/outbox/outbox.config';

async function main() {
  const loop = process.argv.includes('--loop');

  // Registers every handler on the bus the processor dispatches into.
  bootstrapEvents();

  const config = getOutboxConfig();
  if (config.mode !== 'outbox') {
    console.error(
      `EVENT_BUS_MODE is '${config.mode}', so nothing is being written to the outbox.\n` +
        'Set EVENT_BUS_MODE=outbox to use durable delivery.'
    );
    process.exit(1);
  }

  if (loop) {
    console.log(
      `[events:worker] Polling every ${config.intervalMs}ms ` +
        `(maxAttempts=${config.maxAttempts}, lease=${config.leaseTimeoutMs}ms)`
    );

    const processor = createOutboxProcessor();
    processor.start();

    // Graceful shutdown: stop claiming new work and let the current
    // batch finish rather than being killed mid-dispatch, which would
    // leave rows leased until they time out.
    const shutdown = () => {
      console.log('\n[events:worker] Stopping…');
      processor.stop();
      process.exit(0);
    };
    process.on('SIGINT', shutdown);
    process.on('SIGTERM', shutdown);
    return;
  }

  const result = await drainOutboxOnce();
  console.log('[events:process]', JSON.stringify(result));

  // Non-zero when something was given up on, so a scheduler can alert
  // rather than reporting a clean run.
  process.exit(result.deadLettered > 0 ? 1 : 0);
}

main().catch((error) => {
  console.error('[events] Failed:', error instanceof Error ? error.message : error);
  process.exit(1);
});

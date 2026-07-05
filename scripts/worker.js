// scripts/worker.js
//
// Entry point for the dedicated worker process referenced by the
// `worker` service in docker-compose.yml. Boots every BullMQ worker and
// the cron/scheduler reconciliation pass, then stays alive to process
// jobs until SIGTERM/SIGINT.

async function main() {
  const { bootstrapWorkers } = await import('../workers/bootstrap.ts').catch(() =>
    // Compiled output path when running from a built image.
    import('../dist/workers/bootstrap.js')
  );
  await bootstrapWorkers();
}

main().catch((err) => {
  console.error('[worker.js] Fatal error during worker bootstrap:', err);
  process.exit(1);
});
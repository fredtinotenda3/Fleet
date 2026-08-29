// tests/integration/support/global-teardown.ts
//
// Stops the in-memory MongoDB started by global-setup. A leaked mongod
// keeps its data directory and its port, so a second run would fail to
// bind — which reads as a broken test rather than a leaked process.

export default async function globalTeardown(): Promise<void> {
  const server = (globalThis as Record<string, unknown>).__MONGO_SERVER__ as
    | { stop(): Promise<unknown> }
    | undefined;

  if (server) await server.stop();
}

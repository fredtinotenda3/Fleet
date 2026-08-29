// tests/integration/support/global-setup.ts
//
// HARDENING (item 2) -- starts the real MongoDB before Jest collects the
// integration suites.
//
// WHY A GLOBAL SETUP RATHER THAN beforeAll
// ----------------------------------------
// The first attempt gated the suites with
// `(harness ? describe : describe.skip)`, which does not work: describe
// blocks are evaluated when the module loads, BEFORE beforeAll has run,
// so `harness` was always null and the suites skipped even when a
// database was available. A gate that always skips is precisely the
// coverage theatre these tests exist to remove -- and it would have
// reported "21 skipped" forever while looking deliberate.
//
// globalSetup runs before any test file is loaded, so the spec can read
// availability SYNCHRONOUSLY from the environment and choose describe vs
// describe.skip correctly.
//
// Only `npm run test:integration` uses this config, so `npm test` never
// pays the startup cost of a database it does not use.

import type { Config } from 'jest';

export default async function globalSetup(_config: Config): Promise<void> {
  const required = process.env.REQUIRE_INTEGRATION_DB === 'true';

  // An existing server always wins: faster, no download, and the
  // documented fallback for restricted networks and Windows.
  if (process.env.INTEGRATION_MONGO_URI) {
    process.env.__INTEGRATION_URI__ = process.env.INTEGRATION_MONGO_URI;
    return;
  }

  try {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const { MongoMemoryServer } = require('mongodb-memory-server');
    const server = await MongoMemoryServer.create();

    process.env.__INTEGRATION_URI__ = server.getUri();
    // Stashed on the global so globalTeardown can stop the same instance.
    (globalThis as Record<string, unknown>).__MONGO_SERVER__ = server;
  } catch (error) {
    const reason =
      `Could not start mongodb-memory-server: ${(error as Error).message}\n` +
      'FALLBACKS (any one of these):\n' +
      '  INTEGRATION_MONGO_URI=mongodb://localhost:27017   use an existing mongod\n' +
      '  MONGOMS_SYSTEM_BINARY=/path/to/mongod             use a binary already on disk\n' +
      '  docker run -d -p 27017:27017 mongo:7              throwaway container\n';

    if (required) {
      // CI sets REQUIRE_INTEGRATION_DB, so an environment that is
      // SUPPOSED to have a database cannot quietly stop running these.
      throw new Error(`[integration] Database required but unavailable.\n${reason}`);
    }

    // eslint-disable-next-line no-console
    console.warn(
      `\n[integration] SKIPPING real-database tests — no MongoDB available.\n${reason}` +
        'These are the only tests that prove unique-index behaviour under real concurrency.\n'
    );
  }
}

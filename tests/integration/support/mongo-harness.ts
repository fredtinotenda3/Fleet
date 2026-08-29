// tests/integration/support/mongo-harness.ts
//
// HARDENING (item 2) -- a real MongoDB for the tests that need one.
//
// ---------------------------------------------------------------------
// WHY THESE TESTS EXIST
// ---------------------------------------------------------------------
// Every phase from 1 to 6 added a uniqueness constraint and then had to
// write, in its own summary, that the constraint could not be proven:
//
//   Phase 1  "no concurrency test for the unique telemetry index"
//   Phase 3  "does not prove Mongo's findOneAndUpdate is atomic"
//   Phase 5  "proving two concurrent handlers produce one instance
//             needs a real database"
//   Phase 6  "the in-memory doubles serialise everything"
//
// Those are all the same gap. An in-memory double cannot demonstrate
// that a unique index rejects a concurrent duplicate, because the double
// IS the thing being trusted. These suites close it against a real
// mongod.
//
// ---------------------------------------------------------------------
// THE BINARY DOWNLOAD, AND WHY THESE SKIP RATHER THAN FAIL
// ---------------------------------------------------------------------
// `mongodb-memory-server` downloads a real mongod from
// fastdl.mongodb.org on first use. That is unavailable in several
// realistic environments -- corporate proxies, air-gapped runners, and
// the environment these tests were AUTHORED in, where the request
// returns 403.
//
// So by default a suite SKIPS when the binary cannot be obtained. Two
// reasons, and the second is the important one:
//
//   * a hard failure would make `npm test` red for every developer
//     behind a proxy, and the reliable outcome of that is `--testPathIgnorePatterns`,
//     which removes the coverage permanently;
//   * a skip is VISIBLE. Jest prints it, and the console warning below
//     says exactly what is missing and how to fix it.
//
// But a silent skip forever is coverage theatre. So when
// `REQUIRE_INTEGRATION_DB=true` is set -- which CI does -- an
// unavailable binary is a HARD FAILURE. The environment that is supposed
// to have it cannot quietly stop running these.
//
// ---------------------------------------------------------------------
// WINDOWS / RESTRICTED-NETWORK FALLBACK
// ---------------------------------------------------------------------
// If the download is blocked, point the harness at a mongod you already
// have:
//
//   # Use an existing local or container mongod (recommended)
//   set INTEGRATION_MONGO_URI=mongodb://localhost:27017
//   npm run test:integration
//
//   # Or reuse a binary already on disk
//   set MONGOMS_SYSTEM_BINARY=C:\\Program Files\\MongoDB\\Server\\7.0\\bin\\mongod.exe
//   npm run test:integration
//
//   # Or a throwaway container
//   docker run -d -p 27017:27017 --name fleet-test-mongo mongo:7
//
// `INTEGRATION_MONGO_URI` is checked FIRST, so an existing server is
// preferred over a download in every environment.
//
// EACH SUITE GETS ITS OWN DATABASE NAME, and every collection is dropped
// between tests, so the suites are isolated and order-independent even
// against a shared server.

import { MongoClient, Db } from 'mongodb';

export interface MongoHarness {
  client: MongoClient;
  db: Db;
  /** Drops every collection. Called between tests for isolation. */
  clear(): Promise<void>;
  stop(): Promise<void>;
}

/**
 * Whether a database is available, known SYNCHRONOUSLY at module load.
 *
 * `global-setup.ts` runs before any test file is loaded and sets
 * `__INTEGRATION_URI__`, so a spec can choose `describe` vs
 * `describe.skip` correctly. Deciding this inside `beforeAll` does not
 * work -- describe blocks are evaluated first, so the gate would always
 * see "unavailable" and skip even when a database was running.
 */
export const MONGO_AVAILABLE = Boolean(process.env.__INTEGRATION_URI__);

/** `describe` when a database is available, `describe.skip` otherwise. */
export const describeWithMongo = MONGO_AVAILABLE ? describe : describe.skip;

/** Connects to the database started by globalSetup. */
export async function connectMongo(dbName: string): Promise<MongoHarness> {
  const uri = process.env.__INTEGRATION_URI__;
  if (!uri) {
    throw new Error(
      'connectMongo called with no database available. Guard the suite with describeWithMongo.'
    );
  }

  const client = new MongoClient(uri, { serverSelectionTimeoutMS: 10_000 });
  await client.connect();
  const db = client.db(dbName);

  return {
    client,
    db,
    async clear() {
      const collections = await db.collections();
      // Dropped rather than emptied: an index created by one test must
      // not survive into the next, or a suite would pass only because of
      // the order it happened to run in.
      await Promise.all(collections.map((c) => c.drop().catch(() => undefined)));
    },
    async stop() {
      // The server itself is stopped by globalTeardown; this only closes
      // the client. Dropping the database keeps a shared external mongod
      // (the INTEGRATION_MONGO_URI fallback) clean between runs.
      await db.dropDatabase().catch(() => undefined);
      await client.close();
    },
  };
}

/**
 * Runs `fn` from N callers at once and reports how many succeeded.
 *
 * `Promise.allSettled`, not `Promise.all`: the whole point is that some
 * callers are EXPECTED to lose a race, and `all` would reject on the
 * first duplicate-key error and tell us nothing about how many won.
 */
export async function race<T>(
  concurrency: number,
  fn: (index: number) => Promise<T>
): Promise<{ fulfilled: T[]; duplicateKeyErrors: number; otherErrors: Error[] }> {
  const results = await Promise.allSettled(
    Array.from({ length: concurrency }, (_, i) => fn(i))
  );

  const fulfilled: T[] = [];
  let duplicateKeyErrors = 0;
  const otherErrors: Error[] = [];

  for (const result of results) {
    if (result.status === 'fulfilled') {
      fulfilled.push(result.value);
    } else {
      const code = (result.reason as { code?: number })?.code;
      if (code === 11000) duplicateKeyErrors += 1;
      else otherErrors.push(result.reason as Error);
    }
  }

  return { fulfilled, duplicateKeyErrors, otherErrors };
}

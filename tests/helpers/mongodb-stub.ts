// tests/helpers/mongodb-stub.ts
//
// infrastructure/database/mongodb.ts calls connectWithMonitoring() at
// MODULE SCOPE, so merely importing anything that transitively imports it
// opens a real MongoDB connection. That is why `next build` connects to
// the database during static generation, and why the repository layer
// could not be unit tested at all.
//
// Mapped in for tests via jest.config.js `moduleNameMapper`. The proper
// fix is to make that initialization lazy (connect on first use); this
// stub unblocks testing in the meantime and is noted in the audit.
export default async function connectToDatabase(): Promise<never> {
  throw new Error(
    'connectToDatabase() should not be reached in unit tests. Override ' +
      'getCollection() in the repository under test.'
  );
}

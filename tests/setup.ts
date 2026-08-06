// tests/setup.ts
//
// Placeholder secrets for modules that read env at call time. Note that
// MONGODB_URI is no longer needed merely to IMPORT the data layer --
// infrastructure/database/mongodb.ts is now lazy and side-effect free on
// import, so the previous mongodb-stub.ts module mapping is gone. The
// isolation suite uses its own in-memory collection and never connects.
process.env.NEXTAUTH_SECRET = process.env.NEXTAUTH_SECRET || 'test-secret-not-used';
process.env.JWT_SECRET = process.env.JWT_SECRET || 'test-secret-not-used';

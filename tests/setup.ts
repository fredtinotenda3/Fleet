// tests/setup.ts
//
// Placeholder secrets for modules that read env at call time. Note that
// MONGODB_URI is no longer needed merely to IMPORT the data layer --
// infrastructure/database/mongodb.ts is now lazy and side-effect free on
// import, so the previous mongodb-stub.ts module mapping is gone. The
// isolation suite uses its own in-memory collection and never connects.
//
// The JWT secrets below are long enough to satisfy the resolver in
// infrastructure/security/jwt-secrets.ts, which now THROWS on an unset,
// published-placeholder or under-24-character value rather than falling
// back to a literal (that fallback was a full authentication bypass --
// see that file's header). They are test values that sign nothing a real
// deployment will ever verify, and the access and refresh secrets are
// deliberately DIFFERENT, matching the production requirement.
process.env.NEXTAUTH_SECRET =
  process.env.NEXTAUTH_SECRET || 'test-access-secret-not-used-in-any-deployment';
process.env.REFRESH_TOKEN_SECRET =
  process.env.REFRESH_TOKEN_SECRET || 'test-refresh-secret-not-used-in-any-deployment';
process.env.JWT_SECRET = process.env.JWT_SECRET || 'test-jwt-secret-not-used-anywhere';

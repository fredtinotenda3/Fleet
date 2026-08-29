// jest.integration.config.js
//
// HARDENING (item 2). A SEPARATE config so `npm test` never starts a
// database it does not use, and so the integration suites can have a
// longer timeout (a first-run binary download is slow) without relaxing
// the timeout for every other suite.
const base = require('./jest.config');

module.exports = {
  ...base,
  testMatch: ['<rootDir>/tests/integration/**/*.spec.ts'],
  globalSetup: '<rootDir>/tests/integration/support/global-setup.ts',
  globalTeardown: '<rootDir>/tests/integration/support/global-teardown.ts',
  // Generous: covers a cold binary download on a CI runner.
  testTimeout: 180_000,
};

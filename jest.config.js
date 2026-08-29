/** Jest configuration.
 *
 * FIX: the previous config declared `preset: "ts-jest"` while neither
 * jest nor ts-jest was installed, and package.json had no `test` script
 * at all — so `npm run test:unit` (referenced by CI) simply did not
 * exist. Nothing had ever run.
 */
module.exports = {
  preset: 'ts-jest',
  testEnvironment: 'node',
  roots: ['<rootDir>/tests'],
  testMatch: ['**/*.spec.ts', '**/*.test.ts'],
  testPathIgnorePatterns: ['/node_modules/', '/.next/'],
  moduleNameMapper: {
    '^@/(.*)$': '<rootDir>/$1',
  },
  transform: {
    '^.+\\.tsx?$': ['ts-jest', { tsconfig: { module: 'commonjs', esModuleInterop: true, target: 'ES2020', strict: false } }],
    // HARDENING (item 3): jose v6 is ESM-only with no CommonJS build, so
    // it must be down-levelled for Jest. Paired with the narrow
    // transformIgnorePatterns below, this transforms ONLY jose and
    // @panva — every other node_modules package is still skipped, so the
    // cost does not fall on the whole suite.
    '^.+\\.m?js$': ['ts-jest', { tsconfig: { module: 'commonjs', allowJs: true, target: 'ES2020', strict: false, checkJs: false } }],
  },
  // HARDENING (item 3): `jose` (and its `@panva/hkdf` dependency) ship
  // ESM only. Jest does not transform node_modules by default, so any
  // test importing a route handler that reaches the auth chain died with
  // "SyntaxError: Unexpected token 'export'". Narrowly scoped to those
  // two packages rather than transforming node_modules wholesale, which
  // would slow every suite for the sake of two dependencies.
  transformIgnorePatterns: ['node_modules/(?!(jose|@panva)/)'],
  setupFiles: ['<rootDir>/tests/setup.ts'],
  testTimeout: 60000,
  collectCoverageFrom: ['server/tenancy/**/*.ts', 'server/repositories/**/*.ts'],
};

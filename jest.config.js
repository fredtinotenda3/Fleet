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
  },
  setupFiles: ['<rootDir>/tests/setup.ts'],
  testTimeout: 60000,
  collectCoverageFrom: ['server/tenancy/**/*.ts', 'server/repositories/**/*.ts'],
};

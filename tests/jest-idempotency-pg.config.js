module.exports = {
  preset: 'ts-jest',
  testEnvironment: 'node',
  rootDir: '..',
  setupFiles: ['<rootDir>/tests/setup-idempotency-pg.ts'],
  testRegex: '/tests/integration/idempotency-concurrency\\.int-spec\\.ts$',
  moduleFileExtensions: ['ts', 'js', 'json'],
  testTimeout: 30000,
};

module.exports = {
  preset: 'ts-jest',
  testEnvironment: 'node',
  rootDir: '..',
  setupFiles: ['<rootDir>/tests/setup-env.ts'],
  testRegex: '/tests/integration/waha-.*\\.int-spec\\.ts$',
  moduleFileExtensions: ['ts', 'js', 'json'],
  testTimeout: 30000,
};

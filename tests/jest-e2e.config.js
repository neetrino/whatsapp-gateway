module.exports = {
  preset: 'ts-jest',
  testEnvironment: 'node',
  rootDir: '..',
  setupFiles: ['<rootDir>/tests/setup-env.ts'],
  testRegex: '/tests/e2e/.*\\.e2e-spec\\.ts$',
  moduleFileExtensions: ['ts', 'js', 'json'],
  moduleNameMapper: { '^@/(.*)$': '<rootDir>/src/$1' },
  testTimeout: 30000,
};

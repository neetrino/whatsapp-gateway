module.exports = {
  preset: 'ts-jest',
  testEnvironment: 'node',
  rootDir: '.',
  setupFiles: ['<rootDir>/tests/setup-env.ts'],
  testRegex: '(/tests/unit/.*|\\.spec)\\.ts$',
  moduleFileExtensions: ['ts', 'js', 'json'],
  moduleNameMapper: { '^@/(.*)$': '<rootDir>/src/$1' },
  collectCoverageFrom: ['src/**/*.ts', '!src/**/*.module.ts', '!src/main.ts'],
  coverageDirectory: 'coverage',
};

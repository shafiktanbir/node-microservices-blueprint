/** @type {import('ts-jest').JestConfigWithTsJest} */
module.exports = {
  preset: 'ts-jest',
  testEnvironment: 'node',
  roots: ['<rootDir>/src'],
  testMatch: ['**/*.test.ts'],
  transform: {
    '^.+\\.tsx?$': ['ts-jest', { tsconfig: 'tsconfig.json', isolatedModules: true }],
  },
  moduleNameMapper: {
    '^@blueprint/shared$': '<rootDir>/../shared/dist/index.js',
  },
};

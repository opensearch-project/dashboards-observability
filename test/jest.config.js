/*
 * Copyright OpenSearch Contributors
 * SPDX-License-Identifier: Apache-2.0
 */

process.env.TZ = 'UTC';

module.exports = {
  rootDir: '../',
  setupFiles: ['<rootDir>/test/setupTests.ts'],
  setupFilesAfterEnv: ['jest-location-mock', '<rootDir>/test/setup.jest.ts'],
  roots: ['<rootDir>'],
  testMatch: ['**/*.test.js', '**/*.test.jsx', '**/*.test.ts', '**/*.test.tsx'],
  clearMocks: true,
  modulePathIgnorePatterns: ['<rootDir>/offline-module-cache/'],
  testPathIgnorePatterns: ['<rootDir>/build/', '<rootDir>/node_modules/'],
  coveragePathIgnorePatterns: [
    '<rootDir>/build/',
    '<rootDir>/node_modules/',
    '<rootDir>/test/',
    '<rootDir>/public/requests/',
  ],
  transformIgnorePatterns: ['<rootDir>/node_modules'],
  moduleNameMapper: {
    '\\.(css|less|sass|scss)$': '<rootDir>/test/__mocks__/styleMock.js',
    '\\.(gif|ttf|eot|svg|png)$': '<rootDir>/test/__mocks__/fileMock.js',
    '\\@algolia/autocomplete-theme-classic$': '<rootDir>/test/__mocks__/styleMock.js',
    '^!!raw-loader!.*': '<rootDir>/test/__mocks__/rawLoaderMock.js',
    // OpenSearch Dashboards path mappings
    '^opensearch-dashboards/public$': '<rootDir>/../../src/core/public',
    '^opensearch-dashboards/public/(.*)$': '<rootDir>/../../src/core/public/$1',
    '^opensearch-dashboards/server$': '<rootDir>/../../src/core/server',
    '^opensearch-dashboards/server/(.*)$': '<rootDir>/../../src/core/server/$1',
    '^opensearch-dashboards$': '<rootDir>/../../opensearch_dashboards',
    '@hapi/hoek/(?!lib/)(.*)': '<rootDir>/../../node_modules/@hapi/hoek/lib/$1',
  },
  testEnvironment: 'jsdom',
  testEnvironmentOptions: {
    // Set the default URL so window.location.origin is 'http://localhost:5601' rather than
    // 'http://localhost', avoiding the need for tests to mock window.location.origin.
    url: 'http://localhost:5601',
  },
  // Retain Jest 28 snapshot defaults; Jest 29 flipped escapeString and printBasicPrototype to false,
  // which would invalidate existing snapshots. See https://jestjs.io/docs/29.0/upgrading-to-jest29
  snapshotFormat: {
    escapeString: true,
    printBasicPrototype: true,
  },
};

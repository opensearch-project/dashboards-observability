/*
 * Copyright OpenSearch Contributors
 * SPDX-License-Identifier: Apache-2.0
 */

const LICENSE_HEADER = `/*
 * Copyright OpenSearch Contributors
 * SPDX-License-Identifier: Apache-2.0
 */`;

module.exports = {
  root: true,
  extends: [
    '@elastic/eslint-config-kibana',
    'plugin:@elastic/eui/recommended',
    'plugin:react-hooks/recommended',
    "eslint:recommended",
    "plugin:cypress/recommended",
    "plugin:import/recommended",
    "prettier"
  ],
  env: {
    'cypress/globals': true,
  },
  plugins: [
    'cypress',
  ],
  rules: {
    '@osd/eslint/no-restricted-paths': [
      'error',
      {
        basePath: __dirname,
        zones: [
          {
            target: ['(public|server)/**/*'],
            from: ['../../packages/**/*','packages/**/*'],
          },
        ],
      },
    ],
    // Add cypress specific rules here
    'cypress/no-assigning-return-values': 'error',
    'cypress/no-unnecessary-waiting': 'error',
    'cypress/assertion-before-screenshot': 'warn',
    'cypress/no-force': 'warn',
    'cypress/no-async-tests': 'error',
  },
  overrides: [
    {
      files: ['**/*.{js,ts,tsx}'],
      rules: {
        'no-console': 0,
        '@osd/eslint/require-license-header': [
          'error',
          {
            licenses: [LICENSE_HEADER],
          },
        ],
      },
    },
  ],
  "ignorePatterns": ["**/*.d.ts"]
};

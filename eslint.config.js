/*
 * Copyright OpenSearch Contributors
 * SPDX-License-Identifier: Apache-2.0
 */

const cypressPlugin = require('eslint-plugin-cypress');

const osdConfig = require('@elastic/eslint-config-kibana');
const { eui } = require('@elastic/eslint-config-kibana/extras');

const LICENSE_HEADER = `/*
 * Copyright OpenSearch Contributors
 * SPDX-License-Identifier: Apache-2.0
 */`;

module.exports = [
  // Replaces .eslintignore + package.json `eslintIgnore` (ESLint 10 reads neither).
  {
    ignores: [
      'node_modules',
      'data',
      'build',
      'target',
      'cypress.config.js',
      'common/query_manager/antlr/output/**',
      '**/*.d.ts',
    ],
  },
  ...osdConfig,
  ...eui,
  {
    // Register Cypress + mocha globals for the .cypress/ integration specs
    // (previously provided by the old kibana eslint config's cypress env).
    files: ['.cypress/**/*.{js,ts}', 'cypress.config.js'],
    plugins: {
      cypress: cypressPlugin,
    },
    languageOptions: {
      globals: {
        ...cypressPlugin.configs.globals.languageOptions.globals,
      },
    },
  },
  {
    files: ['**/*.{js,mjs,ts,tsx}'],
    rules: {
      '@typescript-eslint/no-unused-vars': [
        'warn',
        {
          argsIgnorePattern: '^_',
          varsIgnorePattern: '^_',
          caughtErrorsIgnorePattern: '^_',
        },
      ],
      '@typescript-eslint/no-explicit-any': 'warn',
      'no-console': 0,
      // The shared `eui` config targets a newer upstream EUI than the
      // `@opensearch-project/oui@1.22.1` this repo aliases `@elastic/eui` to.
      // These two rules autofix in props (`announceOnMount` on EuiCallOut,
      // `disableScreenReaderOutput` on EuiToolTip) that don't exist in OUI
      // 1.22.1's type defs, so `--fix` (incl. the lint-staged pre-commit hook)
      // injects code that fails `yarn typecheck`. Disable until OUI catches up.
      '@elastic/eui/callout-announce-on-mount': 'off',
      '@elastic/eui/sr-output-disabled-tooltip': 'off',
      '@osd/eslint/no-restricted-paths': [
        'error',
        {
          basePath: __dirname,
          zones: [
            {
              target: ['(public|server)/**/*'],
              from: ['../../packages/**/*', 'packages/**/*'],
            },
          ],
        },
      ],
      'jest/expect-expect': [
        'warn',
        {
          // Allow using custom expect test helpers as long as the name starts with `expect`.
          assertFunctionNames: ['expect*'],
        },
      ],
      '@osd/eslint/require-license-header': ['error', { licenses: [LICENSE_HEADER] }],
    },
  },
];

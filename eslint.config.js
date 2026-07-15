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
    // Mirror the root OpenSearch Dashboards `eslint.config.js` "adjust Eui
    // accessibility rules project-wide" block. The shared `eui` config targets
    // a newer upstream EUI than the `@opensearch-project/oui@1.22.1` this repo
    // aliases `@elastic/eui` to (a repo-wide alias set in the root
    // package.json). Several of these rules are `fixable: 'code'` and autofix
    // in props/APIs that OUI 1.22.1 does not ship (e.g. `announceOnMount` on
    // EuiCallOut, `disableScreenReaderOutput` on EuiToolTip), so `--fix` (incl.
    // the lint-staged pre-commit hook) injects code that fails `yarn
    // typecheck`. Keep this list in sync with the root config until OUI catches
    // up to the EUI version the lint plugin expects.
    rules: {
      '@elastic/eui/badge-accessibility-rules': 'off',
      '@elastic/eui/callout-announce-on-mount': 'off',
      '@elastic/eui/icon-accessibility-rules': 'off',
      '@elastic/eui/no-css-color': 'off',
      '@elastic/eui/no-restricted-eui-imports': 'off',
      '@elastic/eui/no-static-z-index': 'off',
      '@elastic/eui/no-unnamed-interactive-element': 'off',
      '@elastic/eui/no-unnamed-radio-group': 'off',
      '@elastic/eui/prefer-eui-icon-tip': 'off',
      '@elastic/eui/require-aria-label-for-modals': 'off',
      '@elastic/eui/require-href-for-link': 'off',
      '@elastic/eui/require-table-caption': 'off',
      '@elastic/eui/sr-output-disabled-tooltip': 'off',
      '@elastic/eui/tooltip-button-icon-wrap': 'off',
      '@elastic/eui/tooltip-focusable-anchor': 'off',
    },
  },
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

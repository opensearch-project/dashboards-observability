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
  ],
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
};

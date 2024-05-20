/*
 * Copyright OpenSearch Contributors
 * SPDX-License-Identifier: Apache-2.0
 */

import { getTimeRangeFromCountDistribution } from '../utils';

describe('getTimeRangeFromCountDistribution', () => {
  it('gets from first and last element of span', () => {
    const results = getTimeRangeFromCountDistribution({
      data: {
        'count()': [194],
        'span(timestamp,1d)': ['2024-01-01 00:00:00', '2024-01-02 00:00:00', '2024-01-03 00:00:00'],
      },
      metadata: {
        fields: [
          { name: 'count()', type: 'integer' },
          { name: 'span(timestamp,1d)', type: 'timestamp' },
        ],
      },
    });

    expect(results).toMatchInlineSnapshot(`
      Object {
        "endTime": "2024-01-03 00:00:00",
        "startTime": "2024-01-01 00:00:00",
      }
    `);
  });

  it('handles empty inputs and returns undefined', () => {
    const results = getTimeRangeFromCountDistribution({
      data: {
        'count()': [194],
        'span(timestamp,1d)': [],
      },
      metadata: {
        fields: [
          { name: 'count()', type: 'integer' },
          { name: 'span(timestamp,1d)', type: 'timestamp' },
        ],
      },
    });

    expect(results).toMatchInlineSnapshot(`
      Object {
        "endTime": undefined,
        "startTime": undefined,
      }
    `);
  });
});

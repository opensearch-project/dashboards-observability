/*
 * Copyright OpenSearch Contributors
 * SPDX-License-Identifier: Apache-2.0
 */

import { getCompleteTimespanKey, preprocessJsonData } from '../common';

describe('getCompleteTimespanKey', () => {
  it('returns span key for valid span config', () => {
    const span = {
      time_field: [{ name: 'timestamp', type: 'timestamp', label: 'timestamp' }],
      interval: '1',
      unit: [{ name: 'd', label: 'd', value: 'd' }],
    };
    expect(getCompleteTimespanKey(span)).toEqual({
      name: 'span(timestamp,1d)',
      label: 'span(timestamp,1d)',
    });
  });

  it('returns empty string for empty span', () => {
    expect(getCompleteTimespanKey({})).toBe('');
  });
});

describe('preprocessJsonData', () => {
  const span = {
    time_field: [{ name: 'timestamp', type: 'timestamp', label: 'timestamp' }],
    interval: '1',
    unit: [{ name: 'd', label: 'd', value: 'd' }],
  };

  const series = [{ aggregation: 'avg', name: 'bytes', label: 'bytes' }];

  it('handles lowercase span() field names', () => {
    const data = [{ 'span(timestamp,1d)': '2021-01-01', 'avg(bytes)': 100 }];
    const result = preprocessJsonData(data, { dimensions: [], series, span });
    expect(result[0].x).toBe('2021-01-01');
    expect(result[0].value).toBe(100);
  });

  it('handles uppercase SPAN() field names', () => {
    const data = [{ 'SPAN(timestamp,1d)': '2021-01-01', 'avg(bytes)': 100 }];
    const result = preprocessJsonData(data, { dimensions: [], series, span });
    expect(result[0].x).toBe('2021-01-01');
    expect(result[0].value).toBe(100);
  });

  it('handles mixed case Span() field names', () => {
    const data = [{ 'Span(timestamp,1d)': '2021-01-01', 'avg(bytes)': 100 }];
    const result = preprocessJsonData(data, { dimensions: [], series, span });
    expect(result[0].x).toBe('2021-01-01');
    expect(result[0].value).toBe(100);
  });
});

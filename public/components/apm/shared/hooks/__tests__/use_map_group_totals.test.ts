/*
 * Copyright OpenSearch Contributors
 * SPDX-License-Identifier: Apache-2.0
 */

import { renderHook, waitFor } from '@testing-library/react';
import {
  ALL_GROUPS_KEY,
  groupByPrometheusLabel,
  readGroupValues,
  useMapGroupTotals,
} from '../use_map_group_totals';
import { getQueryMapGroupTotals } from '../../../query_services/query_requests/promql_queries';

const mockExecuteInstantQuery = jest.fn();
jest.mock('../../../query_services/promql_search_service', () => ({
  PromQLSearchService: jest.fn().mockImplementation(() => ({
    executeInstantQuery: mockExecuteInstantQuery,
  })),
}));
jest.mock('../../../config/apm_config_context', () => ({
  useApmConfig: () => ({ config: { prometheusDataSource: { name: 'prom' } } }),
}));

describe('getQueryMapGroupTotals', () => {
  it('sums SERVER-span series by the group label, or into one total', () => {
    expect(getQueryMapGroupTotals('request', 'environment', '15m')).toBe(
      'sum by (environment) (sum_over_time(request{remoteService="", namespace="span_derived"}[15m]))'
    );
    expect(getQueryMapGroupTotals('fault', null, '1h')).toBe(
      'sum (sum_over_time(fault{remoteService="", namespace="span_derived"}[1h]))'
    );
  });

  it('maps group-by attributes to Prometheus labels', () => {
    expect(groupByPrometheusLabel('environment')).toBe('environment');
    expect(groupByPrometheusLabel('telemetry.sdk.language')).toBe('telemetry_sdk_language');
  });
});

describe('readGroupValues', () => {
  it('reads data frames (Labels or Series) and standard vectors', () => {
    const frame = {
      type: 'data_frame',
      fields: [
        { name: 'Labels', values: [{ environment: 'dev' }, { environment: 'qa' }] },
        { name: 'Value', values: [10, 4] },
      ],
    };
    expect(readGroupValues(frame, 'environment')).toEqual(
      new Map([
        ['dev', 10],
        ['qa', 4],
      ])
    );
    const series = {
      type: 'data_frame',
      fields: [
        { name: 'Series', values: ['{environment="dev"}'] },
        { name: 'Value', values: ['7'] },
      ],
    };
    expect(readGroupValues(series, 'environment')).toEqual(new Map([['dev', 7]]));
    expect(readGroupValues({ data: { result: [{ metric: {}, value: [1, '42'] }] } }, null)).toEqual(
      new Map([[ALL_GROUPS_KEY, 42]])
    );
  });
});

describe('useMapGroupTotals', () => {
  const params = {
    groupBy: 'environment',
    startTime: new Date('2026-01-01T00:00:00Z'),
    endTime: new Date('2026-01-01T00:15:00Z'),
    enabled: true,
  };
  const vector = (dev: number, qa: number) => ({
    data: {
      result: [
        { metric: { environment: 'dev' }, value: [1, String(dev)] },
        { metric: { environment: 'qa' }, value: [1, String(qa)] },
      ],
    },
  });

  beforeEach(() => mockExecuteInstantQuery.mockReset());

  it('issues three grouped queries and returns totals per group', async () => {
    mockExecuteInstantQuery.mockImplementation(({ query }: { query: string }) =>
      Promise.resolve(
        query.includes('request{')
          ? vector(100, 50)
          : query.includes('fault{')
            ? vector(5, 0)
            : vector(1, 2)
      )
    );
    const { result } = renderHook(() => useMapGroupTotals(params));
    expect(result.current.isLoading).toBe(true);
    await waitFor(() => expect(result.current.totals).not.toBeNull());

    expect(mockExecuteInstantQuery).toHaveBeenCalledTimes(3);
    expect(result.current.totals?.get('dev')).toEqual({
      totalRequests: 100,
      totalFaults: 5,
      totalErrors: 1,
    });
    expect(result.current.isLoading).toBe(false);
  });

  it('issues nothing when disabled', () => {
    const { result } = renderHook(() => useMapGroupTotals({ ...params, enabled: false }));
    expect(mockExecuteInstantQuery).not.toHaveBeenCalled();
    expect(result.current).toEqual({ totals: null, isLoading: false });
  });
});

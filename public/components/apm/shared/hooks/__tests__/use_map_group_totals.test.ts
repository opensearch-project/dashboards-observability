/*
 * Copyright OpenSearch Contributors
 * SPDX-License-Identifier: Apache-2.0
 */

import { renderHook, waitFor, act } from '@testing-library/react';
import {
  groupByPrometheusLabel,
  readGroupValues,
  useMapGroupTotals,
} from '../use_map_group_totals';
import { ALL_GROUPS_KEY } from '../../../common/constants';
import { getQueryMapGroupTotals } from '../../../query_services/query_requests/promql_queries';

const mockExecuteInstantQuery = jest.fn();
jest.mock('../../../query_services/promql_search_service', () => ({
  PromQLSearchService: jest.fn().mockImplementation(() => ({
    executeInstantQuery: mockExecuteInstantQuery,
  })),
}));
const mockConfig: { current: Record<string, unknown> } = {
  current: { prometheusDataSource: { name: 'prom' } },
};
jest.mock('../../../config/apm_config_context', () => ({
  useApmConfig: () => ({ config: mockConfig.current }),
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

  it('sanitizes keys that are valid attributes but not valid Prometheus labels', () => {
    expect(groupByPrometheusLabel('k8s-namespace')).toBe('k8s_namespace');
    expect(groupByPrometheusLabel('team/owner name')).toBe('team_owner_name');
    expect(groupByPrometheusLabel('9tier')).toBe('_9tier');
    expect(groupByPrometheusLabel('a"){} or vector(1)')).toBe('a_____or_vector_1_');
    ['k8s-namespace', '9tier', 'service.version', 'ünïcode'].forEach((key) =>
      expect(groupByPrometheusLabel(key)).toMatch(/^[a-zA-Z_][a-zA-Z0-9_]*$/)
    );
    expect(groupByPrometheusLabel('')).toBeNull();
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

  it('matches the whole label name in a series string', () => {
    const series = {
      type: 'data_frame',
      fields: [
        { name: 'Series', values: ['{deployment_environment="x", environment="dev"}'] },
        { name: 'Value', values: ['3'] },
      ],
    };
    expect(readGroupValues(series, 'environment')).toEqual(new Map([['dev', 3]]));
    expect(readGroupValues(series, 'deployment_environment')).toEqual(new Map([['x', 3]]));
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
    expect(result.current).toEqual(
      expect.objectContaining({ totals: null, isLoading: false, failed: false })
    );
  });

  it('a failed query makes the totals unavailable (not a healthy 0), and retry re-runs them', async () => {
    mockExecuteInstantQuery.mockImplementation(({ query }: { query: string }) =>
      query.includes('fault{')
        ? Promise.reject(new Error('timed out'))
        : Promise.resolve(vector(1, 1))
    );
    const { result } = renderHook(() => useMapGroupTotals(params));
    await waitFor(() => expect(result.current.failed).toBe(true));
    expect(result.current.totals).toBeNull();
    expect(result.current.isLoading).toBe(false);
    expect(result.current.error?.message).toBe('timed out');

    mockExecuteInstantQuery.mockResolvedValue(vector(1, 1));
    act(() => result.current.retry());
    await waitFor(() => expect(result.current.totals).not.toBeNull());
    expect(result.current.failed).toBe(false);
  });

  it('a result truncated at the series limit is unavailable too', async () => {
    mockExecuteInstantQuery.mockResolvedValue({
      type: 'data_frame',
      fields: [],
      meta: { truncation: { tableTruncated: true } },
    });
    const { result } = renderHook(() => useMapGroupTotals(params));
    await waitFor(() => expect(result.current.failed).toBe(true));
  });

  it('a malformed response fails the totals instead of leaving them loading', async () => {
    // A value field without `values` makes reading the frame throw.
    mockExecuteInstantQuery.mockResolvedValue({
      type: 'data_frame',
      fields: [{ name: 'Series' }, { name: 'Value' }],
    });
    jest.spyOn(console, 'error').mockImplementation(() => {});
    const { result } = renderHook(() => useMapGroupTotals(params));
    await waitFor(() => expect(result.current.isLoading).toBe(false));
    expect(result.current.failed).toBe(true);
    expect(result.current.totals).toBeNull();
    expect(result.current.error).toBeInstanceOf(Error);
  });

  it('groups by the sanitized label', async () => {
    mockExecuteInstantQuery.mockResolvedValue({
      data: { result: [{ metric: { k8s_namespace: 'shop' }, value: [1, '4'] }] },
    });
    const { result } = renderHook(() => useMapGroupTotals({ ...params, groupBy: 'k8s-namespace' }));
    await waitFor(() => expect(result.current.totals).not.toBeNull());
    mockExecuteInstantQuery.mock.calls.forEach((c) =>
      expect(c[0].query).toMatch(/^sum by \(k8s_namespace\) /)
    );
    expect(result.current.totals?.get('shop')?.totalRequests).toBe(4);
  });
});

describe('useMapGroupTotals without a Prometheus connection', () => {
  afterEach(() => {
    mockConfig.current = { prometheusDataSource: { name: 'prom' } };
  });

  it('is unavailable rather than loading forever', () => {
    mockConfig.current = {};
    const { result } = renderHook(() =>
      useMapGroupTotals({
        groupBy: null,
        startTime: new Date('2026-01-01T00:00:00Z'),
        endTime: new Date('2026-01-01T00:15:00Z'),
        enabled: true,
      })
    );
    expect(result.current.isLoading).toBe(false);
    expect(result.current.failed).toBe(true);
    expect(mockExecuteInstantQuery).not.toHaveBeenCalled();
  });
});

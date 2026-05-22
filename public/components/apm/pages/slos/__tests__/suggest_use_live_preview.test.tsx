/*
 * Copyright OpenSearch Contributors
 * SPDX-License-Identifier: Apache-2.0
 */

import { renderHook, waitFor } from '@testing-library/react';

const mockExecuteInstantQuery = jest.fn();

jest.mock('../../../query_services/promql_search_service', () => ({
  PromQLSearchService: jest.fn().mockImplementation(() => ({
    executeInstantQuery: mockExecuteInstantQuery,
  })),
}));

import { useLivePreview } from '../suggest_use_live_preview';
import type { Suggestion } from '../suggest_engine';
import type { SloApiClient } from '../slo_api_client';
import type { GeneratedRuleGroup } from '../../../../../../common/slo/slo_types';

function fakeSuggestion(
  key: string,
  kindId: 'http-availability' | 'apm-latency' = 'http-availability'
): Suggestion {
  return ({
    key,
    kindId,
    kind: 'k',
    reason: '',
    sourceMetric: 'm',
    detected: {},
    estimatedRuleCount: 13,
    input: {
      spec: {
        datasourceId: 'ds-1',
        name: key,
        enabled: true,
        mode: 'active',
        service: 'cart',
        owner: { teams: ['t'] },
        sli: {
          type: 'single',
          definition: {
            backend: 'prometheus',
            type: 'availability',
            calcMethod: 'events',
            metric: 'm',
          },
          dimensions: [{ name: 'service_name', value: 'cart' }],
        },
        objectives: [{ name: 'o', target: 0.99 }],
        budgetWarningThresholds: [],
        window: { type: 'rolling', duration: '28d' },
        alerting: { strategy: 'mwmbr', burnRates: [] },
        alarms: {
          sliHealth: { enabled: false },
          attainmentBreach: { enabled: false },
          budgetWarning: { enabled: true },
          noData: { enabled: false, forDuration: '10m' },
          resolved: { enabled: false },
        },
        exclusionWindows: [],
        labels: {},
        annotations: {},
      },
    },
  } as unknown) as Suggestion;
}

const fakeGroup: GeneratedRuleGroup = {
  groupName: 'g',
  interval: 30,
  rules: [],
  yaml: '',
};

describe('useLivePreview', () => {
  beforeEach(() => {
    mockExecuteInstantQuery.mockReset();
  });

  it('emits a per-key loading PerPreview synchronously and a success on resolve', async () => {
    const preview = jest.fn().mockResolvedValue(fakeGroup);
    const apiClient = ({ preview } as unknown) as Pick<SloApiClient, 'preview'>;
    mockExecuteInstantQuery.mockResolvedValue({
      fields: [{ name: 'Value', values: ['0.99'] }],
    });

    const { result } = renderHook(() =>
      useLivePreview({
        apiClient,
        selectedSuggestions: [fakeSuggestion('a'), fakeSuggestion('b')],
        windowChoice: '24h',
        prometheusConnectionId: 'prom-1',
      })
    );

    expect(result.current.previews.map((p) => p.status)).toEqual(['loading', 'loading']);

    await waitFor(() => {
      expect(result.current.previews.every((p) => p.status === 'success')).toBe(true);
    });
    expect(preview).toHaveBeenCalledTimes(2);
  });

  it('marks per-row error when preview rejects without blocking siblings', async () => {
    const preview = jest
      .fn()
      .mockResolvedValueOnce(fakeGroup)
      .mockRejectedValueOnce(new Error('preview failed'));
    const apiClient = ({ preview } as unknown) as Pick<SloApiClient, 'preview'>;
    mockExecuteInstantQuery.mockResolvedValue(undefined);

    const { result } = renderHook(() =>
      useLivePreview({
        apiClient,
        selectedSuggestions: [fakeSuggestion('a'), fakeSuggestion('b')],
        windowChoice: '1h',
        prometheusConnectionId: 'prom-1',
      })
    );

    await waitFor(() => {
      expect(result.current.previews.length).toBe(2);
      expect(result.current.previews.every((p) => p.status !== 'loading')).toBe(true);
    });
    const statuses = result.current.previews.map((p) => p.status).sort();
    expect(statuses).toEqual(['error', 'success']);
  });

  it('skips live SLI when no prometheusConnectionId is supplied', async () => {
    const preview = jest.fn().mockResolvedValue(fakeGroup);
    const apiClient = ({ preview } as unknown) as Pick<SloApiClient, 'preview'>;
    const { result } = renderHook(() =>
      useLivePreview({
        apiClient,
        selectedSuggestions: [fakeSuggestion('a')],
        windowChoice: '1h',
      })
    );
    await waitFor(() => {
      expect(result.current.liveByKey.a).toEqual({ status: 'skipped' });
    });
    expect(mockExecuteInstantQuery).not.toHaveBeenCalled();
  });

  it('populates liveByKey with sliRatio / totalSamples / p99Ms on success', async () => {
    const preview = jest.fn().mockResolvedValue(fakeGroup);
    const apiClient = ({ preview } as unknown) as Pick<SloApiClient, 'preview'>;
    // 3 fan-out queries per row — return distinct values to verify the mapping.
    mockExecuteInstantQuery
      .mockResolvedValueOnce({ fields: [{ name: 'Value', values: ['0.91'] }] })
      .mockResolvedValueOnce({ fields: [{ name: 'Value', values: ['1234'] }] })
      .mockResolvedValueOnce({ fields: [{ name: 'Value', values: ['82'] }] });

    const { result } = renderHook(() =>
      useLivePreview({
        apiClient,
        selectedSuggestions: [fakeSuggestion('a')],
        windowChoice: '1h',
        prometheusConnectionId: 'prom-1',
      })
    );
    await waitFor(() => {
      expect(result.current.liveByKey.a?.status).toBe('success');
    });
    expect(result.current.liveByKey.a).toEqual(
      expect.objectContaining({
        sliRatio: 0.91,
        totalSamples: 1234,
        p99Ms: 82,
      })
    );
  });

  it('survives executeInstantQuery rejection (per-query catch) and yields a success row with undefined values', async () => {
    const preview = jest.fn().mockResolvedValue(fakeGroup);
    const apiClient = ({ preview } as unknown) as Pick<SloApiClient, 'preview'>;
    mockExecuteInstantQuery.mockRejectedValue(new Error('cortex 502'));
    const { result } = renderHook(() =>
      useLivePreview({
        apiClient,
        selectedSuggestions: [fakeSuggestion('a')],
        windowChoice: '1h',
        prometheusConnectionId: 'prom-1',
      })
    );
    await waitFor(() => {
      expect(result.current.liveByKey.a?.status).toBe('success');
    });
    expect(result.current.liveByKey.a?.sliRatio).toBeUndefined();
    expect(result.current.liveByKey.a?.p99Ms).toBeUndefined();
  });
});

/*
 * Copyright OpenSearch Contributors
 * SPDX-License-Identifier: Apache-2.0
 */
import { act, renderHook, waitFor } from '@testing-library/react';

const mockListRules = jest.fn();
jest.mock('../../query_services/alerting_opensearch_service', () => ({
  AlertingOpenSearchService: jest.fn().mockImplementation(() => ({ listRules: mockListRules })),
}));
import { useRulesData } from '../use_rules_data';

const rule = (id: string, datasourceId: string) => ({ id, name: id, datasourceId });
const status = (datasourceName: string, extra: Record<string, unknown> = {}) => ({
  datasourceName,
  status: 'success',
  ...extra,
});

beforeEach(() => mockListRules.mockReset());

describe('useRulesData', () => {
  it('leaves CloudWatch out of background polls and keeps its last rows', async () => {
    mockListRules.mockResolvedValueOnce({
      results: [rule('os-1', 'ds-os'), rule('cw-1', 'cloudwatch')],
      datasourceStatus: [status('Local'), status('CloudWatch', { truncated: true })],
    });
    const selectedDsIds = ['ds-os', 'cloudwatch'];
    const { result } = renderHook(() => useRulesData({ selectedDsIds }));
    await waitFor(() => expect(result.current.rules).toHaveLength(2));
    expect(result.current.truncatedDatasourceNames).toEqual(['CloudWatch']);

    mockListRules.mockResolvedValueOnce({
      results: [rule('os-2', 'ds-os')],
      datasourceStatus: [status('Local')],
    });
    await act(async () => result.current.backgroundRefetch());
    expect(mockListRules).toHaveBeenLastCalledWith({ dsIds: ['ds-os'] });
    await waitFor(() => expect(result.current.rules.map((r) => r.id)).toEqual(['os-2', 'cw-1']));
    // What the last full fetch said about CloudWatch still stands.
    expect(result.current.truncatedDatasourceNames).toEqual(['CloudWatch']);
  });

  it('includes CloudWatch in explicit refetches', async () => {
    mockListRules.mockResolvedValue({ results: [], datasourceStatus: [] });
    const selectedDsIds = ['cloudwatch'];
    const { result } = renderHook(() => useRulesData({ selectedDsIds }));
    await waitFor(() => expect(mockListRules).toHaveBeenCalledTimes(1));
    await act(async () => result.current.refetch());
    await waitFor(() => expect(mockListRules).toHaveBeenCalledTimes(2));
    expect(mockListRules).toHaveBeenLastCalledWith({ dsIds: ['cloudwatch'] });
  });
});

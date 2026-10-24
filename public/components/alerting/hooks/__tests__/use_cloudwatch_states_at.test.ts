/*
 * Copyright OpenSearch Contributors
 * SPDX-License-Identifier: Apache-2.0
 */
import { renderHook, waitFor } from '@testing-library/react';
import type { UnifiedRuleSummary } from '../../../../../common/types/alerting';

const mockGetStatesAt = jest.fn();
jest.mock('../../query_services/alerting_opensearch_service', () => ({
  AlertingOpenSearchService: jest.fn().mockImplementation(() => ({
    getCloudWatchStatesAt: mockGetStatesAt,
  })),
}));
import { useCloudWatchStatesAt } from '../use_cloudwatch_states_at';

const cw = (id: string, state: 'ALARM' | 'OK'): UnifiedRuleSummary =>
  ({
    id,
    name: id,
    datasourceId: 'cloudwatch',
    datasourceType: 'cloudwatch',
    cloudWatch: { state, alarmType: 'metric' },
  }) as unknown as UnifiedRuleSummary;
const prom = {
  id: 'HighCPU',
  name: 'HighCPU',
  datasourceId: 'prom-1',
  datasourceType: 'prometheus',
} as unknown as UnifiedRuleSummary;

beforeEach(() => mockGetStatesAt.mockReset());

describe('useCloudWatchStatesAt', () => {
  it('reads nothing for a window ending now', () => {
    const { result } = renderHook(() =>
      useCloudWatchStatesAt({ rules: [cw('a', 'ALARM')], endMs: Date.now() })
    );
    expect(mockGetStatesAt).not.toHaveBeenCalled();
    expect(result.current.stateAt(cw('a', 'ALARM'))).toBeUndefined();
  });

  it('gives CloudWatch rows their state at a past window end', async () => {
    const endMs = Date.parse('2026-10-01T12:00:00.000Z');
    mockGetStatesAt.mockResolvedValue({ atMs: endMs, states: { a: 'OK' }, complete: true });
    const rules = [cw('a', 'ALARM'), cw('b', 'ALARM'), prom];
    const { result } = renderHook(() => useCloudWatchStatesAt({ rules, endMs }));
    await waitFor(() => expect(result.current.loading).toBe(false));
    // One read per CloudWatch datasource, none for Prometheus.
    expect(mockGetStatesAt).toHaveBeenCalledTimes(1);
    expect(mockGetStatesAt).toHaveBeenCalledWith(
      'cloudwatch',
      '2026-10-01T12:00:00.000Z',
      expect.anything()
    );
    await waitFor(() => expect(result.current.stateAt(rules[0])?.state).toBe('OK'));
    // Unchanged since the window end: still in its current state.
    expect(result.current.stateAt(rules[1])).toEqual({
      state: 'ALARM',
      atMs: endMs,
      complete: true,
    });
    expect(result.current.stateAt(prom)).toBeUndefined();
  });

  it('reports no state for a moment beyond the history', async () => {
    const endMs = Date.parse('2026-01-01T00:00:00.000Z');
    mockGetStatesAt.mockResolvedValue({
      atMs: endMs,
      states: {},
      complete: true,
      beyondRetention: true,
    });
    const rules = [cw('a', 'ALARM')];
    const { result } = renderHook(() => useCloudWatchStatesAt({ rules, endMs }));
    await waitFor(() =>
      expect(result.current.stateAt(rules[0])).toEqual({ atMs: endMs, complete: true })
    );
  });

  it('falls back to the current state when the read fails', async () => {
    const warn = jest.spyOn(console, 'warn').mockImplementation(() => {});
    mockGetStatesAt.mockRejectedValue(new Error('denied'));
    const rules = [cw('a', 'ALARM')];
    const { result } = renderHook(() =>
      useCloudWatchStatesAt({ rules, endMs: Date.parse('2026-10-01T12:00:00.000Z') })
    );
    await waitFor(() => expect(result.current.loading).toBe(false));
    expect(result.current.stateAt(rules[0])).toBeUndefined();
    warn.mockRestore();
  });
});

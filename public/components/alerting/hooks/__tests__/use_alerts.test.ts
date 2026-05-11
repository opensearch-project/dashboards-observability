/*
 * Copyright OpenSearch Contributors
 * SPDX-License-Identifier: Apache-2.0
 */

/**
 * use_alerts hook tests — focused on the time-range wiring.
 *
 * We mock the transport service module so each test can configure its
 * resolved value and assert the args that `listAlerts` received. This
 * mirrors the pattern used by `use_prometheus_metadata.test.ts`.
 */
import { renderHook, waitFor } from '@testing-library/react';

const mockListAlerts = jest.fn();

jest.mock('../../query_services/alerting_opensearch_service', () => ({
  AlertingOpenSearchService: jest.fn().mockImplementation(() => ({
    listAlerts: mockListAlerts,
  })),
}));

import { useAlerts } from '../use_alerts';

const emptyProgressive = {
  results: [],
  datasourceStatus: [],
  totalDatasources: 0,
  completedDatasources: 0,
  fetchedAt: '2026-01-01T00:00:00Z',
};

beforeEach(() => {
  mockListAlerts.mockReset();
  mockListAlerts.mockResolvedValue(emptyProgressive);
});

describe('useAlerts', () => {
  it('does not call listAlerts when dsIds is empty', async () => {
    renderHook(() => useAlerts({ dsIds: [] }));
    // Give the microtask queue a tick — nothing should have been called.
    await waitFor(() => {
      expect(mockListAlerts).not.toHaveBeenCalled();
    });
  });

  it('forwards dsIds alone when no range is set', async () => {
    renderHook(() => useAlerts({ dsIds: ['ds-1'] }));
    await waitFor(() => expect(mockListAlerts).toHaveBeenCalledTimes(1));
    expect(mockListAlerts).toHaveBeenCalledWith({
      dsIds: ['ds-1'],
      startTime: undefined,
      endTime: undefined,
    });
  });

  it('forwards startTime and endTime to the service', async () => {
    renderHook(() => useAlerts({ dsIds: ['ds-1'], startTime: 'now-1h', endTime: 'now' }));
    await waitFor(() => expect(mockListAlerts).toHaveBeenCalledTimes(1));
    expect(mockListAlerts).toHaveBeenCalledWith({
      dsIds: ['ds-1'],
      startTime: 'now-1h',
      endTime: 'now',
    });
  });

  it('refetches when startTime changes', async () => {
    const { rerender } = renderHook(
      ({ startTime }: { startTime: string }) =>
        useAlerts({ dsIds: ['ds-1'], startTime, endTime: 'now' }),
      { initialProps: { startTime: 'now-1h' } }
    );
    await waitFor(() => expect(mockListAlerts).toHaveBeenCalledTimes(1));

    rerender({ startTime: 'now-24h' });
    await waitFor(() => expect(mockListAlerts).toHaveBeenCalledTimes(2));
    expect(mockListAlerts).toHaveBeenLastCalledWith({
      dsIds: ['ds-1'],
      startTime: 'now-24h',
      endTime: 'now',
    });
  });

  it('refetches when endTime changes', async () => {
    const { rerender } = renderHook(
      ({ endTime }: { endTime: string }) =>
        useAlerts({ dsIds: ['ds-1'], startTime: 'now-1h', endTime }),
      { initialProps: { endTime: 'now' } }
    );
    await waitFor(() => expect(mockListAlerts).toHaveBeenCalledTimes(1));

    rerender({ endTime: 'now-5m' });
    await waitFor(() => expect(mockListAlerts).toHaveBeenCalledTimes(2));
  });

  it('refetches when refreshToken changes', async () => {
    const { rerender } = renderHook(
      ({ refreshToken }: { refreshToken: number }) =>
        useAlerts({ dsIds: ['ds-1'], startTime: 'now-1h', endTime: 'now', refreshToken }),
      { initialProps: { refreshToken: 0 } }
    );
    await waitFor(() => expect(mockListAlerts).toHaveBeenCalledTimes(1));

    rerender({ refreshToken: 1 });
    await waitFor(() => expect(mockListAlerts).toHaveBeenCalledTimes(2));
  });

  it('does not refetch when dsIds array reference changes but content is the same', async () => {
    const { rerender } = renderHook(
      ({ dsIds }: { dsIds: string[] }) => useAlerts({ dsIds, startTime: 'now-1h', endTime: 'now' }),
      { initialProps: { dsIds: ['ds-1', 'ds-2'] } }
    );
    await waitFor(() => expect(mockListAlerts).toHaveBeenCalledTimes(1));

    // Fresh array reference, identical contents — should NOT refetch.
    rerender({ dsIds: ['ds-1', 'ds-2'] });
    // Give any potential re-run a chance to complete before asserting.
    await new Promise((r) => setTimeout(r, 0));
    expect(mockListAlerts).toHaveBeenCalledTimes(1);
  });

  it('does not refetch on stable re-renders (same props)', async () => {
    const { rerender } = renderHook(() =>
      useAlerts({ dsIds: ['ds-1'], startTime: 'now-1h', endTime: 'now' })
    );
    await waitFor(() => expect(mockListAlerts).toHaveBeenCalledTimes(1));

    rerender();
    rerender();
    await new Promise((r) => setTimeout(r, 0));
    expect(mockListAlerts).toHaveBeenCalledTimes(1);
  });

  it('populates data on success', async () => {
    const response = {
      ...emptyProgressive,
      results: [
        {
          id: 'a-1',
          datasourceId: 'ds-1',
          datasourceType: 'opensearch' as const,
          name: 'HighCPU',
          state: 'active' as const,
          severity: 'critical' as const,
          startTime: '2026-01-01T00:00:00Z',
          lastUpdated: '2026-01-01T00:00:00Z',
          labels: {},
          annotations: {},
        },
      ],
    };
    mockListAlerts.mockResolvedValueOnce(response);

    const { result } = renderHook(() => useAlerts({ dsIds: ['ds-1'] }));
    await waitFor(() => expect(result.current.data).toEqual(response));
    expect(result.current.error).toBeNull();
    expect(result.current.isLoading).toBe(false);
  });

  it('surfaces errors from the service', async () => {
    mockListAlerts.mockRejectedValueOnce(new Error('boom'));
    const { result } = renderHook(() => useAlerts({ dsIds: ['ds-1'] }));
    await waitFor(() => expect(result.current.error).toBeInstanceOf(Error));
    expect(result.current.error?.message).toBe('boom');
  });
});

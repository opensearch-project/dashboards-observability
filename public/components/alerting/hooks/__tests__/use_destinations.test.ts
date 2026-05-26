/*
 * Copyright OpenSearch Contributors
 * SPDX-License-Identifier: Apache-2.0
 */

/**
 * use_destinations hook tests — happy path, error path, cancellation,
 * truncated propagation (regression coverage for L4).
 */
import { renderHook, waitFor, act } from '@testing-library/react';

const mockListDestinations = jest.fn();

jest.mock('../../query_services/alerting_opensearch_service', () => ({
  AlertingOpenSearchService: jest.fn().mockImplementation(() => ({
    listDestinations: mockListDestinations,
  })),
}));

import { useDestinations } from '../use_destinations';

const emptyResult = { destinations: [], totalDestinations: 0, truncated: false };

beforeEach(() => {
  mockListDestinations.mockReset();
  mockListDestinations.mockResolvedValue(emptyResult);
});

describe('useDestinations', () => {
  it('does not call the service when dsId is empty', async () => {
    const { result } = renderHook(() => useDestinations({ dsId: '' }));
    await Promise.resolve();
    expect(mockListDestinations).not.toHaveBeenCalled();
    expect(result.current.destinations).toEqual([]);
    expect(result.current.totalDestinations).toBe(0);
    expect(result.current.truncated).toBe(false);
  });

  it('returns destinations + total + truncated from the service', async () => {
    mockListDestinations.mockResolvedValueOnce({
      destinations: [
        { id: 'd-1', name: 'ops', type: 'slack' },
        { id: 'd-2', name: 'pager', type: 'pagerduty' },
      ],
      totalDestinations: 2,
      truncated: false,
    });
    const { result } = renderHook(() => useDestinations({ dsId: 'ds-1' }));
    await waitFor(() => expect(result.current.destinations).toHaveLength(2));
    expect(result.current.totalDestinations).toBe(2);
    expect(result.current.truncated).toBe(false);
    expect(result.current.error).toBeNull();
    expect(mockListDestinations).toHaveBeenCalledWith('ds-1');
  });

  it('propagates truncated=true and the cluster-side total', async () => {
    mockListDestinations.mockResolvedValueOnce({
      destinations: Array.from({ length: 200 }, (_, i) => ({
        id: `d-${i}`,
        name: `n-${i}`,
        type: 'slack',
      })),
      totalDestinations: 350,
      truncated: true,
    });
    const { result } = renderHook(() => useDestinations({ dsId: 'ds-1' }));
    await waitFor(() => expect(result.current.truncated).toBe(true));
    expect(result.current.destinations).toHaveLength(200);
    expect(result.current.totalDestinations).toBe(350);
  });

  it('captures errors thrown by the service', async () => {
    mockListDestinations.mockRejectedValueOnce(new Error('forbidden'));
    const { result } = renderHook(() => useDestinations({ dsId: 'ds-1' }));
    await waitFor(() => expect(result.current.error?.message).toBe('forbidden'));
    expect(result.current.isLoading).toBe(false);
    expect(result.current.destinations).toEqual([]);
  });

  it('refetches when refreshToken changes', async () => {
    const { rerender } = renderHook(
      ({ token }: { token: number }) => useDestinations({ dsId: 'ds-1', refreshToken: token }),
      { initialProps: { token: 0 } }
    );
    await waitFor(() => expect(mockListDestinations).toHaveBeenCalledTimes(1));
    rerender({ token: 1 });
    await waitFor(() => expect(mockListDestinations).toHaveBeenCalledTimes(2));
  });

  it('refetches when refetch() is called', async () => {
    const { result } = renderHook(() => useDestinations({ dsId: 'ds-1' }));
    await waitFor(() => expect(mockListDestinations).toHaveBeenCalledTimes(1));
    act(() => result.current.refetch());
    await waitFor(() => expect(mockListDestinations).toHaveBeenCalledTimes(2));
  });

  it('does not write the resolved value into state after unmount', async () => {
    let resolveCall: (v: unknown) => void = () => undefined;
    mockListDestinations.mockImplementationOnce(() => new Promise((r) => (resolveCall = r)));
    const { result, unmount } = renderHook(() => useDestinations({ dsId: 'ds-1' }));
    unmount();
    resolveCall({
      destinations: [{ id: 'd-1', name: 'ops', type: 'slack' }],
      totalDestinations: 1,
      truncated: false,
    });
    await Promise.resolve();
    // Late resolution after unmount must not flip state.
    expect(result.current.destinations).toEqual([]);
  });
});

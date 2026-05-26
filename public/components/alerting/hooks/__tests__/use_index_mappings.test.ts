/*
 * Copyright OpenSearch Contributors
 * SPDX-License-Identifier: Apache-2.0
 */

/**
 * use_index_mappings hook tests — covers cache-hit short-circuit (the
 * regression coverage ps48 H8 asked for: indices array ref-churn must NOT
 * trigger a refetch when the sorted cacheKey is unchanged), error capture,
 * and the empty-indices reset.
 */
import { renderHook, waitFor } from '@testing-library/react';

const mockGetFieldsByType = jest.fn();

jest.mock('../../query_services/alerting_opensearch_service', () => ({
  AlertingOpenSearchService: jest.fn().mockImplementation(() => ({
    getFieldsByType: mockGetFieldsByType,
  })),
}));

import { useIndexMappings } from '../use_index_mappings';

beforeEach(() => {
  mockGetFieldsByType.mockReset();
  mockGetFieldsByType.mockResolvedValue({});
});

describe('useIndexMappings', () => {
  it('does not call the service when dsId is empty', async () => {
    renderHook(() => useIndexMappings({ dsId: '', indices: ['logs'] }));
    // Microtask flush — nothing should have fired.
    await Promise.resolve();
    expect(mockGetFieldsByType).not.toHaveBeenCalled();
  });

  it('does not call the service when indices is empty and resets state', async () => {
    mockGetFieldsByType.mockResolvedValueOnce({ keyword: ['service'] });
    const { result, rerender } = renderHook(
      ({ indices }: { indices: string[] }) => useIndexMappings({ dsId: 'ds-1', indices }),
      { initialProps: { indices: ['logs'] } }
    );
    await waitFor(() => expect(result.current.fieldsByType).toEqual({ keyword: ['service'] }));

    rerender({ indices: [] });
    await waitFor(() => expect(result.current.fieldsByType).toEqual({}));
    // Only the initial fetch — empty indices should not trigger a network call.
    expect(mockGetFieldsByType).toHaveBeenCalledTimes(1);
  });

  it('fetches fields-by-type for the picked indices', async () => {
    mockGetFieldsByType.mockResolvedValueOnce({
      keyword: ['service.name'],
      date: ['@timestamp'],
    });
    const { result } = renderHook(() =>
      useIndexMappings({ dsId: 'ds-1', indices: ['logs-2026', 'metrics'] })
    );
    await waitFor(() =>
      expect(result.current.fieldsByType).toEqual({
        keyword: ['service.name'],
        date: ['@timestamp'],
      })
    );
    expect(mockGetFieldsByType).toHaveBeenCalledWith('ds-1', ['logs-2026', 'metrics']);
    expect(result.current.error).toBeNull();
  });

  it('does NOT refetch when only the indices array reference changes (cacheKey identical)', async () => {
    mockGetFieldsByType.mockResolvedValue({ keyword: ['service'] });
    const { rerender, result } = renderHook(
      ({ indices }: { indices: string[] }) => useIndexMappings({ dsId: 'ds-1', indices }),
      { initialProps: { indices: ['logs', 'metrics'] } }
    );
    await waitFor(() => expect(result.current.fieldsByType).toEqual({ keyword: ['service'] }));
    expect(mockGetFieldsByType).toHaveBeenCalledTimes(1);

    // New array reference, same contents — should be a cache hit.
    rerender({ indices: ['logs', 'metrics'] });
    await Promise.resolve();
    expect(mockGetFieldsByType).toHaveBeenCalledTimes(1);

    // Same indices in a different order — still cache hit (sorted-stable key).
    rerender({ indices: ['metrics', 'logs'] });
    await Promise.resolve();
    expect(mockGetFieldsByType).toHaveBeenCalledTimes(1);
  });

  it('refetches when the indices set actually changes', async () => {
    mockGetFieldsByType
      .mockResolvedValueOnce({ keyword: ['a'] })
      .mockResolvedValueOnce({ keyword: ['a', 'b'] });
    const { rerender, result } = renderHook(
      ({ indices }: { indices: string[] }) => useIndexMappings({ dsId: 'ds-1', indices }),
      { initialProps: { indices: ['logs'] } }
    );
    await waitFor(() => expect(result.current.fieldsByType).toEqual({ keyword: ['a'] }));
    rerender({ indices: ['logs', 'metrics'] });
    await waitFor(() => expect(result.current.fieldsByType).toEqual({ keyword: ['a', 'b'] }));
    expect(mockGetFieldsByType).toHaveBeenCalledTimes(2);
  });

  it('captures errors thrown by the service', async () => {
    mockGetFieldsByType.mockRejectedValueOnce(new Error('mapping failed'));
    const { result } = renderHook(() => useIndexMappings({ dsId: 'ds-1', indices: ['logs'] }));
    await waitFor(() => expect(result.current.error?.message).toBe('mapping failed'));
    expect(result.current.isLoading).toBe(false);
  });

  it('does not write resolved data into state after unmount', async () => {
    let resolveFetch: (v: unknown) => void = () => undefined;
    mockGetFieldsByType.mockImplementationOnce(() => new Promise((r) => (resolveFetch = r)));
    const { result, unmount } = renderHook(() =>
      useIndexMappings({ dsId: 'ds-1', indices: ['logs'] })
    );
    unmount();
    resolveFetch({ keyword: ['service'] });
    await Promise.resolve();
    // Result should remain initial — the late resolution must not flip state.
    expect(result.current.fieldsByType).toEqual({});
  });
});

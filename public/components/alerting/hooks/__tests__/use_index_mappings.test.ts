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

  describe('isStale', () => {
    it('is true until the current selection has loaded, then false', async () => {
      let resolve: (v: Record<string, string[]>) => void = () => {};
      mockGetFieldsByType.mockImplementationOnce(
        () => new Promise((r) => (resolve = r as typeof resolve))
      );
      const { result } = renderHook(() => useIndexMappings({ dsId: 'ds-1', indices: ['logs'] }));
      expect(result.current.isStale).toBe(true);
      resolve({ date: ['@timestamp'] });
      await waitFor(() => expect(result.current.isStale).toBe(false));
      expect(result.current.fieldsByType).toEqual({ date: ['@timestamp'] });
    });

    it('is true while a changed selection is still loading (old fields are stale)', async () => {
      mockGetFieldsByType.mockResolvedValueOnce({ date: ['a_time'] });
      const { result, rerender } = renderHook(
        ({ indices }: { indices: string[] }) => useIndexMappings({ dsId: 'ds-1', indices }),
        { initialProps: { indices: ['a'] } }
      );
      await waitFor(() => expect(result.current.isStale).toBe(false));
      let resolve: (v: Record<string, string[]>) => void = () => {};
      mockGetFieldsByType.mockImplementationOnce(
        () => new Promise((r) => (resolve = r as typeof resolve))
      );
      rerender({ indices: ['b'] });
      expect(result.current.isStale).toBe(true);
      expect(result.current.fieldsByType).toEqual({ date: ['a_time'] });
      resolve({ date: ['b_time'] });
      await waitFor(() => expect(result.current.isStale).toBe(false));
      expect(result.current.fieldsByType).toEqual({ date: ['b_time'] });
    });

    it('settles (not stale) after an error, with empty fields', async () => {
      mockGetFieldsByType.mockRejectedValueOnce(new Error('boom'));
      const { result } = renderHook(() => useIndexMappings({ dsId: 'ds-1', indices: ['logs'] }));
      await waitFor(() => expect(result.current.error?.message).toBe('boom'));
      expect(result.current.isStale).toBe(false);
      expect(result.current.fieldsByType).toEqual({});
    });

    it('settles when the selection is cleared', async () => {
      const { result } = renderHook(() => useIndexMappings({ dsId: 'ds-1', indices: [] }));
      await waitFor(() => expect(result.current.isStale).toBe(false));
    });
  });

  it('refetches when the same indices are re-selected after being cleared', async () => {
    mockGetFieldsByType.mockResolvedValue({ date: ['@timestamp'] });
    const { result, rerender } = renderHook(
      ({ indices }: { indices: string[] }) => useIndexMappings({ dsId: 'ds-1', indices }),
      { initialProps: { indices: ['logs'] } }
    );
    await waitFor(() => expect(result.current.fieldsByType).toEqual({ date: ['@timestamp'] }));
    rerender({ indices: [] });
    await waitFor(() => expect(result.current.fieldsByType).toEqual({}));
    rerender({ indices: ['logs'] });
    await waitFor(() => expect(result.current.fieldsByType).toEqual({ date: ['@timestamp'] }));
    expect(result.current.isStale).toBe(false);
    expect(mockGetFieldsByType).toHaveBeenCalledTimes(2);
  });

  it('wraps non-Error rejections into an Error', async () => {
    mockGetFieldsByType.mockRejectedValueOnce('plain string failure');
    const { result } = renderHook(() => useIndexMappings({ dsId: 'ds-1', indices: ['logs'] }));
    await waitFor(() => expect(result.current.error).toBeInstanceOf(Error));
    expect(result.current.error?.message).toBe('plain string failure');
  });

  it('does not write an error into state after unmount', async () => {
    let reject: (e: unknown) => void = () => {};
    mockGetFieldsByType.mockImplementationOnce(() => new Promise((_, r) => (reject = r)));
    const { result, unmount } = renderHook(() =>
      useIndexMappings({ dsId: 'ds-1', indices: ['logs'] })
    );
    unmount();
    reject(new Error('late'));
    await Promise.resolve();
    expect(result.current.error).toBeNull();
  });
});

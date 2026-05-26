/*
 * Copyright OpenSearch Contributors
 * SPDX-License-Identifier: Apache-2.0
 */

/**
 * use_indices hook tests — focused on the debounce + cancellation wiring
 * and the `*` padding rule, plus the indices/aliases merge.
 */
import { act, renderHook, waitFor } from '@testing-library/react';

const mockListIndices = jest.fn();
const mockListAliases = jest.fn();

jest.mock('../../query_services/alerting_opensearch_service', () => ({
  AlertingOpenSearchService: jest.fn().mockImplementation(() => ({
    listIndices: mockListIndices,
    listAliases: mockListAliases,
  })),
}));

import { useIndices } from '../use_indices';

beforeEach(() => {
  jest.useFakeTimers();
  mockListIndices.mockReset();
  mockListAliases.mockReset();
  mockListIndices.mockResolvedValue([]);
  mockListAliases.mockResolvedValue([]);
});

afterEach(() => {
  jest.useRealTimers();
});

describe('useIndices', () => {
  it('does not call the service when dsId is empty', () => {
    renderHook(() => useIndices({ dsId: '', search: 'logs' }));
    act(() => {
      jest.advanceTimersByTime(500);
    });
    expect(mockListIndices).not.toHaveBeenCalled();
    expect(mockListAliases).not.toHaveBeenCalled();
  });

  it('debounces the network call and pads bare prefixes with `*`', async () => {
    renderHook(() => useIndices({ dsId: 'ds-1', search: 'logs', debounceMs: 250 }));

    // Within the debounce window, no call should have fired yet.
    act(() => {
      jest.advanceTimersByTime(100);
    });
    expect(mockListIndices).not.toHaveBeenCalled();

    // After the full debounce window, the call fires with `logs*` (padded).
    act(() => {
      jest.advanceTimersByTime(150);
    });
    await waitFor(() => expect(mockListIndices).toHaveBeenCalledTimes(1));
    expect(mockListIndices).toHaveBeenCalledWith('ds-1', 'logs*');
    expect(mockListAliases).toHaveBeenCalledWith('ds-1', 'logs*');
  });

  it('passes the search through unchanged when it already contains a wildcard', async () => {
    renderHook(() => useIndices({ dsId: 'ds-1', search: 'logs-*' }));
    act(() => {
      jest.advanceTimersByTime(250);
    });
    await waitFor(() => expect(mockListIndices).toHaveBeenCalledTimes(1));
    expect(mockListIndices).toHaveBeenCalledWith('ds-1', 'logs-*');
  });

  it('uses `*` when the search string is empty', async () => {
    renderHook(() => useIndices({ dsId: 'ds-1', search: '' }));
    act(() => {
      jest.advanceTimersByTime(250);
    });
    await waitFor(() => expect(mockListIndices).toHaveBeenCalledTimes(1));
    expect(mockListIndices).toHaveBeenCalledWith('ds-1', '*');
  });

  it('cancels the pending debounce when the search changes mid-window', async () => {
    const { rerender } = renderHook(
      ({ search }: { search: string }) => useIndices({ dsId: 'ds-1', search, debounceMs: 250 }),
      { initialProps: { search: 'log' } }
    );
    // Halfway through the first window, the user types again.
    act(() => {
      jest.advanceTimersByTime(100);
    });
    rerender({ search: 'logs' });

    // Run the rest of the original window — the first call must NOT fire.
    act(() => {
      jest.advanceTimersByTime(150);
    });
    expect(mockListIndices).not.toHaveBeenCalled();

    // Run the second window — only the latest search should reach the service.
    act(() => {
      jest.advanceTimersByTime(250);
    });
    await waitFor(() => expect(mockListIndices).toHaveBeenCalledTimes(1));
    expect(mockListIndices).toHaveBeenCalledWith('ds-1', 'logs*');
  });

  it('cancels the in-flight request when unmounted', async () => {
    let resolveIndices: (v: unknown) => void = () => undefined;
    mockListIndices.mockImplementationOnce(() => new Promise((r) => (resolveIndices = r)));
    mockListAliases.mockResolvedValueOnce([]);

    const { result, unmount } = renderHook(() => useIndices({ dsId: 'ds-1', search: 'log' }));
    act(() => {
      jest.advanceTimersByTime(250);
    });
    // The request is in-flight; we unmount before it resolves.
    unmount();
    await act(async () => {
      resolveIndices([{ index: 'logs-1' }]);
    });
    // Result should remain at its initial empty state — the resolution
    // landed after `cancelled` was set, so setOptions must not have run.
    expect(result.current.options).toEqual([]);
  });

  it('captures errors from the indices/aliases call', async () => {
    mockListIndices.mockRejectedValueOnce(new Error('boom'));
    const { result } = renderHook(() => useIndices({ dsId: 'ds-1', search: 'log' }));
    act(() => {
      jest.advanceTimersByTime(250);
    });
    await waitFor(() => expect(result.current.error?.message).toBe('boom'));
    expect(result.current.isLoading).toBe(false);
  });

  it('merges indices and aliases, de-duping and sorting alphabetically', async () => {
    mockListIndices.mockResolvedValueOnce([
      { index: 'logs-2026' },
      { index: 'metrics' },
      { index: 'logs-2026' }, // dup — must be folded
    ]);
    mockListAliases.mockResolvedValueOnce([
      { alias: 'metrics', index: 'metrics' }, // alias collision with an index
      { alias: 'all-logs', index: 'logs-2026' },
    ]);

    const { result } = renderHook(() => useIndices({ dsId: 'ds-1', search: 'log' }));
    act(() => {
      jest.advanceTimersByTime(250);
    });
    await waitFor(() => expect(result.current.options.length).toBeGreaterThan(0));

    // Expect: indices first into the seen-set, alias entries dedup against them,
    // final list is sorted alphabetically.
    expect(result.current.options).toEqual([
      { label: 'all-logs', aliasFor: 'logs-2026' },
      { label: 'logs-2026' },
      { label: 'metrics' },
    ]);
  });
});

/*
 * Copyright OpenSearch Contributors
 * SPDX-License-Identifier: Apache-2.0
 */

import { renderHook, act } from '@testing-library/react-hooks';
import { usePolling } from '../use_polling';

// Mocking the core.http.fetch
const mockedFetch = jest.fn();

describe('usePolling', () => {
  afterEach(() => {
    jest.clearAllMocks();
    jest.useRealTimers();
  });

  it('fetches and updates data', async () => {
    const mockData = { id: '123', name: 'test' };
    mockedFetch.mockResolvedValueOnce(mockData);

    const { result, waitForNextUpdate } = renderHook(() =>
      usePolling({
        fetchFunction: () => mockedFetch('/api/test'),
      })
    );

    expect(result.current.data).toBeNull();

    await waitForNextUpdate();

    expect(result.current.data).toEqual(mockData);
  });

  it('uses caching strategy', async () => {
    const mockData = { id: '123', name: 'test' };
    mockedFetch.mockResolvedValueOnce(mockData);

    const cachingStrategy = (item: any, cache: any) => {
      cache[item.id] = item;
    };

    const { result, waitForNextUpdate } = renderHook(() =>
      usePolling({
        fetchFunction: () => mockedFetch('/api/test'),
        cachingStrategy,
      })
    );

    await waitForNextUpdate();

    expect(result.current.cache['123']).toEqual(mockData);
  });

  it('handles errors', async () => {
    const mockError = new Error('Failed to fetch');
    mockedFetch.mockRejectedValueOnce(mockError);

    const { result, waitForNextUpdate } = renderHook(() =>
      usePolling({
        fetchFunction: () => mockedFetch('/api/test'),
      })
    );

    await waitForNextUpdate();

    expect(result.current.error).toEqual(mockError);
  });

  it('ensures fetchFunction rejection triggers error', async () => {
    const mockError = new Error('Failed to fetch');
    mockedFetch.mockRejectedValue(mockError);

    const { result, waitFor } = renderHook(() =>
      usePolling({
        fetchFunction: () => mockedFetch('/api/test'),
      })
    );

    // Wait for the error state to be updated after the mock rejection
    await waitFor(() => result.current.error === mockError);

    expect(result.current.error).toEqual(mockError);
  });

  it('uses exponential backoff on error', async () => {
    jest.useFakeTimers();

    const mockError = new Error('Failed to fetch');
    mockedFetch.mockRejectedValue(mockError);

    const { result, waitForNextUpdate } = renderHook(() =>
      usePolling({
        fetchFunction: () => mockedFetch('/api/test'),
        enableExponentialBackoff: true,
        initialInterval: 1000,
      })
    );

    // Initial state: interval should be 1000ms
    expect(result.current.interval).toBe(1000);

    // After first error, interval should be doubled
    act(() => {
      jest.advanceTimersByTime(1000);
    });
    await waitForNextUpdate();
    expect(result.current.error).toEqual(mockError);
    expect(result.current.interval).toBe(2000);
  });
});

/*
 * Copyright OpenSearch Contributors
 * SPDX-License-Identifier: Apache-2.0
 */

import { renderHook, act } from '@testing-library/react';
import { usePersistentTimeRange } from '../use_persistent_time_range';
import { APM_TIME_RANGE_STORAGE_KEY, DEFAULT_APM_TIME_RANGE } from '../../../common/constants';

describe('usePersistentTimeRange', () => {
  beforeEach(() => {
    sessionStorage.clear();
    jest.restoreAllMocks();
  });

  it('returns the default time range when nothing is stored', () => {
    const { result } = renderHook(() => usePersistentTimeRange());
    expect(result.current[0]).toEqual(DEFAULT_APM_TIME_RANGE);
  });

  it('returns a custom default when provided and nothing is stored', () => {
    const custom = { from: 'now-1h', to: 'now' };
    const { result } = renderHook(() => usePersistentTimeRange(custom));
    expect(result.current[0]).toEqual(custom);
  });

  it('hydrates the initial value from sessionStorage', () => {
    const stored = { from: 'now-24h', to: 'now' };
    sessionStorage.setItem(APM_TIME_RANGE_STORAGE_KEY, JSON.stringify(stored));

    const { result } = renderHook(() => usePersistentTimeRange());
    expect(result.current[0]).toEqual(stored);
  });

  it('persists updates to sessionStorage', () => {
    const { result } = renderHook(() => usePersistentTimeRange());

    act(() => {
      result.current[1]({ from: 'now-7d', to: 'now' });
    });

    expect(result.current[0]).toEqual({ from: 'now-7d', to: 'now' });
    expect(JSON.parse(sessionStorage.getItem(APM_TIME_RANGE_STORAGE_KEY)!)).toEqual({
      from: 'now-7d',
      to: 'now',
    });
  });

  it('syncs the value across two hook instances in the same tab', () => {
    const first = renderHook(() => usePersistentTimeRange());
    const second = renderHook(() => usePersistentTimeRange());

    act(() => {
      first.result.current[1]({ from: 'now-30m', to: 'now' });
    });

    // The second instance should observe the change via the custom event.
    expect(second.result.current[0]).toEqual({ from: 'now-30m', to: 'now' });
  });

  it('falls back to the default when stored JSON is malformed', () => {
    sessionStorage.setItem(APM_TIME_RANGE_STORAGE_KEY, '{not valid json');

    const { result } = renderHook(() => usePersistentTimeRange());
    expect(result.current[0]).toEqual(DEFAULT_APM_TIME_RANGE);
  });

  it('falls back to the default when stored value has the wrong shape', () => {
    sessionStorage.setItem(APM_TIME_RANGE_STORAGE_KEY, JSON.stringify({ from: 123, to: null }));

    const { result } = renderHook(() => usePersistentTimeRange());
    expect(result.current[0]).toEqual(DEFAULT_APM_TIME_RANGE);
  });

  it('falls back to the default when stored value is missing fields', () => {
    sessionStorage.setItem(APM_TIME_RANGE_STORAGE_KEY, JSON.stringify({ from: 'now-1h' }));

    const { result } = renderHook(() => usePersistentTimeRange());
    expect(result.current[0]).toEqual(DEFAULT_APM_TIME_RANGE);
  });

  it('still updates in-memory state when sessionStorage writes throw', () => {
    const setItemSpy = jest.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
      throw new Error('QuotaExceededError');
    });

    const { result } = renderHook(() => usePersistentTimeRange());

    act(() => {
      result.current[1]({ from: 'now-90m', to: 'now' });
    });

    expect(result.current[0]).toEqual({ from: 'now-90m', to: 'now' });
    setItemSpy.mockRestore();
  });

  it('falls back to the default when sessionStorage reads throw', () => {
    jest.spyOn(Storage.prototype, 'getItem').mockImplementation(() => {
      throw new Error('access denied');
    });

    const { result } = renderHook(() => usePersistentTimeRange());
    expect(result.current[0]).toEqual(DEFAULT_APM_TIME_RANGE);
  });

  it('unsubscribes from the sync event on unmount', () => {
    const removeSpy = jest.spyOn(window, 'removeEventListener');
    const { unmount } = renderHook(() => usePersistentTimeRange());

    unmount();

    expect(removeSpy).toHaveBeenCalledWith('apm.timeRangeChange', expect.any(Function));
    removeSpy.mockRestore();
  });
});

/*
 * Copyright OpenSearch Contributors
 * SPDX-License-Identifier: Apache-2.0
 */

import { useCallback, useEffect, useState } from 'react';
import { TimeRange } from '../../common/types/service_types';
import { APM_TIME_RANGE_STORAGE_KEY, DEFAULT_APM_TIME_RANGE } from '../../common/constants';

/**
 * Custom event dispatched when the persisted time range changes within the tab.
 * sessionStorage is per-tab and does not emit `storage` events to the tab that
 * wrote it, so we emit this to keep every APM picker mounted in the current tab
 * in sync (e.g. a header picker and an in-page picker on the same route).
 */
const APM_TIME_RANGE_EVENT = 'apm.timeRangeChange';

/**
 * Narrow an unknown value to a valid TimeRange. Guards against corrupt or
 * legacy sessionStorage payloads so a bad value can never crash the picker.
 */
const isValidTimeRange = (value: unknown): value is TimeRange =>
  typeof value === 'object' &&
  value !== null &&
  typeof (value as TimeRange).from === 'string' &&
  typeof (value as TimeRange).to === 'string' &&
  (value as TimeRange).from.length > 0 &&
  (value as TimeRange).to.length > 0;

/**
 * Read the persisted time range from sessionStorage, falling back to `fallback`
 * when nothing is stored or the stored value is invalid/unreadable.
 */
const readStoredTimeRange = (fallback: TimeRange): TimeRange => {
  try {
    const raw = sessionStorage.getItem(APM_TIME_RANGE_STORAGE_KEY);
    if (!raw) {
      return fallback;
    }
    const parsed = JSON.parse(raw);
    return isValidTimeRange(parsed) ? parsed : fallback;
  } catch {
    // Malformed JSON or sessionStorage access denied (e.g. privacy mode)
    return fallback;
  }
};

/**
 * Hook for a time range that persists to sessionStorage and is shared across all
 * APM pages. Instead of every page resetting to the default range on mount,
 * they all read and write a single shared key, so the user's selected range
 * survives reloads/navigation and follows them between pages within the tab.
 *
 * Uses sessionStorage to match the Trace Analytics convention
 * (trace_analytics/home.tsx). Changes are synced live to every consumer mounted
 * in the current tab via a custom event.
 *
 * @param defaultTimeRange - Range to use when nothing has been persisted yet.
 * @returns A `[timeRange, setTimeRange]` tuple mirroring `useState`.
 */
export const usePersistentTimeRange = (
  defaultTimeRange: TimeRange = DEFAULT_APM_TIME_RANGE
): [TimeRange, (timeRange: TimeRange) => void] => {
  const [timeRange, setTimeRangeState] = useState<TimeRange>(() =>
    readStoredTimeRange(defaultTimeRange)
  );

  const setTimeRange = useCallback((newTimeRange: TimeRange) => {
    setTimeRangeState(newTimeRange);
    try {
      sessionStorage.setItem(APM_TIME_RANGE_STORAGE_KEY, JSON.stringify(newTimeRange));
    } catch {
      // Ignore write failures (private mode / quota) — in-memory state still updates
    }
    // Notify other hook instances mounted in this same tab.
    try {
      window.dispatchEvent(
        new CustomEvent<TimeRange>(APM_TIME_RANGE_EVENT, { detail: newTimeRange })
      );
    } catch {
      // CustomEvent unsupported — cross-page sync degrades gracefully
    }
  }, []);

  // Subscribe to changes from other APM pages mounted in this tab.
  useEffect(() => {
    const handleCustomEvent = (event: Event) => {
      const detail = (event as CustomEvent<TimeRange>).detail;
      if (isValidTimeRange(detail)) {
        setTimeRangeState(detail);
      }
    };

    window.addEventListener(APM_TIME_RANGE_EVENT, handleCustomEvent);
    return () => {
      window.removeEventListener(APM_TIME_RANGE_EVENT, handleCustomEvent);
    };
  }, []);

  return [timeRange, setTimeRange];
};

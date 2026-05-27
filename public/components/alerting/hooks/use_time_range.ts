/*
 * Copyright OpenSearch Contributors
 * SPDX-License-Identifier: Apache-2.0
 */

/**
 * Encapsulates the Alerts page time-range state, persistence, and self-
 * healing behaviour. Pulled out of `alarms_page.tsx` so the page component
 * can stay focused on tab orchestration; the persistence + parse-failure
 * recovery logic is the load-bearing detail and lives here.
 */
import { useCallback, useEffect, useMemo, useState } from 'react';
import { parseDateMathMs } from '../../../../common/services/alerting/time_range';
import {
  DEFAULT_END_TIME,
  DEFAULT_START_TIME,
  loadPersistedEndTime,
  loadPersistedStartTime,
  persistTimeRange,
} from '../alarms_page_helpers';

export interface UseTimeRangeResult {
  /** Date-math expression for the picker (e.g. `now-24h`). */
  startTime: string;
  /** Date-math expression for the picker (e.g. `now`). */
  endTime: string;
  /** Resolved epoch-ms; falls back to defaults if either side is malformed. */
  startMs: number;
  endMs: number;
  /** Bumped by the refresh button so consumers can re-trigger their effects. */
  refreshToken: number;
  /**
   * Stable callback for OSD's `EuiSuperDatePicker.onTimeChange`. Persists
   * eagerly. Uses functional setState so identity stays stable across renders.
   */
  onTimeChange: (range: { start: string; end: string }) => void;
  /** Stable callback for OSD's `EuiSuperDatePicker.onRefresh`. */
  onRefresh: (range: { start: string; end: string }) => void;
  /** Imperatively bump the refresh token (e.g. after acknowledge). */
  bumpRefreshToken: () => void;
}

export function useTimeRange(): UseTimeRangeResult {
  const [startTime, setStartTime] = useState<string>(loadPersistedStartTime);
  const [endTime, setEndTime] = useState<string>(loadPersistedEndTime);
  const [refreshToken, setRefreshToken] = useState(0);

  // Resolve once per render, guarded.
  //
  // `parseDateMathMs` throws on malformed input. If the
  // sessionStorage-hydrated range is corrupted (browser extension,
  // manual DevTools edit), resolving at module top-level would crash the
  // page on mount. `useMemo` lets us swallow the error and fall back to
  // the known-good defaults; the heal-effect below then resets state +
  // sessionStorage so the next render sees a clean range.
  //
  // `refreshToken` is in deps so that clicking Refresh while the range
  // is relative-to-`now` (e.g. `now-24h` → `now`) re-resolves `now` to
  // the current wall clock.
  const [startMs, endMs, rangeParseFailed] = useMemo(() => {
    try {
      return [parseDateMathMs(startTime, false), parseDateMathMs(endTime, true), false];
    } catch {
      return [
        parseDateMathMs(DEFAULT_START_TIME, false),
        parseDateMathMs(DEFAULT_END_TIME, true),
        true,
      ];
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [startTime, endTime, refreshToken]);

  useEffect(() => {
    if (!rangeParseFailed) return;
    setStartTime(DEFAULT_START_TIME);
    setEndTime(DEFAULT_END_TIME);
    persistTimeRange(DEFAULT_START_TIME, DEFAULT_END_TIME);
  }, [rangeParseFailed]);

  // Always persist on the picker callbacks. sessionStorage writes are cheap
  // and idempotent, so unconditionally calling `persistTimeRange` is simpler
  // and safer than tracking a `didChange` flag inside the functional setState
  // updaters (which would rely on React 18's synchronous batching of those
  // updaters within the callback — fragile across React major versions).
  const onTimeChange = useCallback(({ start, end }: { start: string; end: string }) => {
    setStartTime(start);
    setEndTime(end);
    persistTimeRange(start, end);
  }, []);

  const onRefresh = useCallback(({ start, end }: { start: string; end: string }) => {
    setStartTime(start);
    setEndTime(end);
    persistTimeRange(start, end);
    setRefreshToken((t) => t + 1);
  }, []);

  const bumpRefreshToken = useCallback(() => setRefreshToken((t) => t + 1), []);

  return {
    startTime,
    endTime,
    startMs,
    endMs,
    refreshToken,
    onTimeChange,
    onRefresh,
    bumpRefreshToken,
  };
}

/*
 * Copyright OpenSearch Contributors
 * SPDX-License-Identifier: Apache-2.0
 */

import { useEffect, useRef } from 'react';
import dateMath from '@elastic/datemath';
import { TimeRange } from '../../common/types/service_types';

/** Longest `from`/`to` value accepted from the URL. */
const MAX_TIME_PARAM_LENGTH = 256;

/**
 * Characters allowed in a URL time bound: relative datemath (`now-15m`, `now+1h`, `now/d`)
 * and ISO-8601 (`2026-09-29T20:00:00.000Z`). Rejects markup and anything a picker never emits.
 */
const TIME_PARAM_REGEX = /^[a-zA-Z0-9_\-:+./]+$/;

/**
 * True when `value` is a time bound the APM pages can safely read from the URL: short,
 * limited to datemath/ISO characters, and actually resolvable by datemath.
 */
export const isValidUrlTimeBound = (value: string | null | undefined): value is string => {
  if (!value || value.length > MAX_TIME_PARAM_LENGTH || !TIME_PARAM_REGEX.test(value)) {
    return false;
  }
  try {
    return dateMath.parse(value) !== undefined;
  } catch {
    return false;
  }
};

/** Split `window.location.hash` into its path (`#/route`) and query params. */
export const splitHash = (hash: string = window.location.hash) => {
  const queryIndex = hash.indexOf('?');
  return {
    path: queryIndex >= 0 ? hash.substring(0, queryIndex) : hash,
    params: new URLSearchParams(queryIndex >= 0 ? hash.substring(queryIndex + 1) : ''),
  };
};

/** The URL's `from`/`to`, or undefined when either is missing or invalid. */
export const readUrlTimeRange = (params: URLSearchParams): TimeRange | undefined => {
  const from = params.get('from');
  const to = params.get('to');
  return isValidUrlTimeBound(from) && isValidUrlTimeBound(to) ? { from, to } : undefined;
};

/**
 * Write `from`/`to` into the hash, keeping its path and every other param. Uses
 * replaceState, so it adds no history entry and fires no `hashchange`.
 */
const writeUrlTimeRange = (
  path: string,
  params: URLSearchParams,
  timeRange: TimeRange,
  fallbackPath: string
) => {
  params.set('from', timeRange.from);
  params.set('to', timeRange.to);
  window.history.replaceState(null, '', `${path || fallbackPath}?${params.toString()}`);
};

export interface UseTimeRangeUrlSyncOptions {
  /** The page's current time range. */
  timeRange: TimeRange;
  /**
   * Whether a hash path (`#/route`, without the query) belongs to this page. The hook never
   * touches the URL of another page, e.g. after the user has navigated away by a hash link.
   */
  isCurrentPage: (hashPath: string) => boolean;
  /**
   * Identifies the page instance (e.g. service + environment). A change is treated like a
   * fresh mount: a valid range already in the URL wins over `timeRange`.
   */
  pageKey?: string;
  /** Path to write when the hash is empty (an app root). */
  fallbackPath?: string;
}

/**
 * Keep the URL's `from`/`to` in sync with a page's time range so every link is shareable.
 *
 * - On mount (or `pageKey` change) a valid range in the URL is the source of truth; the page
 *   reads it itself. A missing or invalid range is backfilled with `timeRange`.
 * - Afterwards, any `timeRange` change (picker, brush, hash change) is written to the URL.
 * - A `hashchange` that lands on this page without a valid range (e.g. an in-page link that
 *   only sets `tab`) is backfilled too, since `timeRange` does not change in that case.
 */
export const useTimeRangeUrlSync = ({
  timeRange,
  isCurrentPage,
  pageKey,
  fallbackPath = '',
}: UseTimeRangeUrlSyncOptions) => {
  const timeRangeRef = useRef(timeRange);
  timeRangeRef.current = timeRange;
  const isCurrentPageRef = useRef(isCurrentPage);
  isCurrentPageRef.current = isCurrentPage;

  const hasRunRef = useRef(false);
  const lastPageKeyRef = useRef(pageKey);

  useEffect(() => {
    const isEntry = !hasRunRef.current || lastPageKeyRef.current !== pageKey;
    hasRunRef.current = true;
    lastPageKeyRef.current = pageKey;

    const { path, params } = splitHash();
    if (!isCurrentPageRef.current(path)) return;
    const urlRange = readUrlTimeRange(params);
    if (urlRange) {
      if (isEntry) return;
      if (urlRange.from === timeRange.from && urlRange.to === timeRange.to) return;
    }
    writeUrlTimeRange(path, params, timeRange, fallbackPath);
  }, [timeRange, pageKey, fallbackPath]);

  useEffect(() => {
    const onHashChange = () => {
      const { path, params } = splitHash();
      if (!isCurrentPageRef.current(path) || readUrlTimeRange(params)) return;
      writeUrlTimeRange(path, params, timeRangeRef.current, fallbackPath);
    };
    window.addEventListener('hashchange', onHashChange);
    return () => window.removeEventListener('hashchange', onHashChange);
  }, [fallbackPath]);
};

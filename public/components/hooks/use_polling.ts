/*
 * Copyright OpenSearch Contributors
 * SPDX-License-Identifier: Apache-2.0
 */

import { useState, useEffect, useRef } from 'react';

interface UsePollingProps<T> {
  fetchFunction: () => Promise<T>;
  initialInterval?: number;
  cachingStrategy?: (item: T, cache: Record<string, T>) => void;
  enableExponentialBackoff?: boolean;
  maxRetries?: number;
  maxInterval?: number;
}

interface UsePollingResponse<T> {
  data: T | null;
  cache: Record<string, T>;
  startPolling: () => void;
  stopPolling: () => void;
  setInterval: (interval: number) => void;
  isPolling: boolean;
  error: any;
  interval: number;
}

/**
 * usePolling - A hook for polling data asynchronously at regular intervals.
 *
 * @template T - The type of data expected to be fetched and managed by the hook.
 * @param {UsePollingProps<T>} props - The configuration options for the hook.
 * @returns {UsePollingResponse<T>} - An object containing the polled data, cache, control functions, and other states.
 */

export function usePolling<T>({
  fetchFunction,
  initialInterval = 1000,
  cachingStrategy,
  enableExponentialBackoff = false,
  maxRetries = 10, // Add a limit to the number of retries to prevent infinite retries
  maxInterval = 60000, // Add a maximum interval, e.g., 60 seconds, to ensure the interval doesn't become unmanageably large
}: UsePollingProps<T>): UsePollingResponse<T> {
  const [data, setData] = useState<T | null>(null); // The latest fetched data
  const [interval, setIntervalTime] = useState(initialInterval); // Current polling interval
  const [isPolling, setPolling] = useState(true); // State to control polling status
  const [error, setError] = useState<any>(null); // Error state
  const cache = useRef<Record<string, T>>({}); // Cache for storing intermediate data
  const retries = useRef(0); // Number of retries after failed fetches
  const isMounted = useRef(true); // To prevent state updates on unmounted components
  const isPrevCallCompleted = useRef(true); // To prevent overlapping fetch calls

  useEffect(() => {
    // If polling is stopped, don't execute any fetch logic
    if (!isPolling) return;

    const doFetch = async () => {
      // Prevent overlapping fetches
      if (!isPrevCallCompleted.current) return;
      isPrevCallCompleted.current = false;

      try {
        const result = await fetchFunction();

        // Update state only if the component is still mounted
        if (isMounted.current) {
          setData(result);
          setError(null); // Reset the error if the fetch is successful
          retries.current = 0; // Reset retries on a successful fetch
          setIntervalTime(initialInterval); // Reset interval on a successful fetch
          // Update cache if a caching strategy is provided
          if (cachingStrategy) {
            cachingStrategy(result, cache.current);
          }
        }
      } catch (err) {
        setError(err);

        // Handle exponential backoff if enabled
        if (enableExponentialBackoff && retries.current < maxRetries) {
          retries.current += 1;
          let nextInterval = initialInterval * 2;
          nextInterval = Math.min(nextInterval, maxInterval); // Ensure we don't exceed the max interval
          setIntervalTime(nextInterval);
        }
      } finally {
        isPrevCallCompleted.current = true;
      }
    };

    // Set up the polling interval
    const intervalId = setInterval(doFetch, interval);

    // Immediately call the fetch function once
    doFetch();

    // Cleanup: clear the interval and update the isMounted ref
    return () => {
      isMounted.current = false;
      clearInterval(intervalId);
    };
  }, [
    fetchFunction,
    interval,
    isPolling,
    cachingStrategy,
    initialInterval,
    enableExponentialBackoff,
  ]);

  return {
    data,
    cache: cache.current,
    startPolling: () => setPolling(true),
    stopPolling: () => setPolling(false),
    setInterval: setIntervalTime,
    isPolling,
    error,
    interval,
  };
}

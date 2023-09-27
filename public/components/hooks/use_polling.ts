/*
 * Copyright OpenSearch Contributors
 * SPDX-License-Identifier: Apache-2.0
 */

import { useState, useRef } from 'react';

type FetchFunction<T, P = void> = (params?: P) => Promise<T>;

interface UsePollingReturn<T> {
  data: T | null;
  loading: boolean;
  error: Error | null;
  startPolling: (params?: any) => void;
  stopPolling: () => void;
}

export function usePolling<T, P = void>(
  fetchFunction: FetchFunction<T, P>,
  interval: number = 5000
): UsePollingReturn<T> {
  const [data, setData] = useState<T | null>(null);
  const [error, setError] = useState<Error | null>(null);
  const [loading, setLoading] = useState<boolean>(true);
  const intervalRef = useRef<NodeJS.Timeout | string | number | undefined>(undefined);

  const shouldPoll = useRef(false);

  const startPolling = (params?: P) => {
    shouldPoll.current = true;
    const intervalId = setInterval(() => {
      if (shouldPoll.current) {
        fetchData(params);
      }
    }, interval);
    intervalRef.current = intervalId;
  };

  const stopPolling = () => {
    shouldPoll.current = false;
    clearInterval(intervalRef.current);
  };

  const fetchData = async (params?: P) => {
    try {
      const result = await fetchFunction(params);
      setData(result);
    } catch (err) {
      setError(err);
    } finally {
      setLoading(false);
    }
  };

  return { data, loading, error, startPolling, stopPolling };
}

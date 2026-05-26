/*
 * Copyright OpenSearch Contributors
 * SPDX-License-Identifier: Apache-2.0
 */

/** List notification destinations for a single OpenSearch datasource. */
import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  AlertingOpenSearchService,
  DestinationSummary,
} from '../query_services/alerting_opensearch_service';

export interface UseDestinationsParams {
  dsId: string;
  refreshToken?: unknown;
}

export interface UseDestinationsResult {
  destinations: DestinationSummary[];
  /**
   * Cluster-side total reported by the alerting API. When the result is
   * truncated this exceeds `destinations.length`; otherwise it equals it.
   */
  totalDestinations: number;
  /** True when entries beyond the server-side size cap (200) were not returned. */
  truncated: boolean;
  isLoading: boolean;
  error: Error | null;
  refetch: () => void;
}

export function useDestinations({
  dsId,
  refreshToken,
}: UseDestinationsParams): UseDestinationsResult {
  const service = useMemo(() => new AlertingOpenSearchService(), []);
  const [destinations, setDestinations] = useState<DestinationSummary[]>([]);
  const [totalDestinations, setTotalDestinations] = useState(0);
  const [truncated, setTruncated] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<Error | null>(null);
  const [localRefresh, setLocalRefresh] = useState(0);
  const refetch = useCallback(() => setLocalRefresh((t) => t + 1), []);

  useEffect(() => {
    if (!dsId) {
      setDestinations([]);
      setTotalDestinations(0);
      setTruncated(false);
      return;
    }
    let cancelled = false;
    setIsLoading(true);
    setError(null);
    (async () => {
      try {
        const result = await service.listDestinations(dsId);
        if (!cancelled) {
          setDestinations(result.destinations);
          setTotalDestinations(result.totalDestinations);
          setTruncated(result.truncated);
        }
      } catch (e) {
        if (!cancelled) setError(e instanceof Error ? e : new Error(String(e)));
      } finally {
        if (!cancelled) setIsLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [service, dsId, refreshToken, localRefresh]);

  return { destinations, totalDestinations, truncated, isLoading, error, refetch };
}

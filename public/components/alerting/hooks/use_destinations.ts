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
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<Error | null>(null);
  const [localRefresh, setLocalRefresh] = useState(0);
  const refetch = useCallback(() => setLocalRefresh((t) => t + 1), []);

  useEffect(() => {
    if (!dsId) {
      setDestinations([]);
      return;
    }
    let cancelled = false;
    setIsLoading(true);
    setError(null);
    (async () => {
      try {
        const list = await service.listDestinations(dsId);
        if (!cancelled) setDestinations(list);
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

  return { destinations, isLoading, error, refetch };
}

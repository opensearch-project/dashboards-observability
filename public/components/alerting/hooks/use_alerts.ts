/*
 * Copyright OpenSearch Contributors
 * SPDX-License-Identifier: Apache-2.0
 */

/**
 * use_alerts — unified alerts across selected datasources.
 *
 * Wraps `AlertingOpenSearchService.listAlerts`, which returns a
 * `ProgressiveResponse<UnifiedAlertSummary>` (all results with per-datasource
 * status). The server does not implement page/pageSize pagination on the
 * unified endpoint; consumers that need pagination should slice
 * `data.results` client-side.
 *
 * Time range (`startTime`/`endTime`) is forwarded as-is (date-math strings)
 * to the transport, which appends them to the request query object. Changing
 * either value triggers a refetch through the effect dependencies below.
 */
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { ProgressiveResponse, UnifiedAlertSummary } from '../../../../common/types/alerting';
import { AlertingOpenSearchService } from '../query_services/alerting_opensearch_service';

export interface UseAlertsParams {
  dsIds: string[];
  /** Date-math string (e.g. "now-1h"). */
  startTime?: string;
  /** Date-math string (e.g. "now"). */
  endTime?: string;
  refreshToken?: unknown;
}

export interface UseAlertsResult {
  data: ProgressiveResponse<UnifiedAlertSummary> | null;
  isLoading: boolean;
  error: Error | null;
  refetch: () => void;
}

export function useAlerts({
  dsIds,
  startTime,
  endTime,
  refreshToken,
}: UseAlertsParams): UseAlertsResult {
  const service = useMemo(() => new AlertingOpenSearchService(), []);
  const [data, setData] = useState<ProgressiveResponse<UnifiedAlertSummary> | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<Error | null>(null);
  const [localRefresh, setLocalRefresh] = useState(0);
  const refetch = useCallback(() => setLocalRefresh((t) => t + 1), []);

  // Monotonic request id — guards against stale responses overwriting newer
  // ones when the user changes the picker faster than the network responds.
  // Each effect run captures its request id at dispatch; when the response
  // resolves we check the ref, and only commit state if no later request has
  // started in the meantime. Closure-scoped `cancelled` flags alone do not
  // prevent this because the older effect's `cancelled = true` happens
  // during cleanup (before the new effect body), which is fine for the
  // common case but fails if the older request resolves after the newer
  // one has already committed its result.
  const lastRequestIdRef = useRef(0);

  const dsIdsKey = dsIds.join(',');

  useEffect(() => {
    if (dsIds.length === 0) {
      setData(null);
      return;
    }
    const requestId = ++lastRequestIdRef.current;
    setIsLoading(true);
    setError(null);
    (async () => {
      try {
        const res = await service.listAlerts({ dsIds, startTime, endTime });
        if (requestId !== lastRequestIdRef.current) return;
        setData(res);
      } catch (e) {
        if (requestId !== lastRequestIdRef.current) return;
        setError(e instanceof Error ? e : new Error(String(e)));
      } finally {
        if (requestId === lastRequestIdRef.current) setIsLoading(false);
      }
    })();
    // `dsIds` is a new array reference each render; `dsIdsKey` is its stable
    // projection. `startTime`/`endTime` are primitive strings — safe to list
    // directly (equivalent to a stable-string key for a single value).
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [service, dsIdsKey, startTime, endTime, refreshToken, localRefresh]);

  return { data, isLoading, error, refetch };
}

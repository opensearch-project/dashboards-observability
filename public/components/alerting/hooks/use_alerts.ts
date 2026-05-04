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
 */
import { useCallback, useEffect, useMemo, useState } from 'react';
import type { ProgressiveResponse, UnifiedAlertSummary } from '../../../../common/types/alerting';
import { AlertingOpenSearchService } from '../query_services/alerting_opensearch_service';

export interface UseAlertsParams {
  dsIds: string[];
  refreshToken?: unknown;
}

export interface UseAlertsResult {
  data: ProgressiveResponse<UnifiedAlertSummary> | null;
  isLoading: boolean;
  error: Error | null;
  refetch: () => void;
}

export function useAlerts({ dsIds, refreshToken }: UseAlertsParams): UseAlertsResult {
  const service = useMemo(() => new AlertingOpenSearchService(), []);
  const [data, setData] = useState<ProgressiveResponse<UnifiedAlertSummary> | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<Error | null>(null);
  const [localRefresh, setLocalRefresh] = useState(0);
  const refetch = useCallback(() => setLocalRefresh((t) => t + 1), []);

  const dsIdsKey = dsIds.join(',');

  useEffect(() => {
    if (dsIds.length === 0) {
      setData(null);
      return;
    }
    let cancelled = false;
    setIsLoading(true);
    setError(null);
    (async () => {
      try {
        const res = await service.listAlerts({ dsIds });
        if (!cancelled) setData(res);
      } catch (e) {
        if (!cancelled) setError(e instanceof Error ? e : new Error(String(e)));
      } finally {
        if (!cancelled) setIsLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
    // `dsIds` is a new array reference each render; `dsIdsKey` is its stable projection.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [service, dsIdsKey, refreshToken, localRefresh]);

  return { data, isLoading, error, refetch };
}

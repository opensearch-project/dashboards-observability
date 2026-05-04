/*
 * Copyright OpenSearch Contributors
 * SPDX-License-Identifier: Apache-2.0
 */

/** use_alert_detail — fetch single alert for the detail flyout. */
import { useEffect, useMemo, useState } from 'react';
import type { UnifiedAlert } from '../../../../common/types/alerting';
import { AlertingOpenSearchService } from '../query_services/alerting_opensearch_service';

export interface UseAlertDetailResult {
  data: UnifiedAlert | null;
  isLoading: boolean;
  error: Error | null;
}

export function useAlertDetail(
  dsId: string | undefined,
  alertId: string | undefined
): UseAlertDetailResult {
  const service = useMemo(() => new AlertingOpenSearchService(), []);
  const [data, setData] = useState<UnifiedAlert | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<Error | null>(null);

  useEffect(() => {
    if (!dsId || !alertId) {
      setData(null);
      return;
    }
    let cancelled = false;
    setIsLoading(true);
    setError(null);
    (async () => {
      try {
        const res = await service.getAlertDetail(dsId, alertId);
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
  }, [service, dsId, alertId]);

  return { data, isLoading, error };
}

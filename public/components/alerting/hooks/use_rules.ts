/*
 * Copyright OpenSearch Contributors
 * SPDX-License-Identifier: Apache-2.0
 */

/** use_rules — paginated unified rules across selected datasources. */
import { useCallback, useEffect, useMemo, useState } from 'react';
import type { PaginatedResponse, UnifiedRuleSummary } from '../../../../common/types/alerting';
import { AlertingOpenSearchService } from '../query_services/alerting_opensearch_service';

export interface UseRulesParams {
  dsIds: string[];
  page: number;
  pageSize: number;
  refreshToken?: unknown;
}

export interface UseRulesResult {
  data: PaginatedResponse<UnifiedRuleSummary> | null;
  isLoading: boolean;
  error: Error | null;
  refetch: () => void;
}

export function useRules({ dsIds, page, pageSize, refreshToken }: UseRulesParams): UseRulesResult {
  const service = useMemo(() => new AlertingOpenSearchService(), []);
  const [data, setData] = useState<PaginatedResponse<UnifiedRuleSummary> | null>(null);
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
        const res = await service.listRules({ dsIds, page, pageSize });
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
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [service, dsIdsKey, page, pageSize, refreshToken, localRefresh]);

  return { data, isLoading, error, refetch };
}

/*
 * Copyright OpenSearch Contributors
 * SPDX-License-Identifier: Apache-2.0
 */

/** use_rule_detail — fetch single rule for the detail flyout. */
import { useEffect, useMemo, useState } from 'react';
import type { UnifiedRule } from '../../../../common/types/alerting';
import { AlertingOpenSearchService } from '../query_services/alerting_opensearch_service';

export interface UseRuleDetailResult {
  data: UnifiedRule | null;
  isLoading: boolean;
  error: Error | null;
}

export function useRuleDetail(
  dsId: string | undefined,
  ruleId: string | undefined
): UseRuleDetailResult {
  const service = useMemo(() => new AlertingOpenSearchService(), []);
  const [data, setData] = useState<UnifiedRule | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<Error | null>(null);

  useEffect(() => {
    if (!dsId || !ruleId) {
      setData(null);
      return;
    }
    let cancelled = false;
    setIsLoading(true);
    setError(null);
    (async () => {
      try {
        const res = await service.getRuleDetail(dsId, ruleId);
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
  }, [service, dsId, ruleId]);

  return { data, isLoading, error };
}

/*
 * Copyright OpenSearch Contributors
 * SPDX-License-Identifier: Apache-2.0
 */

/**
 * Fetch the full `UnifiedRule` detail (alert history, condition preview,
 * notification routing, suppression rules, raw monitor body) for a single
 * monitor. Used by the monitor-detail flyout — pulled out of
 * `monitor_detail_flyout.tsx` so the flyout component can stay focused on
 * presentation and the fetch shape stays independently testable.
 *
 * Behaviour preserved verbatim from the inline implementation:
 *   - Re-runs when `dsId` or `ruleId` change.
 *   - `cancelled` flag prevents stale-closure state writes after unmount.
 *   - Errors are surfaced both via `console.error` (server-side debugging)
 *     and an `error` field in the result so the flyout can render an
 *     inline callout / degraded-state hint when the detail fetch fails.
 *     Partial detail still renders against the summary props.
 */
import { useEffect, useMemo, useState } from 'react';
import type { UnifiedRule } from '../../../../common/types/alerting';
import { AlertingOpenSearchService } from '../query_services/alerting_opensearch_service';

export interface UseMonitorDetailParams {
  dsId: string;
  ruleId: string;
}

export interface UseMonitorDetailResult {
  detail: UnifiedRule | null;
  isLoading: boolean;
  error: Error | null;
}

export function useMonitorDetail({ dsId, ruleId }: UseMonitorDetailParams): UseMonitorDetailResult {
  const osService = useMemo(() => new AlertingOpenSearchService(), []);
  const [detail, setDetail] = useState<UnifiedRule | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<Error | null>(null);

  useEffect(() => {
    let cancelled = false;
    setIsLoading(true);
    setError(null);
    osService
      .getRuleDetail(dsId, ruleId)
      .then((data: UnifiedRule) => {
        if (!cancelled && data) setDetail(data);
      })
      .catch((err: unknown) => {
        console.error('Failed to load monitor details:', err);
        if (!cancelled) {
          setError(err instanceof Error ? err : new Error(String(err)));
        }
      })
      .finally(() => {
        if (!cancelled) setIsLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [dsId, ruleId, osService]);

  return { detail, isLoading, error };
}

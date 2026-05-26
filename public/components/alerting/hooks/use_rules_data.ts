/*
 * Copyright OpenSearch Contributors
 * SPDX-License-Identifier: Apache-2.0
 */

/**
 * Fetch rules from the unified alerting service for the current datasource
 * selection. Re-runs whenever `selectedDsIds` changes OR the caller bumps
 * `refreshToken` (after a delete / clone / acknowledge has invalidated the
 * cached list).
 *
 * Mirrors the inline `fetchRules` flow that previously lived in
 * `alarms_page.tsx`. Behaviour preserved verbatim:
 *   - Empty selection → empty results, total=0, no fetch.
 *   - `.opendistro-alerting-config` not-found errors are filtered out of
 *     warnings (the user is about to see the empty-state CTA).
 *   - Caller-supplied `setRules`/`setRulesTotal` are returned via state
 *     so the page can layer optimistic inserts on top.
 */
import { useCallback, useEffect, useMemo, useState } from 'react';
import { i18n } from '@osd/i18n';
import type { UnifiedRuleSummary } from '../../../../common/types/alerting';
import { AlertingOpenSearchService } from '../query_services/alerting_opensearch_service';
import { isAlertingConfigMissingError } from '../alarms_page_helpers';

export interface DatasourceWarning {
  datasourceName: string;
  error: string;
}

export interface UseRulesDataParams {
  selectedDsIds: string[];
}

export interface UseRulesDataResult {
  rules: UnifiedRuleSummary[];
  rulesTotal: number;
  isLoading: boolean;
  error: string | null;
  warnings: DatasourceWarning[];
  /** Imperatively set the rules array — used for optimistic insert / clear-on-delete. */
  setRules: React.Dispatch<React.SetStateAction<UnifiedRuleSummary[]>>;
  setRulesTotal: React.Dispatch<React.SetStateAction<number>>;
  /** Imperative refetch; equivalent to bumping `refreshToken`. */
  refetch: () => void;
}

export function useRulesData({ selectedDsIds }: UseRulesDataParams): UseRulesDataResult {
  const osService = useMemo(() => new AlertingOpenSearchService(), []);
  const [rules, setRules] = useState<UnifiedRuleSummary[]>([]);
  const [rulesTotal, setRulesTotal] = useState(-1); // -1 = not yet loaded
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [warnings, setWarnings] = useState<DatasourceWarning[]>([]);
  const [internalRefresh, setInternalRefresh] = useState(0);

  const refetch = useCallback(() => setInternalRefresh((t) => t + 1), []);

  const fetchRules = useCallback(
    async (dsIds: string[]) => {
      if (dsIds.length === 0) {
        setRules([]);
        setRulesTotal(0);
        return;
      }
      setIsLoading(true);
      setError(null);
      setWarnings([]);
      try {
        const res = await osService.listRules({ dsIds });
        setRules(res.results || []);
        setRulesTotal((res.results || []).length);
        const failedStatuses = (res.datasourceStatus || [])
          .filter((s) => s.status === 'error')
          .filter((s) => !isAlertingConfigMissingError(s.error));
        if (failedStatuses.length > 0) {
          setWarnings(
            failedStatuses.map((s) => ({
              datasourceName: s.datasourceName,
              error:
                s.error ||
                i18n.translate('observability.alerting.alarmsPage.unknownError', {
                  defaultMessage: 'Unknown error',
                }),
            }))
          );
        }
      } catch (e: unknown) {
        setError(
          e instanceof Error
            ? e.message
            : i18n.translate('observability.alerting.alarmsPage.fetchRulesError', {
                defaultMessage: 'Failed to fetch rules',
              })
        );
      } finally {
        setIsLoading(false);
      }
    },
    [osService]
  );

  useEffect(() => {
    if (selectedDsIds.length === 0) {
      setRules([]);
      setRulesTotal(0);
      return;
    }
    fetchRules(selectedDsIds);
    // Imperative refetch via `refetch()` bumps `internalRefresh`.
  }, [selectedDsIds, internalRefresh, fetchRules]);

  return { rules, rulesTotal, isLoading, error, warnings, setRules, setRulesTotal, refetch };
}

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
import type { ClassifiedError } from '../../../../common/error';
import { AlertingOpenSearchService } from '../query_services/alerting_opensearch_service';
import { isAlertingConfigMissingError } from '../alarms_page_helpers';
import { CLOUDWATCH_DATASOURCE_ID } from '../shared_constants';

export interface DatasourceWarning {
  datasourceName: string;
  error: string;
  /** Structured failure classification when the server attached one. */
  errorDetail?: ClassifiedError;
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
  /** Imperative refetch; equivalent to bumping `refreshToken`. Shows the
   * loading state (spinner) — use for explicit user actions. */
  refetch: () => void;
  /** Silent refetch that does NOT toggle the loading state — use for periodic
   * background polling so the table doesn't flash while it re-syncs. It skips the CloudWatch
   * datasource (its alarm listing is rate-limited per account and shared with the user's other
   * tools) and keeps the last CloudWatch rows; explicit refetches include it. */
  backgroundRefetch: () => void;
  /** Datasources that returned only part of their rules (a capped listing). */
  truncatedDatasourceNames: string[];
}

export function useRulesData({ selectedDsIds }: UseRulesDataParams): UseRulesDataResult {
  const osService = useMemo(() => new AlertingOpenSearchService(), []);
  const [rules, setRules] = useState<UnifiedRuleSummary[]>([]);
  const [rulesTotal, setRulesTotal] = useState(-1); // -1 = not yet loaded
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [warnings, setWarnings] = useState<DatasourceWarning[]>([]);
  const [truncatedDatasourceNames, setTruncatedDatasourceNames] = useState<string[]>([]);
  const [internalRefresh, setInternalRefresh] = useState(0);

  const refetch = useCallback(() => setInternalRefresh((t) => t + 1), []);

  const fetchRules = useCallback(
    async (dsIds: string[], background = false) => {
      if (dsIds.length === 0) {
        setRules([]);
        setRulesTotal(0);
        return;
      }
      // A background poll re-syncs silently: no spinner, and it leaves the
      // current error/warning surface in place until it has a fresh answer.
      if (!background) {
        setIsLoading(true);
        setError(null);
        setWarnings([]);
      }
      // Background polls leave CloudWatch out and keep its last rows (see `backgroundRefetch`).
      const skipCloudWatch = background && dsIds.includes(CLOUDWATCH_DATASOURCE_ID);
      const fetchIds = skipCloudWatch
        ? dsIds.filter((id) => id !== CLOUDWATCH_DATASOURCE_ID)
        : dsIds;
      try {
        const res =
          fetchIds.length > 0
            ? await osService.listRules({ dsIds: fetchIds })
            : { results: [], datasourceStatus: [] };
        const fetched = res.results || [];
        if (skipCloudWatch) {
          setRules((prev) => {
            const next = [
              ...fetched,
              ...prev.filter((r) => r.datasourceId === CLOUDWATCH_DATASOURCE_ID),
            ];
            setRulesTotal(next.length);
            return next;
          });
        } else {
          setRules(fetched);
          setRulesTotal(fetched.length);
        }
        const statuses = res.datasourceStatus || [];
        const failedStatuses = statuses
          .filter((s) => s.status === 'error')
          .filter((s) => !isAlertingConfigMissingError(s.error));
        const nextWarnings = failedStatuses.map((s) => ({
          datasourceName: s.datasourceName,
          error:
            s.error ||
            i18n.translate('observability.alerting.alarmsPage.unknownError', {
              defaultMessage: 'Unknown error',
            }),
          errorDetail: s.errorDetail,
        }));
        const nextTruncated = statuses.filter((s) => s.truncated).map((s) => s.datasourceName);
        const fetchedNames = new Set(statuses.map((s) => s.datasourceName));
        if (skipCloudWatch) {
          // Keep what the last full fetch said about the datasources this poll skipped.
          setWarnings((prev) => [
            ...nextWarnings,
            ...prev.filter((w) => !fetchedNames.has(w.datasourceName)),
          ]);
          setTruncatedDatasourceNames((prev) => [
            ...nextTruncated,
            ...prev.filter((n) => !fetchedNames.has(n)),
          ]);
        } else {
          if (nextWarnings.length > 0) setWarnings(nextWarnings);
          setTruncatedDatasourceNames(nextTruncated);
        }
      } catch (e: unknown) {
        // A failed background poll must not blow away the currently-displayed
        // rules with an error banner — keep the last good state and try again
        // on the next tick. Foreground fetches still surface the error.
        if (!background) {
          setError(
            e instanceof Error
              ? e.message
              : i18n.translate('observability.alerting.alarmsPage.fetchRulesError', {
                  defaultMessage: 'Failed to fetch rules',
                })
          );
        }
      } finally {
        if (!background) setIsLoading(false);
      }
    },
    [osService]
  );

  const backgroundRefetch = useCallback(() => {
    if (selectedDsIds.length > 0) fetchRules(selectedDsIds, true);
  }, [selectedDsIds, fetchRules]);

  useEffect(() => {
    if (selectedDsIds.length === 0) {
      setRules([]);
      setRulesTotal(0);
      return;
    }
    fetchRules(selectedDsIds);
    // Imperative refetch via `refetch()` bumps `internalRefresh`.
  }, [selectedDsIds, internalRefresh, fetchRules]);

  return {
    rules,
    rulesTotal,
    isLoading,
    error,
    warnings,
    setRules,
    setRulesTotal,
    refetch,
    backgroundRefetch,
    truncatedDatasourceNames,
  };
}

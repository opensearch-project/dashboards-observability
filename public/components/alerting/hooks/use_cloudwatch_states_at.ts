/*
 * Copyright OpenSearch Contributors
 * SPDX-License-Identifier: Apache-2.0
 */
/**
 * CloudWatch alarm states at the end of the Rules tab's window, so the Status and Health
 * columns show each CloudWatch row as it was then. A window ending now needs no fetch: the
 * listed state is already the state at its end. Otherwise one account-wide history read per
 * CloudWatch datasource replaces a history call per alarm.
 */
import { useCallback, useEffect, useMemo, useState } from 'react';
import type {
  CloudWatchAlarmState,
  CloudWatchStatesAt,
  UnifiedRuleSummary,
} from '../../../../common/types/alerting';
import { AlertingOpenSearchService } from '../query_services/alerting_opensearch_service';
import { isCloudWatchRule } from '../shared_constants';

/** A window end this close to now counts as now. */
const NOW_TOLERANCE_MS = 60 * 1000;

export interface CloudWatchWindowState {
  /** Undefined when the moment is older than CloudWatch's 30-day alarm history. */
  state?: CloudWatchAlarmState;
  /** The moment the state is for (the window end). */
  atMs: number;
  /** False when the history read stopped short, so the state may be the current one. */
  complete: boolean;
}

export interface UseCloudWatchStatesAtParams {
  rules: UnifiedRuleSummary[];
  /** The window end, epoch ms. */
  endMs: number;
  /** Bumped by Refresh to re-read. */
  refreshToken?: number;
  /** Skip reading (e.g. an inverted range); rows show their current state. */
  disabled?: boolean;
}

export interface UseCloudWatchStatesAtResult {
  /** A CloudWatch row's state at the window end; undefined for other rows or a window ending now. */
  stateAt: (rule: UnifiedRuleSummary) => CloudWatchWindowState | undefined;
  loading: boolean;
}

export function useCloudWatchStatesAt({
  rules,
  endMs,
  refreshToken = 0,
  disabled = false,
}: UseCloudWatchStatesAtParams): UseCloudWatchStatesAtResult {
  const service = useMemo(() => new AlertingOpenSearchService(), []);
  const [byDs, setByDs] = useState<Record<string, CloudWatchStatesAt>>({});
  const [loading, setLoading] = useState(false);

  const endsNow = disabled || endMs >= Date.now() - NOW_TOLERANCE_MS;
  // Stable key so a rules refetch with the same CloudWatch datasources doesn't refetch states.
  const dsKey = useMemo(
    () =>
      Array.from(new Set(rules.filter(isCloudWatchRule).map((r) => r.datasourceId)))
        .sort()
        .join('\n'),
    [rules]
  );

  useEffect(() => {
    setByDs({});
    if (endsNow || !dsKey) {
      setLoading(false);
      return;
    }
    let cancelled = false;
    const controller = new AbortController();
    const at = new Date(endMs).toISOString();
    setLoading(true);
    Promise.all(
      dsKey.split('\n').map((dsId) =>
        service
          .getCloudWatchStatesAt(dsId, at, controller.signal)
          .then((result) => [dsId, result] as const)
          .catch((err: unknown) => {
            // A failed read leaves that datasource's rows on their current state.
            if (!cancelled) console.warn(`CloudWatch states at ${at} failed for ${dsId}:`, err);
            return undefined;
          })
      )
    ).then((entries) => {
      if (cancelled) return;
      const next: Record<string, CloudWatchStatesAt> = {};
      for (const entry of entries) if (entry) next[entry[0]] = entry[1];
      setByDs(next);
      setLoading(false);
    });
    return () => {
      cancelled = true;
      controller.abort();
    };
  }, [dsKey, endMs, endsNow, refreshToken, service]);

  const stateAt = useCallback(
    (rule: UnifiedRuleSummary): CloudWatchWindowState | undefined => {
      if (!isCloudWatchRule(rule)) return undefined;
      const result = byDs[rule.datasourceId];
      if (!result) return undefined;
      if (result.beyondRetention) return { atMs: result.atMs, complete: true };
      // Alarms that haven't changed since the window end are still in their current state.
      const name = rule.cloudWatch?.alarmName ?? rule.name;
      const state = result.states[name] ?? rule.cloudWatch?.state;
      if (!state) return undefined;
      return { state, atMs: result.atMs, complete: result.complete };
    },
    [byDs]
  );

  return { stateAt, loading };
}

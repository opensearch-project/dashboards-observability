/*
 * Copyright OpenSearch Contributors
 * SPDX-License-Identifier: Apache-2.0
 */

import { useEffect, useMemo, useState } from 'react';
import { PromQLSearchService } from '../../query_services/promql_search_service';
import { getQueryMapGroupTotals } from '../../query_services/query_requests/promql_queries';
import { useApmConfig } from '../../config/apm_config_context';
import { getTimeInSeconds } from '../utils/time_utils';
import { formatPrometheusDuration } from '../utils/step_utils';
import { ALL_GROUPS_KEY, ENVIRONMENT_GROUP_BY } from '../../common/constants';
import { GroupTotals } from '../../common/types/service_map_types';

export interface UseMapGroupTotalsParams {
  /** Group-by attribute, or null for the single Application total. */
  groupBy: string | null;
  startTime: Date;
  endTime: Date;
  /** Only the Application / group levels need totals. */
  enabled: boolean;
  refreshTrigger?: number;
}

export interface UseMapGroupTotalsResult {
  /** Totals per group value (or ALL_GROUPS_KEY); null until loaded, when disabled, or failed. */
  totals: Map<string, GroupTotals> | null;
  isLoading: boolean;
  /**
   * The totals could not be loaded (a query failed or was truncated, or there is no Prometheus
   * connection). Group nodes then show as unavailable, never a healthy 0.
   */
  failed: boolean;
  error: Error | null;
  retry: () => void;
}

/** A valid Prometheus label name. */
export const PROMETHEUS_LABEL_PATTERN = /^[a-zA-Z_][a-zA-Z0-9_]*$/;

/**
 * Prometheus label for a map group-by attribute, as the exporter writes it: every character
 * outside `[a-zA-Z0-9_]` (dots, dashes, ...) becomes `_`, and a leading digit gets a `_`
 * prefix. Null when no valid label results (e.g. an empty key), so nothing unsafe reaches a
 * `sum by (...)` clause.
 */
export const groupByPrometheusLabel = (groupBy: string): string | null => {
  if (groupBy === ENVIRONMENT_GROUP_BY) return 'environment';
  const sanitized = groupBy.replace(/[^a-zA-Z0-9_]/g, '_');
  const label = /^[0-9]/.test(sanitized) ? `_${sanitized}` : sanitized;
  return PROMETHEUS_LABEL_PATTERN.test(label) ? label : null;
};

/**
 * Request / fault / error totals for the map's Application node or group nodes, from three
 * `sum by (<group label>)` queries. These replace summing per-node metrics, so the Application
 * and group levels of a large map never fetch metrics for every service; per-node batches run
 * only for the nodes on screen (an opened group, the services view, a focused neighborhood).
 */
export const useMapGroupTotals = (params: UseMapGroupTotalsParams): UseMapGroupTotalsResult => {
  const { config } = useApmConfig();
  const prometheusConnectionId = config?.prometheusDataSource?.name;
  const prometheusConnectionMeta = config?.prometheusDataSource?.meta;
  const promqlService = useMemo(
    () =>
      prometheusConnectionId
        ? new PromQLSearchService(prometheusConnectionId, prometheusConnectionMeta)
        : null,
    [prometheusConnectionId, prometheusConnectionMeta]
  );

  const endTimeSec = getTimeInSeconds(params.endTime);
  const timeRange = formatPrometheusDuration(
    Math.floor((params.endTime.getTime() - params.startTime.getTime()) / 1000)
  );
  const label = params.groupBy ? groupByPrometheusLabel(params.groupBy) : null;
  // A group-by key that maps to no valid label cannot be totalled: fail rather than query.
  const invalidLabel = !!params.groupBy && label === null;
  const [retryTrigger, setRetryTrigger] = useState(0);
  const key = `${prometheusConnectionId}|${label}|${endTimeSec}|${timeRange}|${params.refreshTrigger}|${retryTrigger}`;

  const [state, setState] = useState<{
    key: string;
    totals: Map<string, GroupTotals> | null;
    error: Error | null;
  } | null>(null);

  useEffect(() => {
    if (!params.enabled || !promqlService || invalidLabel) return;
    const controller = new AbortController();
    const run = (metric: 'request' | 'fault' | 'error') =>
      promqlService.executeInstantQuery({
        query: getQueryMapGroupTotals(metric, label, timeRange),
        time: endTimeSec,
        signal: controller.signal,
      });
    const fail = (reason: unknown) => {
      if (controller.signal.aborted) return;
      const error = reason instanceof Error ? reason : new Error('Unknown error');
      console.error('[useMapGroupTotals] Totals unavailable:', error);
      setState({ key, totals: null, error });
    };
    Promise.allSettled([run('request'), run('fault'), run('error')])
      .then(([requests, faults, errors]) => {
        if (controller.signal.aborted) return;
        // All three are needed (the failure rate divides by requests): any failure, or a result
        // cut at the series limit, makes the totals unavailable rather than a partial 0.
        const rejected = [requests, faults, errors].find((r) => r.status === 'rejected') as
          PromiseRejectedResult | undefined;
        const truncated = [requests, faults, errors].some(
          (r) =>
            r.status === 'fulfilled' &&
            !!(r.value as { meta?: { truncation?: { tableTruncated?: boolean } } } | null)?.meta
              ?.truncation?.tableTruncated
        );
        if (rejected) {
          fail(rejected.reason);
          return;
        }
        if (truncated) {
          fail(new Error('Too many groups to total'));
          return;
        }
        const totals = new Map<string, GroupTotals>();
        const entry = (group: string) => {
          let t = totals.get(group);
          if (!t) {
            t = { totalRequests: 0, totalFaults: 0, totalErrors: 0 };
            totals.set(group, t);
          }
          return t;
        };
        const add = (r: PromiseSettledResult<unknown>, field: keyof GroupTotals) => {
          if (r.status !== 'fulfilled') return;
          readGroupValues(r.value, label).forEach((value, group) => {
            entry(group)[field] += value;
          });
        };
        add(requests, 'totalRequests');
        add(faults, 'totalFaults');
        add(errors, 'totalErrors');
        setState({ key, totals, error: null });
      })
      // A malformed response (e.g. a value field without `values`) throws while reading: the
      // totals fail instead of staying loading with an unhandled rejection.
      .catch(fail);
    return () => controller.abort();
    // `key` covers the connection, label and time range.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key, params.enabled, promqlService, invalidLabel]);

  const current = state?.key === key ? state : null;
  const active = params.enabled;
  // No Prometheus connection (deleted or inaccessible): nothing will load, so not "loading".
  const noConnection = active && !promqlService;
  const badLabel = active && !!promqlService && invalidLabel;
  return {
    totals: active && !badLabel ? (current?.totals ?? null) : null,
    isLoading: active && !!promqlService && !badLabel && !current,
    failed: noConnection || badLabel || (active && !!current?.error),
    error: noConnection
      ? new Error('No Prometheus connection')
      : badLabel
        ? new Error(`"${params.groupBy}" cannot be used as a Prometheus label`)
        : active
          ? (current?.error ?? null)
          : null,
    retry: () => setRetryTrigger((n) => n + 1),
  };
};

/**
 * Matches `<label>="<value>"` in a series string such as `{environment="dev",service="a"}`,
 * capturing the value. The label is escaped and must start a label (so `environment` does not
 * match inside `deployment_environment`).
 */
const seriesLabelPattern = (label: string): RegExp =>
  new RegExp(`(?:^|[{,\\s])${label.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}="([^"]*)"`);

/**
 * Values per group from an instant-query response (query-enhancements data frame, or the
 * standard Prometheus vector). With no label, the single value is keyed ALL_GROUPS_KEY.
 */
export function readGroupValues(response: any, label: string | null): Map<string, number> {
  const values = new Map<string, number>();
  const put = (group: unknown, value: unknown) => {
    const key = label ? (typeof group === 'string' ? group : '') : ALL_GROUPS_KEY;
    if (label && !key) return;
    values.set(key, (values.get(key) ?? 0) + (parseFloat(String(value)) || 0));
  };

  if (response?.type === 'data_frame' && Array.isArray(response?.fields)) {
    const labelsField = response.fields.find((f: any) => f.name === 'Labels');
    const seriesField = response.fields.find((f: any) => f.name === 'Series');
    const valueField = response.fields.find((f: any) => f.name === 'Value');
    if (valueField) {
      valueField.values.forEach((value: unknown, i: number) => {
        const labels = labelsField?.values?.[i];
        const group =
          label && labels && typeof labels === 'object'
            ? labels[label]
            : label
              ? String(seriesField?.values?.[i] ?? '').match(seriesLabelPattern(label))?.[1]
              : undefined;
        put(group, value);
      });
      return values;
    }
  }

  const result = response?.data?.result || response?.result || [];
  if (Array.isArray(result)) {
    result.forEach((r: any) => put(label ? r.metric?.[label] : undefined, r.value?.[1]));
  }
  return values;
}

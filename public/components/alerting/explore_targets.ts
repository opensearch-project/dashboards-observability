/*
 * Copyright OpenSearch Contributors
 * SPDX-License-Identifier: Apache-2.0
 */

/**
 * Explore targets for alerting rules and alerts: the query to open in Discover Logs / Explore
 * Metrics for a rule (its own signal) or an alert (its rule's signal, over the firing window).
 *
 * Prometheus rules and OpenSearch PPL monitors are described here from the row fields the page
 * already has. Other sources (e.g. a deployment-provided alarm source) attach `exploreTargets`
 * to their rows themselves, because only they know their dataset types and query languages.
 */
import { useMemo } from 'react';
import type {
  Datasource,
  UnifiedAlertSummary,
  UnifiedRuleSummary,
} from '../../../common/types/alerting';
import type { ExploreQueryTarget, ExploreTimeRange } from '../../../common/types/explore_links';
import { signalExpressions } from '../../../common/services/alerting/promql_signal';
import { useIndexMappings } from './hooks/use_index_mappings';

/** The window a rule's link opens on when the page gives none. */
export const DEFAULT_RULE_EXPLORE_TIME_RANGE: ExploreTimeRange = { from: 'now-1h', to: 'now' };

/** Padding around an alert's firing window, so the change into the alert is on screen. */
export const ALERT_EXPLORE_PAD_MS = 15 * 60 * 1000;

const METRIC_NAME = /^([a-zA-Z_:][a-zA-Z0-9_:]*)\s*(\{|\[|$)/;

/** Prometheus alerting rule → its signal (the condition without the threshold), per `and` side. */
export function prometheusRuleTargets(
  rule: Pick<UnifiedRuleSummary, 'query'>,
  ds: Datasource
): ExploreQueryTarget[] {
  const connection = ds.directQueryName || ds.name;
  if (!connection) return [];
  const expressions = signalExpressions(rule.query);
  return expressions.map((query) => ({
    signal: 'metrics' as const,
    // Same dataset shape as the APM "Open in Discover metrics" links (`dataSource:(meta:())`).
    dataset: {
      id: connection,
      title: connection,
      type: 'PROMETHEUS',
      timeFieldName: 'Time',
      dataSource: { meta: {} },
    },
    language: 'PROMQL',
    query,
    ...(expressions.length > 1 ? { label: query.match(METRIC_NAME)?.[1] ?? query } : {}),
  }));
}

/** `source=<index> | …` → the index and the rest of the pipeline (`| …`, or ''). */
export function splitPplSource(query: string): { index: string; rest: string } | undefined {
  const m = (query || '').trim().match(/^source\s*=\s*(`[^`]+`|[^\s|,]+)\s*(\|[\s\S]*)?$/i);
  if (!m) return undefined;
  return { index: m[1].replace(/^`|`$/g, ''), rest: (m[2] || '').trim() };
}

/**
 * OpenSearch PPL monitor → its PPL in Discover Logs on its index. The time field isn't known from
 * the monitor; {@link useResolvedExploreTargets} fills it from the index mapping (no link when
 * none is found).
 */
export function pplMonitorTargets(
  rule: Pick<UnifiedRuleSummary, 'query' | 'labels'>,
  ds: Datasource
): ExploreQueryTarget[] {
  if ((rule.labels?.query_language || 'ppl').toLowerCase() !== 'ppl') return [];
  const parts = splitPplSource(rule.query);
  if (!parts) return [];
  const dataSource = ds.mdsId
    ? { id: ds.mdsId, title: ds.name, type: 'OpenSearch' }
    : { id: '', title: 'Default Cluster', type: 'DATA_SOURCE' };
  return [
    {
      signal: 'logs',
      dataset: {
        id: `${dataSource.id}::${parts.index}`,
        title: parts.index,
        type: 'INDEXES',
        dataSource,
      },
      language: 'PPL',
      query: parts.rest,
    },
  ];
}

/** The Explore targets for a rule row: its own targets if the source set them, else derived. */
export function ruleExploreTargets(
  rule: UnifiedRuleSummary,
  datasources: Datasource[]
): ExploreQueryTarget[] {
  if (rule.exploreTargets) return rule.exploreTargets;
  const ds = datasources.find((d) => d.id === rule.datasourceId);
  if (!ds) return [];
  if (rule.datasourceType === 'prometheus' && rule.definitionType === 'prometheus_rule') {
    return prometheusRuleTargets(rule, ds);
  }
  if (rule.datasourceType === 'opensearch' && rule.monitorType === 'ppl') {
    return pplMonitorTargets(rule, ds);
  }
  return [];
}

/** Rows with `exploreTargets` set where they can be derived (rows with none stay unchanged). */
export function withRuleExploreTargets(
  rules: UnifiedRuleSummary[],
  datasources: Datasource[]
): UnifiedRuleSummary[] {
  return rules.map((rule) => {
    if (rule.exploreTargets) return rule;
    const targets = ruleExploreTargets(rule, datasources);
    return targets.length > 0 ? { ...rule, exploreTargets: targets } : rule;
  });
}

/**
 * An alert's targets: its own (e.g. set by its source), else its rule's: the monitor for an
 * OpenSearch alert, the rule with the same `alertname` on the same datasource for Prometheus.
 */
export function alertExploreTargets(
  alert: UnifiedAlertSummary,
  rules: UnifiedRuleSummary[],
  datasources: Datasource[]
): ExploreQueryTarget[] {
  if (alert.exploreTargets) return alert.exploreTargets;
  const sameDs = rules.filter((r) => r.datasourceId === alert.datasourceId);
  let matches: UnifiedRuleSummary[] = [];
  if (alert.datasourceType === 'opensearch' && alert.monitorId) {
    matches = sameDs.filter((r) => r.id === alert.monitorId);
  } else if (alert.datasourceType === 'prometheus') {
    const name = alert.labels?.alertname || alert.name;
    matches = sameDs.filter((r) => r.definitionType === 'prometheus_rule' && r.name === name);
    // Same-named rules in several groups: keep those whose own labels the alert carries.
    if (matches.length > 1) {
      const alertLabels = alert.labels || {};
      const carried = matches.filter((r) =>
        Object.entries(r.labels || {}).every(([k, v]) => alertLabels[k] === v)
      );
      if (carried.length > 0) matches = carried;
    }
  }
  return matches.flatMap((r) => ruleExploreTargets(r, datasources));
}

/** The alert's firing window, padded: start − 15 min to now (still open) or last update + 15 min. */
export function alertExploreTimeRange(
  alert: Pick<UnifiedAlertSummary, 'startTime' | 'lastUpdated' | 'state'>,
  nowMs: number = Date.now()
): ExploreTimeRange {
  const start = Date.parse(alert.startTime);
  if (Number.isNaN(start)) return DEFAULT_RULE_EXPLORE_TIME_RANGE;
  const from = new Date(start - ALERT_EXPLORE_PAD_MS).toISOString();
  const open =
    alert.state === 'active' || alert.state === 'pending' || alert.state === 'acknowledged';
  const last = Date.parse(alert.lastUpdated);
  if (open || Number.isNaN(last) || last + ALERT_EXPLORE_PAD_MS >= nowMs) {
    return { from, to: 'now' };
  }
  return { from, to: new Date(last + ALERT_EXPLORE_PAD_MS).toISOString() };
}

/** Pick an index's time field: `@timestamp` when it's a date, else its only date field. */
export function pickTimeField(dateFields: string[]): string | undefined {
  if (dateFields.includes('@timestamp')) return '@timestamp';
  return dateFields.length === 1 ? dateFields[0] : undefined;
}

/**
 * Fill the time field of `INDEXES` targets from the index mapping (on the alerting datasource
 * `dsId`) and drop those with no usable time field, so a link never opens an index without a
 * time range. Other targets pass through. Fetches only when such a target exists.
 */
export function useResolvedExploreTargets(
  targets: ExploreQueryTarget[],
  dsId: string
): ExploreQueryTarget[] {
  const needs = targets.find((t) => t.dataset.type === 'INDEXES' && !t.dataset.timeFieldName);
  const indices = useMemo(
    () => (needs?.dataset.title ? [needs.dataset.title] : []),
    [needs?.dataset.title]
  );
  const { fieldsByType, isLoading, isStale } = useIndexMappings({
    dsId: needs ? dsId : '',
    indices,
  });
  return useMemo(() => {
    if (!needs) return targets;
    const timeField = isLoading || isStale ? undefined : pickTimeField(fieldsByType.date || []);
    return targets.flatMap((t) => {
      if (t.dataset.type !== 'INDEXES' || t.dataset.timeFieldName) return [t];
      return timeField ? [{ ...t, dataset: { ...t.dataset, timeFieldName: timeField } }] : [];
    });
  }, [targets, needs, fieldsByType, isLoading, isStale]);
}

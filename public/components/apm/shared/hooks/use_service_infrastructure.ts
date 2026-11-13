/*
 * Copyright OpenSearch Contributors
 * SPDX-License-Identifier: Apache-2.0
 */

import { useEffect, useMemo, useRef, useState } from 'react';
import { useApmConfig } from '../../config/apm_config_context';
import { getMappedFieldNames } from '../../query_services/field_mapping_service';
import { PPLSearchService } from '../../query_services/ppl_search_service';
import { PromQLSearchService } from '../../query_services/promql_search_service';
import {
  baseMetricName,
  getInfraMetricPresenceQueries,
  getInfraOtherMetricSources,
  getK8sPodTableQueries,
  getQueryHostRanking,
  getQueryInfraLabelStyleProbe,
  getQueryInfraLastSample,
  getQueryK8sServicePods,
  getQueryServiceInfraKeys,
  getQueryServiceMapInfraKeys,
  infraLabel,
  infraProbeStepSeconds,
  podKey,
} from '../../query_services/query_requests/infra_queries';
import {
  APM_PLATFORM_KEY,
  INFRA_CACHE_TTL_MS,
  INFRA_CHART_METRICS,
  INFRA_DATA_END_GRACE_SECONDS,
  INFRA_MAX_HOSTS,
  INFRA_MAX_OTHER_METRICS,
  INFRA_MAX_PODS,
  INFRA_METRIC_NAME_LABEL,
  INFRA_OTHER_METRIC_PREFIXES,
  INFRA_SPAN_KEYS,
  INFRA_TOP_N,
  K8S_SCOPE_KEY,
  SERVICE_MAP_KEY_PREFIX,
  SPAN_DERIVED_ENVIRONMENT,
} from '../../common/infra_constants';
import {
  InfraLabelStyle,
  InfraOtherMetric,
  InfraPlatform,
  InfraPodRow,
  InfraSpanKey,
  InfraWarning,
  K8sPodRef,
  K8sWorkloadKind,
  K8sWorkloadScope,
  ServiceInfrastructure,
} from '../../common/types/infra_types';
import { TimeRange } from '../../common/types/service_types';
import { keyAttributeValues } from '../utils/platform_utils';
import { toPplDataset } from '../utils/dataset_utils';
import { getTimeInSeconds, parseTimeRange } from '../utils/time_utils';

export const EMPTY_INFRASTRUCTURE: ServiceInfrastructure = {
  isLoading: false,
  error: null,
  warnings: [],
  platform: 'none',
  scopes: [],
  namespaceOnly: false,
  hostIds: [],
  totalHosts: 0,
  chartHostIds: [],
  mappedKeys: [],
  keySource: null,
  detectionEnabled: false,
  labelStyle: null,
  pods: [],
  totalPods: 0,
  chartPods: [],
  nodes: [],
  missingMetrics: [],
  otherMetrics: [],
  totalOtherMetrics: 0,
};
const EMPTY = EMPTY_INFRASTRUCTURE;

interface CacheEntry {
  at: number;
  value: ServiceInfrastructure;
}
/** Results per service, data sources and time range; only complete results are kept. */
const cache = new Map<string, CacheEntry>();

/** Clears the result cache (tests). */
export const clearInfraCache = () => cache.clear();

const isFresh = (entry?: CacheEntry): entry is CacheEntry =>
  entry !== undefined && Date.now() - entry.at < INFRA_CACHE_TTL_MS;

const pruneCache = () => {
  cache.forEach((entry, key) => {
    if (!isFresh(entry)) cache.delete(key);
  });
};

/** Rows of an instant-query response (query_enhancements data frame or Prometheus format). */
function instantRows(response: any): Array<Record<string, any>> {
  if (Array.isArray(response?.meta?.instantData?.rows)) return response.meta.instantData.rows;
  if (Array.isArray(response?.data?.result)) {
    return response.data.result.map((s: any) => ({ ...s.metric, Value: s.value?.[1] }));
  }
  return [];
}

const str = (v: unknown): string | undefined =>
  v === null || v === undefined || v === '' ? undefined : String(v);

/** Span-key attribute of each workload kind, in precedence order (a CronJob's pods carry both). */
const WORKLOAD_KEYS: Array<[K8sWorkloadKind, InfraSpanKey]> = [
  ['deployment', 'k8s.deployment.name'],
  ['statefulset', 'k8s.statefulset.name'],
  ['daemonset', 'k8s.daemonset.name'],
  ['cronjob', 'k8s.cronjob.name'],
  ['job', 'k8s.job.name'],
];

/**
 * Splits a joined `apm.k8s.scope` value (`cluster|namespace|kind|name`). Data Prepper escapes a `|`
 * or `\` inside a segment with a backslash (`k8s.cluster.name` is free-form).
 */
export function splitK8sScope(scope: string): string[] {
  const parts: string[] = [];
  let current = '';
  for (let i = 0; i < scope.length; i++) {
    const c = scope[i];
    if (c === '\\' && i + 1 < scope.length) {
      current += scope[++i];
    } else if (c === '|') {
      parts.push(current);
      current = '';
    } else {
      current += c;
    }
  }
  parts.push(current);
  return parts;
}

/** Cap on key rows produced from one stats row (the no-scope approximation). */
const MAX_KEY_ROWS_PER_STATS_ROW = 50;

/**
 * Key rows (in the span-query shape, `resource.attributes.<key>`, one value per key) from the
 * service-map stats rows (`sourceNode.keyAttributes.<key>`).
 *
 * The platform keys are arrays (Data Prepper keeps every value seen, bounded per key), and PPL
 * returns them as JSON arrays (OpenSearch 3.9) or as `[a, b]` strings (3.5): both are read with
 * `keyAttributeValues`, and a row with several values becomes one row per value.
 *
 * **With `apm.k8s.scope` (Data Prepper ≥ PR #7249):** one row per scope, keeping the exact
 * cluster / namespace / workload tuples. Cloud and host keys are added to the base row (not
 * multiplied against each scope).
 *
 * **Without `apm.k8s.scope` (older Data Prepper or non-k8s):** the individual `k8s.*`,
 * `cloud.*` and `host.id` values are independent sets (the same Data Prepper window saw each one,
 * but their combinations are unknowable), so we build one row per distinct cluster × namespace ×
 * workload combination, capped at `MAX_KEY_ROWS_PER_STATS_ROW`. This is an approximation: some
 * combinations may not exist, and some real scopes may be missed. Cloud/host keys are set only
 * when no k8s scope is found.
 *
 * `detectionEnabled` is true when any row carries the platform Data Prepper writes on every node
 * it ran detection for.
 */
export function keyRowsFromServiceMap(rows: Array<Record<string, any>>) {
  let detectionEnabled = false;
  const vals = (row: Record<string, any>, key: string) =>
    keyAttributeValues(row[`${SERVICE_MAP_KEY_PREFIX}${key}`]);
  const keyRows = rows.flatMap((row) => {
    // Data Prepper records the first value of each multi-valued array; only the first platform
    // value is kept here (matches the precedence in getApmPlatform).
    const platform = vals(row, APM_PLATFORM_KEY)[0];
    if (platform) detectionEnabled = true;
    const base: Record<string, string | undefined> = {
      [`resource.attributes.${APM_PLATFORM_KEY}`]: platform,
    };

    const scopes = vals(row, K8S_SCOPE_KEY);
    if (scopes.length > 0) {
      // Joined scope key: exact tuples. Cloud / host values go on the base only; they are not
      // multiplied against each scope (the host's row has no namespace, so toInfraKeys ignores
      // the host field on k8s rows anyway).
      INFRA_SPAN_KEYS.filter((k) => !k.startsWith('k8s.')).forEach((k) => {
        base[`resource.attributes.${k}`] = vals(row, k)[0];
      });
      return scopes.map((scope) => {
        const [cluster, namespace, kind, name] = splitK8sScope(scope);
        const scoped: Record<string, string | undefined> = {
          ...base,
          'resource.attributes.k8s.cluster.name': str(cluster),
          'resource.attributes.k8s.namespace.name': str(namespace),
        };
        WORKLOAD_KEYS.forEach(([k, attr]) => {
          scoped[`resource.attributes.${attr}`] = k === kind ? str(name) : undefined;
        });
        return scoped;
      });
    }

    // No joined scope: build distinct cluster × namespace × workload rows.
    const clusters = vals(row, 'k8s.cluster.name');
    const namespaces = vals(row, 'k8s.namespace.name');
    const workloads = WORKLOAD_KEYS.flatMap(([kind, attr]) =>
      vals(row, attr).map((name) => ({ kind, attr, name }))
    );
    if (namespaces.length > 0) {
      const out: Array<Record<string, string | undefined>> = [];
      for (const namespace of namespaces) {
        for (const cluster of clusters.length ? clusters : [undefined]) {
          for (const w of workloads.length ? workloads : [undefined]) {
            if (out.length >= MAX_KEY_ROWS_PER_STATS_ROW) break;
            const r: Record<string, string | undefined> = {
              ...base,
              'resource.attributes.k8s.namespace.name': namespace,
              'resource.attributes.k8s.cluster.name': cluster,
            };
            WORKLOAD_KEYS.forEach(([k, a]) => {
              r[`resource.attributes.${a}`] = w && k === w.kind ? w.name : undefined;
            });
            out.push(r);
          }
          if (out.length >= MAX_KEY_ROWS_PER_STATS_ROW) break;
        }
        if (out.length >= MAX_KEY_ROWS_PER_STATS_ROW) break;
      }
      return out;
    }

    // Host / non-k8s: one row per host id (or one row if none).
    const hostIds = vals(row, 'host.id');
    const cloudPlats = vals(row, 'cloud.platform');
    if (hostIds.length > 0) {
      return hostIds.map((host) => ({
        ...base,
        'resource.attributes.host.id': host,
        'resource.attributes.cloud.platform': cloudPlats[0],
      }));
    }
    return [{ ...base, 'resource.attributes.cloud.platform': cloudPlats[0] }];
  });
  return { rows: keyRows, detectionEnabled };
}

/**
 * Splits the key rows into Kubernetes scopes and hosts, and picks the platform: Data Prepper's
 * `apm.platform` when present, else `cloud.platform`.
 */
export function toInfraKeys(rows: Array<Record<string, any>>) {
  const attr = (row: Record<string, any>, key: string) => str(row[`resource.attributes.${key}`]);
  const scopes = new Map<string, K8sWorkloadScope>();
  // Namespaces seen without a workload name: the fallback scope when no workload is known.
  const namespaces = new Map<string, K8sWorkloadScope>();
  const hosts = new Set<string>();
  let eks = false;
  let ec2 = false;
  rows.forEach((row) => {
    const detected = attr(row, APM_PLATFORM_KEY);
    const cloud = attr(row, 'cloud.platform');
    if (detected === 'eks' || cloud === 'aws_eks') eks = true;
    if (
      detected === 'ec2' ||
      detected === 'elastic_beanstalk' ||
      cloud === 'aws_ec2' ||
      cloud === 'aws_elastic_beanstalk'
    ) {
      ec2 = true;
    }
    const namespace = attr(row, 'k8s.namespace.name');
    const found = WORKLOAD_KEYS.map(([kind, key]) => [kind, attr(row, key)] as const).find(
      ([, name]) => name
    );
    if (namespace && found) {
      const scope: K8sWorkloadScope = {
        cluster: attr(row, 'k8s.cluster.name'),
        namespace,
        kind: found[0],
        workload: found[1] as string,
      };
      scopes.set(JSON.stringify(scope), scope);
    } else if (namespace) {
      const scope: K8sWorkloadScope = {
        cluster: attr(row, 'k8s.cluster.name'),
        namespace,
        kind: 'namespace',
        workload: '',
      };
      namespaces.set(JSON.stringify(scope), scope);
    } else {
      const host = attr(row, 'host.id');
      if (host) hosts.add(host);
    }
  });
  // Without any workload name, scope by namespace (every pod in it); the tab says so.
  const namespaceOnly = scopes.size === 0 && namespaces.size > 0;
  const scopeList = Array.from((namespaceOnly ? namespaces : scopes).values());
  const platform: InfraPlatform =
    scopeList.length > 0
      ? eks
        ? 'eks'
        : 'kubernetes'
      : hosts.size > 0
        ? ec2
          ? 'ec2'
          : 'host'
        : 'none';
  return { platform, scopes: scopeList, hostIds: Array.from(hosts).sort(), namespaceOnly };
}

/** An error from the traces index that the user should see, rather than "not instrumented". */
const accessError = (error: unknown): Error =>
  error instanceof Error ? error : new Error(String(error));

/**
 * Finds a service's infrastructure: its Kubernetes workload scopes or hosts (from Data Prepper's
 * platform keys on the service map, or the resource attributes on its recent spans), the label
 * style of its infra metrics, and for Kubernetes its pods with their usage, limits, restarts and
 * phase.
 *
 * Failures are reported, not hidden: a missing data source sets `notConfigured`, an unreadable
 * traces index sets `error`, and a part that fails (service map, pod table, metric discovery) adds
 * a warning while the rest still shows. Only complete results are cached.
 */
export function useServiceInfrastructure(
  serviceName: string,
  environment: string,
  timeRange: TimeRange,
  refreshTrigger?: number
): ServiceInfrastructure {
  const { config, loading: configLoading } = useApmConfig();
  const traces = config?.tracesDataset;
  const serviceMap = config?.serviceMapDataset;
  const promId = config?.prometheusDataSource?.name;
  const promMeta = config?.prometheusDataSource?.meta;
  // Data source ids too: under multiple data sources, clusters often share index patterns.
  const cacheKey = JSON.stringify([
    traces?.id,
    traces?.title,
    traces?.datasourceId,
    serviceMap?.id,
    serviceMap?.title,
    serviceMap?.datasourceId,
    promId,
    config?.prometheusDataSource?.id,
    serviceName,
    environment,
    timeRange.from,
    timeRange.to,
  ]);
  // Start from a fresh cached result, so switching back to the tab doesn't reload it.
  const [state, setState] = useState<ServiceInfrastructure>(() => {
    const entry = cache.get(cacheKey);
    return isFresh(entry) ? entry.value : { ...EMPTY, isLoading: true };
  });
  // Refresh (a changed trigger) always refetches, whatever the cache holds.
  const lastTrigger = useRef(refreshTrigger);

  const promql = useMemo(
    () => (promId ? new PromQLSearchService(promId, promMeta) : null),
    [promId, promMeta]
  );

  useEffect(() => {
    const refreshed = lastTrigger.current !== refreshTrigger;
    lastTrigger.current = refreshTrigger;
    if (!serviceName) {
      setState(EMPTY);
      return;
    }
    // The APM settings are still loading: not "not configured" yet.
    if (configLoading) return;
    if (!promql) {
      setState({ ...EMPTY, notConfigured: 'prometheus' });
      return;
    }
    if (!traces) {
      setState({ ...EMPTY, notConfigured: 'traces' });
      return;
    }
    if (refreshed) cache.delete(cacheKey);
    const cached = cache.get(cacheKey);
    if (isFresh(cached)) {
      setState(cached.value);
      return;
    }
    let cancelled = false;
    const abort = new AbortController();
    const signal = abort.signal;
    const warnings = new Set<InfraWarning>();

    const run = async (): Promise<ServiceInfrastructure> => {
      setState((s) => ({ ...s, isLoading: true, error: null }));
      const time = getTimeInSeconds(parseTimeRange(timeRange).endTime);
      // Moved back to the last sample when the data stops before the range ends.
      let at = time;
      const instant = async (query: string) =>
        instantRows(await promql.executeInstantQuery({ query, time: at, signal }));

      const ppl = new PPLSearchService();
      const { startTime, endTime } = parseTimeRange(timeRange);
      const rangeSeconds = (endTime.getTime() - startTime.getTime()) / 1000;

      // 1. Platform keys recorded by Data Prepper on the service-map nodes in the range. A
      //    failure falls back to the spans, with a warning.
      let keyRows: Array<Record<string, any>> = [];
      let keySource: ServiceInfrastructure['keySource'] = null;
      let detectionEnabled = false;
      if (serviceMap?.title) {
        try {
          const mapFields = await getMappedFieldNames(serviceMap.title, serviceMap.datasourceId);
          const has = (k: string) => mapFields.has(`${SERVICE_MAP_KEY_PREFIX}${k}`);
          // With the joined scope key, query it instead of the independent k8s key sets.
          const k8sKeys = has(K8S_SCOPE_KEY)
            ? [K8S_SCOPE_KEY]
            : INFRA_SPAN_KEYS.filter((k) => k.startsWith('k8s.'));
          const mapKeys = [APM_PLATFORM_KEY, 'cloud.platform', ...k8sKeys, 'host.id'].filter((k) =>
            has(k)
          );
          const mapQuery = getQueryServiceMapInfraKeys(
            serviceMap.title,
            serviceName,
            environment,
            mapKeys,
            startTime,
            endTime
          );
          if (mapQuery) {
            const response = await ppl.executeQuery(mapQuery, toPplDataset(serviceMap), signal, {
              strict: true,
            });
            const fromMap = keyRowsFromServiceMap(response?.jsonData ?? []);
            detectionEnabled = fromMap.detectionEnabled;
            if (toInfraKeys(fromMap.rows).platform !== 'none') {
              keyRows = fromMap.rows;
              keySource = 'serviceMap';
            }
          }
        } catch (e) {
          if (signal.aborted) throw e;
          warnings.add('serviceMap');
        }
      }

      // 2. Fallback (Data Prepper without platform detection): the keys on the service's spans in
      //    the range. An unreadable traces index is an error, not "not instrumented".
      let mapped: ReadonlySet<string>;
      try {
        mapped = await getMappedFieldNames(traces.title, traces.datasourceId);
      } catch (e) {
        throw accessError(e);
      }
      const mappedKeys = INFRA_SPAN_KEYS.filter((k) => mapped.has(`resource.attributes.${k}`));
      if (!keySource) {
        const spanQuery = getQueryServiceInfraKeys(
          traces.title,
          serviceName,
          mappedKeys,
          startTime,
          endTime,
          mapped.has(SPAN_DERIVED_ENVIRONMENT) ? environment : undefined
        );
        if (spanQuery) {
          keyRows =
            (await ppl.executeQuery(spanQuery, toPplDataset(traces), signal, { strict: true }))
              ?.jsonData ?? [];
          keySource = 'spans';
        }
      }
      const { platform, scopes, hostIds: allHosts, namespaceOnly } = toInfraKeys(keyRows);
      // A source only counts when it identified the service's infrastructure.
      if (platform === 'none') {
        return { ...EMPTY, warnings: Array.from(warnings), mappedKeys, detectionEnabled };
      }
      const hostIds = allHosts.slice(0, INFRA_MAX_HOSTS);

      // 3. Label style, and when the data ends: the newest sample in the range, per style.
      let labelStyle: InfraLabelStyle | null = null;
      let lastSample = 0;
      for (const style of ['plain', 'resource'] as InfraLabelStyle[]) {
        const rows = await instant(
          getQueryInfraLabelStyleProbe(style, { scopes, hostIds }, rangeSeconds)
        );
        lastSample = Math.max(0, ...rows.map((r) => Number(r.Value) || 0));
        if (lastSample > 0) {
          labelStyle = style;
          break;
        }
      }
      // The probe's points are one subquery step apart, so allow at least one step before calling
      // the data "stopped"; then read instant values as of the last sample, and say so.
      const grace = Math.max(INFRA_DATA_END_GRACE_SECONDS, infraProbeStepSeconds(rangeSeconds));
      const dataEndsAt =
        lastSample > 0 && lastSample < time - grace ? Math.floor(lastSample) : undefined;
      if (dataEndsAt) {
        at = dataEndsAt;
      } else if (labelStyle) {
        // Read instant values as of the newest sample, not the range end: a receiver that reports
        // less often (k8s_cluster) can otherwise fall just outside the lookback.
        const newest = Math.max(
          0,
          ...(await instant(getQueryInfraLastSample(labelStyle, { scopes, hostIds }))).map(
            (r) => Number(r.Value) || 0
          )
        );
        if (newest > 0 && newest < time) at = Math.floor(newest);
      }
      const base: ServiceInfrastructure = {
        ...EMPTY,
        platform,
        scopes,
        namespaceOnly,
        hostIds,
        totalHosts: allHosts.length,
        chartHostIds: hostIds.slice(0, INFRA_TOP_N),
        mappedKeys,
        keySource,
        detectionEnabled,
        labelStyle,
        dataEndsAt,
      };
      if (!labelStyle) return { ...base, warnings: Array.from(warnings) };
      const style = labelStyle;

      // Metric presence (curated charts) and other-metric discovery, for the pods / nodes / hosts.
      const discover = async (pods: K8sPodRef[], nodes: string[]) => {
        const presence = getInfraMetricPresenceQueries({ scopes, pods, nodes, hostIds }, style);
        const names = Object.keys(presence);
        const counts = await Promise.allSettled(names.map((n) => instant(presence[n])));
        if (counts.some((c) => c.status === 'rejected')) warnings.add('presence');
        // A failed probe counts as present: only a definite "no series" hides a chart.
        const missingMetrics = names.filter((_, i) => {
          const c = counts[i];
          return c.status === 'fulfilled' && !c.value.some((r) => Number(r.Value) > 0);
        });
        const sources = getInfraOtherMetricSources({ scopes, pods, nodes, hostIds }, style);
        const found = await Promise.allSettled(sources.map((src) => instant(src.query)));
        if (found.some((f) => f.status === 'rejected')) warnings.add('otherMetrics');
        const other = new Map<string, InfraOtherMetric>();
        found.forEach((result, i) => {
          if (result.status !== 'fulfilled') return;
          result.value.forEach((r) => {
            const name = str(r[INFRA_METRIC_NAME_LABEL] ?? r.__name__);
            // Infrastructure metrics only (an app's own metrics share these labels), and no
            // histogram buckets (averaging across `le` is meaningless).
            if (
              !name ||
              other.has(name) ||
              name.endsWith('_bucket') ||
              INFRA_CHART_METRICS.has(baseMetricName(name)) ||
              !INFRA_OTHER_METRIC_PREFIXES.some((p) => name.startsWith(p))
            ) {
              return;
            }
            other.set(name, { name, matchers: sources[i].matchers, kind: sources[i].kind });
          });
        });
        const all = Array.from(other.values()).sort((a, b) => a.name.localeCompare(b.name));
        return {
          missingMetrics,
          otherMetrics: all.slice(0, INFRA_MAX_OTHER_METRICS),
          totalOtherMetrics: all.length,
        };
      };

      if (scopes.length === 0) {
        // Hosts: chart the busiest ones.
        let chartHostIds = base.chartHostIds;
        if (hostIds.length > INFRA_TOP_N) {
          try {
            const ranked = await instant(getQueryHostRanking(hostIds, style));
            const host = infraLabel('host.id', style);
            const top = ranked.map((r) => str(r[host])).filter((h): h is string => !!h);
            if (top.length > 0) chartHostIds = top;
          } catch (e) {
            if (signal.aborted) throw e;
            warnings.add('hostRanking');
          }
        }
        const found = await discover([], []);
        return { ...base, chartHostIds, ...found, warnings: Array.from(warnings) };
      }

      // 4. Pods: those present at the evaluation time first, then those seen only earlier in the
      //    range (replaced), capped after that ordering.
      const label = (row: Record<string, any>, a: string) => str(row[infraLabel(a, style)]);
      const toRow = (r: Record<string, any>): InfraPodRow => ({
        cluster: label(r, 'k8s.cluster.name'),
        namespace: label(r, 'k8s.namespace.name') as string,
        pod: label(r, 'k8s.pod.name') as string,
        node: label(r, 'k8s.node.name'),
      });
      const [presentRows, rangeRows] = await Promise.all([
        instant(getQueryK8sServicePods(scopes, style)),
        instant(getQueryK8sServicePods(scopes, style, rangeSeconds)),
      ]);
      const byKey = new Map<string, InfraPodRow>();
      presentRows.map(toRow).forEach((p) => byKey.set(podKey(p), p));
      rangeRows.map(toRow).forEach((p) => {
        if (!byKey.has(podKey(p))) byKey.set(podKey(p), { ...p, replaced: true });
      });
      const allPods = Array.from(byKey.values()).filter((p) => p.pod && p.namespace);
      if (allPods.length === 0) {
        return { ...base, ...(await discover([], [])), warnings: Array.from(warnings) };
      }
      const pods = allPods.slice(0, INFRA_MAX_PODS);
      const refs: K8sPodRef[] = pods.map(({ cluster, namespace, pod }) => ({
        cluster,
        namespace,
        pod,
      }));
      const current = pods.filter((p) => !p.replaced);
      const nodes = Array.from(
        new Set((current.length ? current : pods).map((p) => p.node).filter(Boolean))
      ) as string[];

      // 5. Pod table values, keyed by cluster + namespace + pod. One failing column shows "-".
      const queries = getK8sPodTableQueries(refs, style);
      const fields = ['cpu', 'cpuLimit', 'memory', 'memoryLimit', 'restarts', 'phase'] as const;
      const [results, found] = await Promise.all([
        Promise.allSettled(fields.map((f) => instant(queries[f]))),
        discover(refs, nodes),
      ]);
      const rowByKey = new Map(pods.map((p) => [podKey(p), p]));
      results.forEach((result, i) => {
        if (result.status !== 'fulfilled') {
          warnings.add('podTable');
          return;
        }
        result.value.forEach((r) => {
          const row = rowByKey.get(
            podKey({
              cluster: str(r[queries.keyLabels.cluster]),
              namespace: str(r[queries.keyLabels.namespace]),
              pod: str(r[queries.keyLabels.pod]),
            })
          );
          if (row) row[fields[i]] = Number(r.Value);
        });
      });

      // Charts show the busiest present pods (by CPU), a fixed set for the whole range.
      const chartPods = (current.length ? current : pods)
        .slice()
        .sort((a, b) => (b.cpu ?? -1) - (a.cpu ?? -1))
        .slice(0, INFRA_TOP_N)
        .map(({ cluster, namespace, pod }) => ({ cluster, namespace, pod }));

      return {
        ...base,
        pods,
        totalPods: allPods.length,
        chartPods,
        nodes,
        ...found,
        warnings: Array.from(warnings),
      };
    };

    run()
      .then((result) => {
        if (cancelled) return;
        const value = { ...result, isLoading: false };
        pruneCache();
        // Partial results are not cached: the next visit retries what failed.
        if (value.warnings.length === 0) cache.set(cacheKey, { at: Date.now(), value });
        setState(value);
      })
      .catch((error) => {
        if (cancelled || signal.aborted) return;
        setState({ ...EMPTY, error: accessError(error) });
      });
    return () => {
      cancelled = true;
      abort.abort();
    };
    // cacheKey covers the time range, the datasets and the data sources.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [cacheKey, promql, refreshTrigger, configLoading]);

  return state;
}

/*
 * Copyright OpenSearch Contributors
 * SPDX-License-Identifier: Apache-2.0
 */

import { useEffect, useMemo, useState } from 'react';
import { useApmConfig } from '../../config/apm_config_context';
import { getMappedFieldNames } from '../../query_services/field_mapping_service';
import { PPLSearchService } from '../../query_services/ppl_search_service';
import { PromQLSearchService } from '../../query_services/promql_search_service';
import {
  baseMetricName,
  getInfraMetricPresenceQueries,
  getInfraOtherMetricSources,
  INFRA_CHART_METRICS,
  INFRA_METRIC_NAME_LABEL,
  getK8sPodTableQueries,
  getQueryInfraLabelStyleProbe,
  getQueryK8sServicePods,
  getQueryServiceInfraKeys,
  getQueryServiceMapInfraKeys,
  INFRA_SPAN_KEYS,
  APM_PLATFORM_KEY,
  SERVICE_MAP_KEY_PREFIX,
  SPAN_DERIVED_ENVIRONMENT,
  infraLabel,
  InfraLabelStyle,
  InfraMetricSourceKind,
  InfraSpanKey,
  K8sPodRef,
  K8sWorkloadScope,
} from '../../query_services/query_requests/infra_queries';
import { TimeRange } from '../../common/types/service_types';
import { getTimeInSeconds, parseTimeRange } from '../utils/time_utils';

/** Platform of a service, from its span attributes. */
export type InfraPlatform = 'eks' | 'kubernetes' | 'ec2' | 'host' | 'none';

/** One row of the pod table. */
export interface InfraPodRow {
  cluster?: string;
  namespace: string;
  pod: string;
  node?: string;
  cpu?: number;
  cpuLimit?: number;
  memory?: number;
  memoryLimit?: number;
  restarts?: number;
  phase?: number;
  /** Seen during the range but gone at its end (replaced by a rollout, rescheduled, or killed). */
  replaced?: boolean;
}

export interface ServiceInfrastructure {
  isLoading: boolean;
  error: Error | null;
  platform: InfraPlatform;
  /** Kubernetes cluster / namespace / workload combinations seen on the service's spans. */
  scopes: K8sWorkloadScope[];
  /** True when the spans carry no workload name, so the scopes are whole namespaces. */
  namespaceOnly: boolean;
  /** Hosts (`host.id`) seen on the service's spans. */
  hostIds: string[];
  /** Span keys mapped in the traces index; drives the setup diagnostics. */
  mappedKeys: InfraSpanKey[];
  /** Where the keys came from: Data Prepper platform detection (service map) or the spans (fallback). */
  keySource: 'serviceMap' | 'spans' | null;
  /** True when Data Prepper platform detection ran for this service (`apm.platform` present). */
  detectionEnabled: boolean;
  /**
   * When the service's infra data stops before the end of the range: the last sample time
   * (epoch seconds). Instant values (pod table, summary) are then read as of that time.
   */
  dataEndsAt?: number;
  /** Label style of the infra metrics; null when no matching infra metrics were found. */
  labelStyle: InfraLabelStyle | null;
  pods: InfraPodRow[];
  nodes: string[];
  /** Chart metrics with no series for this service (not collected, or not matching its labels). */
  missingMetrics: string[];
  /** Other infra metrics with series for this service (not charted), with the matchers that found them. */
  otherMetrics: Array<{ name: string; matchers: string; kind: InfraMetricSourceKind }>;
}

const EMPTY: ServiceInfrastructure = {
  isLoading: false,
  error: null,
  platform: 'none',
  scopes: [],
  namespaceOnly: false,
  hostIds: [],
  mappedKeys: [],
  keySource: null,
  detectionEnabled: false,
  labelStyle: null,
  pods: [],
  nodes: [],
  missingMetrics: [],
  otherMetrics: [],
};

/** At most this many "Other metrics" are listed. */
export const INFRA_MAX_OTHER_METRICS = 200;

/** Pods shown per service; the charts aggregate over the same set. */
export const INFRA_MAX_PODS = 50;

/** Results are reused for this long per service and time range (RFC budgets); Refresh bypasses it. */
export const INFRA_CACHE_TTL_MS = 5 * 60 * 1000;

interface CacheEntry {
  at: number;
  refreshTrigger?: number;
  value: ServiceInfrastructure;
}
const cache = new Map<string, CacheEntry>();

/** Clears the result cache (tests). */
export const clearInfraCache = () => cache.clear();

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

/**
 * Key rows (in the span-query shape, `resource.attributes.<key>`) from the service-map stats rows
 * (`sourceNode.keyAttributes.<key>`). `detectionEnabled` is true when any row carries the platform
 * Data Prepper writes on every node it ran detection for.
 */
export function keyRowsFromServiceMap(rows: Array<Record<string, any>>) {
  let detectionEnabled = false;
  const keyRows = rows.map((row) => {
    if (str(row[`${SERVICE_MAP_KEY_PREFIX}${APM_PLATFORM_KEY}`])) detectionEnabled = true;
    const out: Record<string, string | undefined> = {};
    INFRA_SPAN_KEYS.forEach((key) => {
      out[`resource.attributes.${key}`] = str(row[`${SERVICE_MAP_KEY_PREFIX}${key}`]);
    });
    return out;
  });
  return { rows: keyRows, detectionEnabled };
}

/** Splits the key rows from the spans into Kubernetes scopes and hosts. */
export function toInfraKeys(rows: Array<Record<string, any>>) {
  const attr = (row: Record<string, any>, key: InfraSpanKey) =>
    str(row[`resource.attributes.${key}`]);
  const scopes = new Map<string, K8sWorkloadScope>();
  // Namespaces seen without a workload name: the fallback scope when no workload is known.
  const namespaces = new Map<string, K8sWorkloadScope>();
  const hosts = new Set<string>();
  let eks = false;
  let ec2 = false;
  rows.forEach((row) => {
    const platform = attr(row, 'cloud.platform');
    if (platform === 'aws_eks') eks = true;
    if (platform === 'aws_ec2') ec2 = true;
    const namespace = attr(row, 'k8s.namespace.name');
    const workload: Array<[K8sWorkloadScope['kind'], string | undefined]> = [
      ['deployment', attr(row, 'k8s.deployment.name')],
      ['statefulset', attr(row, 'k8s.statefulset.name')],
      ['daemonset', attr(row, 'k8s.daemonset.name')],
    ];
    const found = workload.find(([, name]) => name);
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
  return { platform, scopes: scopeList, hostIds: Array.from(hosts), namespaceOnly };
}

/**
 * Finds a service's infrastructure: its Kubernetes workload scopes or hosts (from the
 * resource attributes on its recent spans), the label style of the infra metrics, and for
 * Kubernetes the pods currently matching, with their latest usage, limits, restarts and
 * phase.
 */
export function useServiceInfrastructure(
  serviceName: string,
  environment: string,
  timeRange: TimeRange,
  refreshTrigger?: number
): ServiceInfrastructure {
  const { config } = useApmConfig();
  const traces = config?.tracesDataset;
  const serviceMap = config?.serviceMapDataset;
  const promId = config?.prometheusDataSource?.name;
  const cacheKey = JSON.stringify([
    traces?.title,
    serviceMap?.title,
    promId,
    serviceName,
    environment,
    timeRange.from,
    timeRange.to,
  ]);
  const fresh = (entry?: CacheEntry) =>
    entry !== undefined &&
    entry.refreshTrigger === refreshTrigger &&
    Date.now() - entry.at < INFRA_CACHE_TTL_MS;
  // Start from a fresh cached result, so switching back to the tab doesn't reload it.
  const [state, setState] = useState<ServiceInfrastructure>(() => {
    const entry = cache.get(cacheKey);
    return fresh(entry) ? (entry as CacheEntry).value : { ...EMPTY, isLoading: true };
  });

  const promMeta = config?.prometheusDataSource?.meta;
  const promql = useMemo(
    () => (promId ? new PromQLSearchService(promId, promMeta) : null),
    [promId, promMeta]
  );

  useEffect(() => {
    if (!traces || !promql || !serviceName) {
      setState(EMPTY);
      return;
    }
    const cached = cache.get(cacheKey);
    if (fresh(cached)) {
      setState((cached as CacheEntry).value);
      return;
    }
    let cancelled = false;
    const abort = new AbortController();
    const signal = abort.signal;

    const run = async () => {
      setState((s) => ({ ...s, isLoading: true, error: null }));
      const time = getTimeInSeconds(parseTimeRange(timeRange).endTime);
      // Moved back to the last sample when the data stops before the range ends.
      let at = time;
      const instant = async (query: string) =>
        instantRows(await promql.executeInstantQuery({ query, time: at, signal }));

      const ppl = new PPLSearchService();
      const asDataset = (d: { id: string; title: string; datasourceId?: string }) => ({
        id: d.id,
        title: d.title,
        dataSource: d.datasourceId ? { id: d.datasourceId, type: '' } : undefined,
      });

      const { startTime, endTime } = parseTimeRange(timeRange);

      // Phase 1: platform keys recorded by Data Prepper on the service-map nodes in the range.
      let keyRows: Array<Record<string, any>> = [];
      let keySource: ServiceInfrastructure['keySource'] = null;
      let detectionEnabled = false;
      if (serviceMap?.title) {
        const mapFields = await getMappedFieldNames(
          serviceMap.title,
          serviceMap.datasourceId
        ).catch(() => new Set<string>());
        const mapKeys = [APM_PLATFORM_KEY, ...INFRA_SPAN_KEYS].filter((k) =>
          mapFields.has(`${SERVICE_MAP_KEY_PREFIX}${k}`)
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
          const statsRows =
            (await ppl.executeQuery(mapQuery, asDataset(serviceMap), signal).catch(() => null))
              ?.jsonData ?? [];
          const fromMap = keyRowsFromServiceMap(statsRows);
          detectionEnabled = fromMap.detectionEnabled;
          if (toInfraKeys(fromMap.rows).platform !== 'none') {
            keyRows = fromMap.rows;
            keySource = 'serviceMap';
          }
        }
      }

      // Fallback (Data Prepper without platform detection): the keys on the service's spans in the range.
      const mapped = await getMappedFieldNames(traces.title, traces.datasourceId);
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
          keyRows = (await ppl.executeQuery(spanQuery, asDataset(traces), signal))?.jsonData ?? [];
          keySource = 'spans';
        }
      }
      const { platform, scopes, hostIds, namespaceOnly } = toInfraKeys(keyRows);
      // A source only counts when it identified the service's infrastructure.
      if (platform === 'none') return { ...EMPTY, mappedKeys, detectionEnabled, keySource: null };

      const rangeSeconds = (endTime.getTime() - startTime.getTime()) / 1000;
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
      // Data that stops more than a scrape interval or two before the range end: read the
      // instant values as of the last sample, and say so.
      const dataEndsAt =
        lastSample > 0 && lastSample < time - 300 ? Math.floor(lastSample) : undefined;
      if (dataEndsAt) at = dataEndsAt;
      const base = {
        ...EMPTY,
        platform,
        scopes,
        namespaceOnly,
        hostIds,
        mappedKeys,
        keySource,
        detectionEnabled,
        labelStyle,
        dataEndsAt,
      };
      if (!labelStyle) return base;

      // Filled in once the pods are known; presence() reads them when it runs.
      let refs: K8sPodRef[] = [];
      let nodes: string[] = [];
      const presence = async () => {
        const queries = getInfraMetricPresenceQueries(
          { scopes, pods: refs, nodes, hostIds },
          labelStyle as InfraLabelStyle
        );
        const names = Object.keys(queries);
        const counts = await Promise.all(names.map((n) => instant(queries[n]).catch(() => null)));
        // A failed probe counts as present: only a definite "no series" hides a chart.
        const missingMetrics = names.filter(
          (_, i) => counts[i] !== null && !counts[i]?.some((r) => Number(r.Value) > 0)
        );
        // Every other metric name with series in the same scopes.
        const sources = getInfraOtherMetricSources(
          { scopes, pods: refs, nodes, hostIds },
          labelStyle as InfraLabelStyle
        );
        const found = await Promise.all(sources.map((src) => instant(src.query).catch(() => [])));
        const other = new Map<string, { matchers: string; kind: InfraMetricSourceKind }>();
        found.forEach((rows, i) =>
          rows.forEach((r) => {
            const name = str(r[INFRA_METRIC_NAME_LABEL] ?? r.__name__);
            if (name && !INFRA_CHART_METRICS.has(baseMetricName(name)) && !other.has(name)) {
              other.set(name, { matchers: sources[i].matchers, kind: sources[i].kind });
            }
          })
        );
        const otherMetrics = Array.from(other.entries())
          .map(([name, source]) => ({ name, ...source }))
          .sort((a, b) => a.name.localeCompare(b.name))
          .slice(0, INFRA_MAX_OTHER_METRICS);
        return { missingMetrics, otherMetrics };
      };
      if (scopes.length === 0) return { ...base, ...(await presence()) };

      const podRows = await instant(getQueryK8sServicePods(scopes, labelStyle, rangeSeconds));
      const label = (row: Record<string, any>, a: string) => str(row[infraLabel(a, labelStyle!)]);
      const pods: InfraPodRow[] = podRows.slice(0, INFRA_MAX_PODS).map((r) => ({
        cluster: label(r, 'k8s.cluster.name'),
        namespace: label(r, 'k8s.namespace.name') as string,
        pod: label(r, 'k8s.pod.name') as string,
        node: label(r, 'k8s.node.name'),
      }));
      if (pods.length === 0) return { ...base, ...(await presence()) };

      refs = pods.map(({ cluster, namespace, pod }) => ({ cluster, namespace, pod }));
      nodes = Array.from(new Set(pods.map((p) => p.node).filter(Boolean))) as string[];
      const queries = getK8sPodTableQueries(scopes, refs, labelStyle);
      const byPod = new Map(pods.map((p) => [p.pod, p]));
      const fields = ['cpu', 'cpuLimit', 'memory', 'memoryLimit', 'restarts', 'phase'] as const;
      const [results, found] = await Promise.all([
        Promise.all(fields.map((f) => instant(queries[f]))),
        presence(),
      ]);
      results.forEach((rows, i) =>
        rows.forEach((r) => {
          const row = byPod.get(String(r[queries.podLabel]));
          if (row) row[fields[i]] = Number(r.Value);
        })
      );
      // Pods still running at the range end first; pods replaced during the range after them.
      pods.forEach((p) => (p.replaced = p.memory === undefined));
      pods.sort((a, b) => Number(!!a.replaced) - Number(!!b.replaced));
      return { ...base, pods, nodes, ...found };
    };

    run()
      .then((result) => {
        if (cancelled) return;
        const value = { ...result, isLoading: false };
        cache.set(cacheKey, { at: Date.now(), refreshTrigger, value });
        setState(value);
      })
      .catch((error) => {
        if (cancelled || signal.aborted) return;
        setState({ ...EMPTY, error: error instanceof Error ? error : new Error(String(error)) });
      });
    return () => {
      cancelled = true;
      abort.abort();
    };
    // cacheKey covers the time range and the datasets.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [cacheKey, promql, refreshTrigger]);

  return state;
}

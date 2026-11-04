/*
 * Copyright OpenSearch Contributors
 * SPDX-License-Identifier: Apache-2.0
 */

import { escapePPLString, escapePromQLLabel, escapePromQLRegex } from './escape_utils';
import { buildTimeFilterClause } from './ppl_queries';

/**
 * Queries for the service Infrastructure tab (RFC opensearch-project/dashboards-observability#2940).
 *
 * The join between a service and its infrastructure uses OpenTelemetry resource attributes
 * present on both the service's spans and the infra metrics (kubeletstats / k8s_cluster /
 * hostmetrics): namespace + workload for Kubernetes, `host.id` for hosts.
 */

/** Resource attributes read from a service's spans to scope its infrastructure. */
export const INFRA_SPAN_KEYS = [
  'cloud.platform',
  'k8s.cluster.name',
  'k8s.namespace.name',
  'k8s.deployment.name',
  'k8s.statefulset.name',
  'k8s.daemonset.name',
  'host.id',
] as const;

export type InfraSpanKey = (typeof INFRA_SPAN_KEYS)[number];

/** Prefix of a platform key on a service-map node (Data Prepper platform detection). */
export const SERVICE_MAP_KEY_PREFIX = 'sourceNode.keyAttributes.';
/** The environment Data Prepper's otel_traces processor derives on SERVER spans. */
export const SPAN_DERIVED_ENVIRONMENT = 'attributes.derived.environment';
/** Normalized platform written by Data Prepper platform detection on every service node. */
export const APM_PLATFORM_KEY = 'apm.platform';

/**
 * PPL: the distinct combinations of infrastructure keys on the service's spans in the time range.
 * Only keys mapped in the span index are referenced (PPL rejects unmapped paths).
 *
 * @param index - Span index pattern (the APM traces dataset title)
 * @param serviceName - The service
 * @param keys - The mapped subset of INFRA_SPAN_KEYS; null when none are mapped
 * @param startTime - Range start
 * @param endTime - Range end
 * @param environment - The service's environment; only applied when the span index maps
 *   SPAN_DERIVED_ENVIRONMENT
 */
export function getQueryServiceInfraKeys(
  index: string,
  serviceName: string,
  keys: readonly InfraSpanKey[],
  startTime: Date,
  endTime: Date,
  environment?: string
): string | null {
  if (keys.length === 0) return null;
  const by = keys.map((k) => `\`resource.attributes.${k}\``).join(', ');
  // The environment Data Prepper's otel_traces derives on SERVER spans (the service map's value);
  // without it a service's other environments would be included.
  const env = environment
    ? ` and \`${SPAN_DERIVED_ENVIRONMENT}\` = '${escapePPLString(environment)}'`
    : '';
  return (
    `source=${index}${buildTimeFilterClause(startTime, endTime, 'startTime')}` +
    ` | where serviceName = '${escapePPLString(serviceName)}'${env} | stats count() by ${by}`
  );
}

/**
 * PPL: the distinct combinations of platform keys recorded by Data Prepper platform detection on
 * the service's service-map nodes in the time range (the union over every document, including a
 * workload the service moved off during the range).
 *
 * @param index - Service-map index pattern
 * @param serviceName - The service
 * @param environment - The service's environment
 * @param keys - Mapped key names (without the `sourceNode.keyAttributes.` prefix), including
 *   APM_PLATFORM_KEY; null when platform detection has written none
 * @param startTime - Range start
 * @param endTime - Range end
 */
export function getQueryServiceMapInfraKeys(
  index: string,
  serviceName: string,
  environment: string,
  keys: readonly string[],
  startTime: Date,
  endTime: Date
): string | null {
  if (!keys.includes(APM_PLATFORM_KEY)) return null;
  const by = keys.map((k) => `\`${SERVICE_MAP_KEY_PREFIX}${k}\``).join(', ');
  return (
    `source=${index}${buildTimeFilterClause(startTime, endTime)}` +
    ` | where sourceNode.keyAttributes.name = '${escapePPLString(serviceName)}'` +
    ` and sourceNode.keyAttributes.environment = '${escapePPLString(environment)}'` +
    ` | stats count() by ${by}`
  );
}

/**
 * How resource attributes appear as Prometheus labels, depending on the ingestion path:
 * `plain` (collector remote write with resource_to_telemetry_conversion, or promoted
 * attributes: `k8s_namespace_name`) or `resource` (Data Prepper prometheus sink:
 * `resource_k8s_namespace_name`).
 */
export type InfraLabelStyle = 'plain' | 'resource';

/** The Prometheus label for a resource attribute in a label style. */
export function infraLabel(attribute: string, style: InfraLabelStyle): string {
  const name = attribute.replace(/[^a-zA-Z0-9_]/g, '_');
  return style === 'resource' ? `resource_${name}` : name;
}

/**
 * Instant query that has a result only if **this service's** infra metrics use the label style:
 * the timestamp (seconds) of their newest sample in the range.
 * Scoped to the service's workloads / hosts, because one Prometheus can hold both styles (e.g.
 * infra metrics from collector remote write next to metrics from the Data Prepper sink).
 */
export function getQueryInfraLabelStyleProbe(
  style: InfraLabelStyle,
  scope: { scopes: K8sWorkloadScope[]; hostIds: string[] },
  rangeSeconds: number
): string {
  // The newest sample's timestamp anywhere in the range (not only at its end), so a gap at the
  // end of the range (a stopped collector, a sleeping laptop) neither hides the service's
  // infrastructure nor goes unnoticed. The subquery step keeps it to ~500 points per series.
  const range = Math.max(60, Math.round(rangeSeconds));
  const step = Math.max(60, Math.round(range / 500));
  const lastSeen = (selector: string) =>
    `max(max_over_time(timestamp(${selector})[${range}s:${step}s]))`;
  if (scope.scopes.length > 0) {
    return lastSeen(selectAll('k8s_pod_memory_working_set_bytes', scope.scopes, style));
  }
  const host = infraLabel('host.id', style);
  return lastSeen(
    `system_cpu_time_seconds_total{${host}=~"${scope.hostIds.map(escapePromQLRegex).join('|')}"}`
  );
}

/** Kubernetes scope of a service: one cluster / namespace / workload combination. */
export interface K8sWorkloadScope {
  cluster?: string;
  namespace: string;
  /**
   * The workload kind; `namespace` is the fallback when the spans carry no workload name, and
   * then scopes to every pod in the namespace.
   */
  kind: 'deployment' | 'statefulset' | 'daemonset' | 'namespace';
  workload: string;
}

const WORKLOAD_ATTRIBUTE: Record<Exclude<K8sWorkloadScope['kind'], 'namespace'>, string> = {
  deployment: 'k8s.deployment.name',
  statefulset: 'k8s.statefulset.name',
  daemonset: 'k8s.daemonset.name',
};

/**
 * PromQL label matchers selecting a service's pods across its workload scopes. Several
 * scopes (e.g. two clusters, or a canary workload) are combined with regex alternation per
 * label only when they share the other labels; otherwise each scope is its own selector and
 * the caller joins them with `or`.
 */
export function k8sScopeMatchers(scope: K8sWorkloadScope, style: InfraLabelStyle): string {
  const parts = [
    `${infraLabel('k8s.namespace.name', style)}="${escapePromQLLabel(scope.namespace)}"`,
  ];
  if (scope.kind !== 'namespace') {
    parts.push(
      `${infraLabel(WORKLOAD_ATTRIBUTE[scope.kind], style)}="${escapePromQLLabel(scope.workload)}"`
    );
  }
  if (scope.cluster) {
    parts.unshift(`${infraLabel('k8s.cluster.name', style)}="${escapePromQLLabel(scope.cluster)}"`);
  }
  return parts.join(',');
}

/** `metric{matchers}` for every scope, joined with `or` (one selector per scope). */
function selectAll(
  metric: string,
  scopes: K8sWorkloadScope[],
  style: InfraLabelStyle,
  wrap: (selector: string) => string = (x) => x
): string {
  return `(${scopes.map((s) => wrap(selector(metric, k8sScopeMatchers(s, style)))).join(' or ')})`;
}

/** A service's pods, as found on its workload-scoped kubeletstats series. */
export interface K8sPodRef {
  cluster?: string;
  namespace: string;
  pod: string;
}

/**
 * The Data Prepper prometheus sink names dimensionless (unit `1`) gauges with a trailing
 * underscore (`k8s_pod_phase_`); the collector's remote write does not. A metric written as
 * `name_?` matches both.
 */
const DIMENSIONLESS_METRIC = /_\?$/;

/** `metric{matchers}`, or `{__name__=~"metric",matchers}` for a `name_?` metric. */
const selector = (metric: string, matchers: string) =>
  DIMENSIONLESS_METRIC.test(metric)
    ? `{__name__=~"${metric}",${matchers}}`
    : `${metric}{${matchers}}`;

/** Charts show at most this many pods / nodes / hosts: the top ones by value (RFC budgets). */
export const INFRA_TOP_N = 20;

/**
 * `metric{...}` for a set of pods, grouped per cluster / namespace. `k8s_cluster` metrics
 * (limits, restarts, phase) carry no workload label unless that collector also runs
 * k8s_attributes, so they are matched by pod name within the namespace instead.
 */
function selectPods(metric: string, pods: K8sPodRef[], style: InfraLabelStyle): string {
  const groups = new Map<string, K8sPodRef[]>();
  pods.forEach((p) => {
    const key = `${p.cluster ?? ''}\u0000${p.namespace}`;
    groups.set(key, [...(groups.get(key) ?? []), p]);
  });
  const selectors = Array.from(groups.values()).map((group) => {
    const { cluster, namespace } = group[0];
    const parts = [
      `${infraLabel('k8s.namespace.name', style)}="${escapePromQLLabel(namespace)}"`,
      `${infraLabel('k8s.pod.name', style)}=~"${group
        .map((p) => escapePromQLRegex(p.pod))
        .join('|')}"`,
    ];
    if (cluster) {
      parts.unshift(`${infraLabel('k8s.cluster.name', style)}="${escapePromQLLabel(cluster)}"`);
    }
    return selector(metric, parts.join(','));
  });
  return `(${selectors.join(' or ')})`;
}

/**
 * Instant query listing the pods (with their node) of a service's workload scopes. With
 * `rangeSeconds`, it covers every pod seen in the range (run at the range end), so pods
 * replaced during the range, e.g. by a rollout or a crash, are listed too.
 */
export function getQueryK8sServicePods(
  scopes: K8sWorkloadScope[],
  style: InfraLabelStyle,
  rangeSeconds?: number
) {
  const by = ['k8s.cluster.name', 'k8s.namespace.name', 'k8s.pod.name', 'k8s.node.name']
    .map((a) => infraLabel(a, style))
    .join(', ');
  const wrap = rangeSeconds
    ? (sel: string) => `max_over_time(${sel}[${Math.max(60, Math.round(rangeSeconds))}s])`
    : undefined;
  return `max by (${by}) (${selectAll('k8s_pod_memory_working_set_bytes', scopes, style, wrap)})`;
}

/**
 * Kubernetes chart queries. Usage comes from kubeletstats (workload-scoped); limits and
 * restarts from k8s_cluster (pod-scoped). A pod's limit is the sum of its containers'
 * limits; the line shows the largest pod's. Without a CPU limit (common), the request is
 * shown instead so the chart keeps a reference line.
 */
export function getK8sInfraQueries(
  scopes: K8sWorkloadScope[],
  pods: K8sPodRef[],
  style: InfraLabelStyle
) {
  const pod = infraLabel('k8s.pod.name', style);
  const container = infraLabel('k8s.container.name', style);
  // max by pod + container first: two k8s_cluster collectors briefly overlap during a
  // rollout, and summing their duplicate series would double the limit.
  const perPod = (metric: string) =>
    `max(sum by (${pod}) (max by (${pod}, ${container}) ${selectPods(metric, pods, style)}))`;
  const labelled = (expr: string, label: string) =>
    `label_replace(${expr}, "${pod}", "${label}", "", "")`;
  return {
    cpu:
      `topk(${INFRA_TOP_N}, sum by (${pod}) ${selectAll('container_cpu_usage', scopes, style)})` +
      ` or ${labelled(perPod('k8s_container_cpu_limit'), 'limit')}` +
      ` or (${labelled(perPod('k8s_container_cpu_request'), 'request')}` +
      ` unless on() ${perPod('k8s_container_cpu_limit')})`,
    memory:
      `topk(${INFRA_TOP_N}, sum by (${pod}) ${selectAll('container_memory_working_set_bytes', scopes, style)})` +
      ` or ${labelled(perPod('k8s_container_memory_limit_bytes'), 'limit')}`,
    restarts: `topk(${INFRA_TOP_N}, max by (${pod}) ${selectPods('k8s_container_restarts', pods, style)})`,
    network:
      'sum by (direction) ' +
      selectAll('k8s_pod_network_io_bytes_total', scopes, style, (sel) => `rate(${sel}[2m])`),
    podLabel: pod,
  };
}

/** Instant queries for the pod table, one value per pod. */
export function getK8sPodTableQueries(
  scopes: K8sWorkloadScope[],
  pods: K8sPodRef[],
  style: InfraLabelStyle
) {
  const pod = infraLabel('k8s.pod.name', style);
  const container = infraLabel('k8s.container.name', style);
  return {
    cpu: `sum by (${pod}) ${selectAll('container_cpu_usage', scopes, style)}`,
    cpuLimit: `sum by (${pod}) (max by (${pod}, ${container}) ${selectPods('k8s_container_cpu_limit', pods, style)})`,
    memory: `sum by (${pod}) ${selectAll('container_memory_working_set_bytes', scopes, style)}`,
    memoryLimit: `sum by (${pod}) (max by (${pod}, ${container}) ${selectPods('k8s_container_memory_limit_bytes', pods, style)})`,
    restarts: `max by (${pod}) ${selectPods('k8s_container_restarts', pods, style)}`,
    phase: `max by (${pod}) ${selectPods('k8s_pod_phase_?', pods, style)}`,
    podLabel: pod,
  };
}

/** Node chart queries for the nodes a service's pods run on. */
export function getK8sNodeQueries(nodes: string[], style: InfraLabelStyle) {
  const node = infraLabel('k8s.node.name', style);
  const match = `${node}=~"${nodes.map(escapePromQLRegex).join('|')}"`;
  return {
    cpu: `topk(${INFRA_TOP_N}, sum by (${node}) (k8s_node_cpu_usage{${match}}))`,
    memory: `topk(${INFRA_TOP_N}, sum by (${node}) (k8s_node_memory_working_set_bytes{${match}}))`,
    // Ready nodes vs all the service's nodes (k8s_cluster node_conditions_to_report, Ready by
    // default; 1 = Ready). Two series, `nodes="ready"` / `"total"`.
    ready:
      `label_replace(sum(${selector('k8s_node_condition_ready_?', match)}), "nodes", "ready", "", "")` +
      ` or label_replace(count(${selector('k8s_node_condition_ready_?', match)}), "nodes", "total", "", "")`,
    nodeLabel: node,
  };
}

/** Host chart queries for a service's hosts. */
export function getHostInfraQueries(hostIds: string[], style: InfraLabelStyle) {
  const host = infraLabel('host.id', style);
  const m = `${host}=~"${hostIds.map(escapePromQLRegex).join('|')}"`;
  const cpuTotal = `sum by (${host}) (rate(system_cpu_time_seconds_total{${m}}[2m]))`;
  return {
    cpu: `1 - sum by (${host}) (rate(system_cpu_time_seconds_total{${m},state="idle"}[2m])) / ${cpuTotal}`,
    memory: `sum by (${host}) (system_memory_usage_bytes{${m},state="used"}) / sum by (${host}) (system_memory_usage_bytes{${m}})`,
    load: `max by (${host}) (system_cpu_load_average_1m{${m}})`,
    filesystem: `1 - sum by (${host}) (system_filesystem_usage_bytes{${m},state="free"}) / sum by (${host}) (system_filesystem_usage_bytes{${m}})`,
    network: `sum by (direction) (rate(system_network_io_bytes_total{${m},device!="lo"}[2m]))`,
    diskIo: `sum by (direction) (rate(system_disk_io_bytes_total{${m}}[2m]))`,
    networkErrors:
      `label_replace(sum(rate(system_network_errors_total{${m}}[2m])), "kind", "errors", "", "")` +
      ` or label_replace(sum(rate(system_network_dropped_total{${m}}[2m])), "kind", "dropped", "", "")`,
    hostLabel: host,
  };
}

/** Replica metrics of each workload kind (k8s_cluster; they carry the workload name natively). */
const WORKLOAD_REPLICAS: Record<
  Exclude<K8sWorkloadScope['kind'], 'namespace'>,
  { ready: string; desired: string }
> = {
  deployment: { ready: 'k8s_deployment_available', desired: 'k8s_deployment_desired' },
  statefulset: { ready: 'k8s_statefulset_ready_pods', desired: 'k8s_statefulset_desired_pods' },
  daemonset: {
    ready: 'k8s_daemonset_ready_nodes',
    desired: 'k8s_daemonset_desired_scheduled_nodes',
  },
};

/**
 * Ready vs desired replicas of the service's workloads, as two series (`replicas="ready"` /
 * `"desired"`), summed over its workload scopes. Null for namespace-only scopes, which have no
 * workload to count.
 */
export function getK8sWorkloadQueries(scopes: K8sWorkloadScope[], style: InfraLabelStyle) {
  const workloads = scopes.filter(
    (s): s is K8sWorkloadScope & { kind: Exclude<K8sWorkloadScope['kind'], 'namespace'> } =>
      s.kind !== 'namespace'
  );
  if (workloads.length === 0) return null;
  const sum = (which: 'ready' | 'desired') =>
    `sum(${workloads
      .map((s) => selector(WORKLOAD_REPLICAS[s.kind][which], k8sScopeMatchers(s, style)))
      .join(' or ')})`;
  return {
    replicas:
      `label_replace(${sum('ready')}, "replicas", "ready", "", "")` +
      ` or label_replace(${sum('desired')}, "replicas", "desired", "", "")`,
    metric: WORKLOAD_REPLICAS[workloads[0].kind].ready,
  };
}

/**
 * One instant `count()` per chart metric, scoped to the service, so the tab can tell a
 * metric that isn't collected from one that is simply flat. Keyed by metric name.
 */
export function getInfraMetricPresenceQueries(
  scope: { scopes: K8sWorkloadScope[]; pods: K8sPodRef[]; nodes: string[]; hostIds: string[] },
  style: InfraLabelStyle
): Record<string, string> {
  const out: Record<string, string> = {};
  if (scope.scopes.length > 0) {
    [
      'container_cpu_usage',
      'container_memory_working_set_bytes',
      'k8s_pod_network_io_bytes_total',
    ].forEach((m) => (out[m] = `count(${selectAll(m, scope.scopes, style)})`));
    const workload = getK8sWorkloadQueries(scope.scopes, style);
    if (workload) {
      const w = scope.scopes.find((s) => s.kind !== 'namespace') as K8sWorkloadScope;
      out[workload.metric] = `count(${selector(workload.metric, k8sScopeMatchers(w, style))})`;
    }
    const hpa = getK8sHpaQueries(scope.scopes, style);
    if (hpa) out.k8s_hpa_current_replicas = hpa.presence;
  }
  if (scope.pods.length > 0) {
    out.k8s_container_restarts = `count(${selectPods('k8s_container_restarts', scope.pods, style)})`;
  }
  if (scope.nodes.length > 0) {
    const match = `${infraLabel('k8s.node.name', style)}=~"${scope.nodes
      .map(escapePromQLRegex)
      .join('|')}"`;
    ['k8s_node_cpu_usage', 'k8s_node_memory_working_set_bytes'].forEach(
      (m) => (out[m] = `count(${m}{${match}})`)
    );
    out.k8s_node_condition_ready = `count(${selector('k8s_node_condition_ready_?', match)})`;
  }
  if (scope.hostIds.length > 0) {
    const m = `${infraLabel('host.id', style)}=~"${scope.hostIds.map(escapePromQLRegex).join('|')}"`;
    [
      'system_cpu_time_seconds_total',
      'system_memory_usage_bytes',
      'system_cpu_load_average_1m',
      'system_filesystem_usage_bytes',
      'system_network_io_bytes_total',
      'system_disk_io_bytes_total',
      'system_network_errors_total',
    ].forEach((metric) => (out[metric] = `count(${metric}{${m}})`));
  }
  return out;
}

/**
 * HPA current vs max replicas for the service's Deployments / StatefulSets. k8s_cluster names an
 * HPA's series by the HPA (`k8s.hpa.name`), not its target, so the HPA is matched by the
 * workload's name, or by `k8s.hpa.scaletargetref.name` where that optional attribute is on.
 */
export function getK8sHpaQueries(scopes: K8sWorkloadScope[], style: InfraLabelStyle) {
  const targets = scopes.filter((s) => s.kind === 'deployment' || s.kind === 'statefulset');
  if (targets.length === 0) return null;
  const selectHpa = (metric: string) =>
    targets
      .flatMap((s) => {
        const base = [
          `${infraLabel('k8s.namespace.name', style)}="${escapePromQLLabel(s.namespace)}"`,
        ];
        if (s.cluster) {
          base.unshift(
            `${infraLabel('k8s.cluster.name', style)}="${escapePromQLLabel(s.cluster)}"`
          );
        }
        const name = escapePromQLLabel(s.workload);
        return [
          `${metric}{${[...base, `${infraLabel('k8s.hpa.name', style)}="${name}"`].join(',')}}`,
          `${metric}{${[...base, `${infraLabel('k8s.hpa.scaletargetref.name', style)}="${name}"`].join(',')}}`,
        ];
      })
      .join(' or ');
  return {
    replicas:
      `label_replace(sum(${selectHpa('k8s_hpa_current_replicas')}), "replicas", "current", "", "")` +
      ` or label_replace(sum(${selectHpa('k8s_hpa_max_replicas')}), "replicas", "max", "", "")`,
    presence: `count(${selectHpa('k8s_hpa_current_replicas')})`,
  };
}

/**
 * Metrics the tab already charts or reads (names without the sink's trailing underscore). The
 * "Other metrics" list leaves them out.
 */
export const INFRA_CHART_METRICS = new Set([
  'container_cpu_usage',
  'container_memory_working_set_bytes',
  'k8s_container_restarts',
  'k8s_container_cpu_limit',
  'k8s_container_cpu_request',
  'k8s_container_memory_limit_bytes',
  'k8s_pod_phase',
  'k8s_pod_memory_working_set_bytes',
  'k8s_pod_network_io_bytes_total',
  'k8s_node_cpu_usage',
  'k8s_node_memory_working_set_bytes',
  'k8s_node_condition_ready',
  'k8s_deployment_available',
  'k8s_deployment_desired',
  'k8s_statefulset_ready_pods',
  'k8s_statefulset_desired_pods',
  'k8s_daemonset_ready_nodes',
  'k8s_daemonset_desired_scheduled_nodes',
  'k8s_hpa_current_replicas',
  'k8s_hpa_max_replicas',
  'system_cpu_time_seconds_total',
  'system_memory_usage_bytes',
  'system_cpu_load_average_1m',
  'system_filesystem_usage_bytes',
  'system_network_io_bytes_total',
  'system_disk_io_bytes_total',
  'system_network_errors_total',
  'system_network_dropped_total',
  'target_info',
]);

/** A metric name without the Data Prepper sink's trailing underscore. */
export const baseMetricName = (name: string) => name.replace(/_$/, '');

/** Label the "Other metrics" discovery copies each series' metric name into. */
export const INFRA_METRIC_NAME_LABEL = 'metric_name';

/** Which entity a source's series describe; the generic chart breaks a metric down by it. */
export type InfraMetricSourceKind = 'pod' | 'node' | 'host';

/** One way of finding the service's series: the label matchers, and a `count by` over them. */
export interface InfraMetricSource {
  kind: InfraMetricSourceKind;
  matchers: string;
  query: string;
}

/**
 * Where to look for the service's other infra metrics: its workloads (kubeletstats, and
 * k8s_cluster where that collector runs k8s_attributes), its pods (k8s_cluster), its nodes
 * (`k8s_node_*` only, since every pod on a node carries the node's name) and its hosts.
 */
export function getInfraOtherMetricSources(
  scope: { scopes: K8sWorkloadScope[]; pods: K8sPodRef[]; nodes: string[]; hostIds: string[] },
  style: InfraLabelStyle
): InfraMetricSource[] {
  const sources: Array<{ kind: InfraMetricSourceKind; matchers: string }> = scope.scopes.map(
    (s) => ({ kind: 'pod' as const, matchers: k8sScopeMatchers(s, style) })
  );
  if (scope.pods.length > 0) {
    // selectPods('') gives `({...} or {...})`; keep each pod selector's matchers.
    const pods = selectPods('', scope.pods, style);
    pods
      .slice(1, -1)
      .split(' or ')
      .forEach((sel) => sources.push({ kind: 'pod', matchers: sel.slice(1, -1) }));
  }
  if (scope.nodes.length > 0) {
    sources.push({
      kind: 'node',
      matchers: `__name__=~"k8s_node_.*",${infraLabel('k8s.node.name', style)}=~"${scope.nodes
        .map(escapePromQLRegex)
        .join('|')}"`,
    });
  }
  if (scope.hostIds.length > 0) {
    sources.push({
      kind: 'host',
      matchers: `${infraLabel('host.id', style)}=~"${scope.hostIds
        .map(escapePromQLRegex)
        .join('|')}"`,
    });
  }
  // The name is copied to an ordinary label: some query paths drop `__name__` from results.
  return sources.map(({ kind, matchers }) => ({
    kind,
    matchers,
    query: `count by (${INFRA_METRIC_NAME_LABEL}) (label_replace({${matchers}}, "${INFRA_METRIC_NAME_LABEL}", "$1", "__name__", "(.+)"))`,
  }));
}

/** PromQL that opens one of the "Other metrics" on the Metrics page, scoped like its source. */
export function getInfraMetricQuery(metric: string, matchers: string): string {
  return `${metric}{${matchers.replace(/^__name__=~"[^"]*",/, '')}}`;
}

/** Counters, by the name suffix the Explore metrics page uses (`inferMetricType`). */
export const isCounterMetric = (metric: string) => /_total$|_count$|_sum$|_created$/.test(metric);

/**
 * Default chart query for a metric the tab has no curated chart for, after the Explore metrics
 * page's query generator (`sum(rate())` for counters, `avg()` otherwise), broken down by the
 * pod, node or host it describes and limited to the top series.
 */
export function getInfraGenericQuery(
  metric: string,
  matchers: string,
  kind: InfraMetricSourceKind,
  style: InfraLabelStyle
): { query: string; labelField: string } {
  const by = infraLabel(
    kind === 'host' ? 'host.id' : kind === 'node' ? 'k8s.node.name' : 'k8s.pod.name',
    style
  );
  const series = getInfraMetricQuery(metric, matchers);
  const query = isCounterMetric(metric)
    ? `topk(${INFRA_TOP_N}, sum by (${by}) (rate(${series}[2m])))`
    : `topk(${INFRA_TOP_N}, avg by (${by}) (${series}))`;
  return { query, labelField: by };
}

/*
 * Copyright OpenSearch Contributors
 * SPDX-License-Identifier: Apache-2.0
 */

import { escapePPLString, escapePromQLLabel, escapePromQLRegex } from './escape_utils';
import { buildTimeFilterClause } from './ppl_queries';
import {
  APM_PLATFORM_KEY,
  INFRA_METRIC_NAME_LABEL,
  INFRA_TOP_N,
  SERVICE_MAP_KEY_PREFIX,
  SPAN_DERIVED_ENVIRONMENT,
} from '../../common/infra_constants';
import {
  InfraLabelStyle,
  InfraMetricSource,
  InfraMetricSourceKind,
  InfraSpanKey,
  K8sPodRef,
  K8sWorkloadKind,
  K8sWorkloadScope,
} from '../../common/types/infra_types';

/**
 * Queries for the service Infrastructure tab (RFC opensearch-project/dashboards-observability#2940).
 *
 * The join between a service and its infrastructure uses OpenTelemetry resource attributes
 * present on both the service's spans and the infra metrics (kubeletstats / k8s_cluster /
 * hostmetrics): namespace + workload for Kubernetes, `host.id` for hosts.
 */

/**
 * PPL: the distinct combinations of infrastructure keys on the service's spans in the time range.
 * Only keys mapped in the span index are referenced (PPL rejects unmapped paths).
 *
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
 * @param keys - Mapped key names (without the `sourceNode.keyAttributes.` prefix), including
 *   APM_PLATFORM_KEY; null when platform detection has written none
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

/** The Prometheus label for a resource attribute in a label style. */
export function infraLabel(attribute: string, style: InfraLabelStyle): string {
  const name = attribute.replace(/[^a-zA-Z0-9_]/g, '_');
  return style === 'resource' ? `resource_${name}` : name;
}

/** Subquery step of the label-style probe for a range: about 500 points per series, at least 60s. */
export function infraProbeStepSeconds(rangeSeconds: number): number {
  return Math.max(60, Math.round(Math.max(60, Math.round(rangeSeconds)) / 500));
}

/**
 * Instant query that has a result only if **this service's** infra metrics use the label style:
 * the timestamp (seconds) of their newest sample in the range. Scoped to the service's workloads /
 * hosts, because one Prometheus can hold both styles.
 */
export function getQueryInfraLabelStyleProbe(
  style: InfraLabelStyle,
  scope: { scopes: K8sWorkloadScope[]; hostIds: string[] },
  rangeSeconds: number
): string {
  // The newest sample anywhere in the range (not only at its end), so a gap at the end of the
  // range (a stopped collector, a sleeping laptop) neither hides the service's infrastructure nor
  // goes unnoticed.
  const range = Math.max(60, Math.round(rangeSeconds));
  const step = infraProbeStepSeconds(rangeSeconds);
  const lastSeen = (sel: string) => `max(max_over_time(timestamp(${sel})[${range}s:${step}s]))`;
  if (scope.scopes.length > 0) {
    return lastSeen(selectAll('k8s_pod_memory_working_set_bytes', scope.scopes, style));
  }
  return lastSeen(`system_cpu_time_seconds_total{${hostMatcher(scope.hostIds, style)}}`);
}

/**
 * Instant query (at the range end) for the timestamp of this service's newest infra sample within
 * the lookback. Instant values are read as of it: collectors report on different intervals, so at
 * the range end one receiver's last sample can be inside the lookback and another's just outside.
 */
export function getQueryInfraLastSample(
  style: InfraLabelStyle,
  scope: { scopes: K8sWorkloadScope[]; hostIds: string[] }
): string {
  const sel =
    scope.scopes.length > 0
      ? selectAll('k8s_pod_memory_working_set_bytes', scope.scopes, style)
      : `system_cpu_time_seconds_total{${hostMatcher(scope.hostIds, style)}}`;
  return `max(timestamp(${sel}))`;
}

const WORKLOAD_ATTRIBUTE: Record<K8sWorkloadKind, string> = {
  deployment: 'k8s.deployment.name',
  statefulset: 'k8s.statefulset.name',
  daemonset: 'k8s.daemonset.name',
  cronjob: 'k8s.cronjob.name',
  job: 'k8s.job.name',
};

/** PromQL label matchers selecting a service's pods in one workload scope. */
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

/** `metric{matchers}` for every scope, joined with `or` (one selector per scope). */
function selectAll(
  metric: string,
  scopes: K8sWorkloadScope[],
  style: InfraLabelStyle,
  wrap: (selector: string) => string = (x) => x
): string {
  return `(${scopes.map((s) => wrap(selector(metric, k8sScopeMatchers(s, style)))).join(' or ')})`;
}

/**
 * `metric{...}` for a set of pods, one selector per cluster / namespace. Pods are matched by
 * name within their cluster and namespace: `k8s_cluster` metrics (limits, restarts, phase) carry
 * no workload label unless that collector also runs k8s_attributes.
 */
function selectPods(
  metric: string,
  pods: K8sPodRef[],
  style: InfraLabelStyle,
  wrap: (selector: string) => string = (x) => x
): string {
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
    return wrap(selector(metric, parts.join(',')));
  });
  return `(${selectors.join(' or ')})`;
}

const hostMatcher = (hostIds: string[], style: InfraLabelStyle) =>
  `${infraLabel('host.id', style)}=~"${hostIds.map(escapePromQLRegex).join('|')}"`;

/**
 * The labels that identify a pod: cluster, namespace and name. StatefulSet pod names (`db-0`)
 * repeat across clusters and namespaces, so per-pod values are aggregated by all three.
 */
export function infraPodKeyLabels(style: InfraLabelStyle) {
  return {
    cluster: infraLabel('k8s.cluster.name', style),
    namespace: infraLabel('k8s.namespace.name', style),
    pod: infraLabel('k8s.pod.name', style),
  };
}

/** `cluster|namespace|pod`, the key of a pod in the hook and the table. */
export const podKey = (p: { cluster?: string; namespace?: string; pod?: string }) =>
  `${p.cluster ?? ''}|${p.namespace ?? ''}|${p.pod ?? ''}`;

/**
 * Instant query listing the pods (with their node) of a service's workload scopes. Without
 * `rangeSeconds`, the pods present at the evaluation time; with it, every pod seen in the range,
 * so pods replaced during it (a rollout, a crash) are listed too.
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
 * Kubernetes chart queries for the pods the charts show (at most INFRA_TOP_N, picked once from the
 * pod table, so a range query never draws more than that). Usage comes from kubeletstats; limits
 * and restarts from k8s_cluster. A pod's limit is the sum of its containers' limits; the line
 * shows the largest pod's. Without a CPU limit (common), the request is shown instead so the chart
 * keeps a reference line.
 */
export function getK8sInfraQueries(pods: K8sPodRef[], style: InfraLabelStyle) {
  const { cluster, namespace, pod } = infraPodKeyLabels(style);
  const byPod = `${cluster}, ${namespace}, ${pod}`;
  const container = infraLabel('k8s.container.name', style);
  // max by pod + container first: two k8s_cluster collectors briefly overlap during a
  // rollout, and summing their duplicate series would double the limit.
  const perPod = (metric: string) =>
    `max(sum by (${byPod}) (max by (${byPod}, ${container}) ${selectPods(metric, pods, style)}))`;
  const labelled = (expr: string, label: string) =>
    `label_replace(${expr}, "${pod}", "${label}", "", "")`;
  return {
    cpu:
      `sum by (${byPod}) ${selectPods('container_cpu_usage', pods, style)}` +
      ` or ${labelled(perPod('k8s_container_cpu_limit'), 'limit')}` +
      ` or (${labelled(perPod('k8s_container_cpu_request'), 'request')}` +
      ` unless on() ${perPod('k8s_container_cpu_limit')})`,
    memory:
      `sum by (${byPod}) ${selectPods('container_memory_working_set_bytes', pods, style)}` +
      ` or ${labelled(perPod('k8s_container_memory_limit_bytes'), 'limit')}`,
    // Summed over the pod's containers: restarts since each container was created (a total, not
    // restarts within the range).
    restarts: `sum by (${byPod}) ${selectPods('k8s_container_restarts', pods, style)}`,
    network:
      'sum by (direction) ' +
      selectPods('k8s_pod_network_io_bytes_total', pods, style, (sel) => `rate(${sel}[2m])`),
    podLabel: pod,
  };
}

/** Instant queries for the pod table, one value per pod (cluster + namespace + name). */
export function getK8sPodTableQueries(pods: K8sPodRef[], style: InfraLabelStyle) {
  const keyLabels = infraPodKeyLabels(style);
  const byPod = `${keyLabels.cluster}, ${keyLabels.namespace}, ${keyLabels.pod}`;
  const container = infraLabel('k8s.container.name', style);
  const perContainer = (metric: string) =>
    `sum by (${byPod}) (max by (${byPod}, ${container}) ${selectPods(metric, pods, style)})`;
  return {
    cpu: `sum by (${byPod}) ${selectPods('container_cpu_usage', pods, style)}`,
    cpuLimit: perContainer('k8s_container_cpu_limit'),
    memory: `sum by (${byPod}) ${selectPods('container_memory_working_set_bytes', pods, style)}`,
    memoryLimit: perContainer('k8s_container_memory_limit_bytes'),
    restarts: perContainer('k8s_container_restarts'),
    phase: `max by (${byPod}) ${selectPods('k8s_pod_phase_?', pods, style)}`,
    keyLabels,
  };
}

/** Node chart queries for the nodes the charted pods run on. */
export function getK8sNodeQueries(nodes: string[], style: InfraLabelStyle) {
  const node = infraLabel('k8s.node.name', style);
  const match = `${node}=~"${nodes.map(escapePromQLRegex).join('|')}"`;
  return {
    cpu: `sum by (${node}) (k8s_node_cpu_usage{${match}})`,
    memory: `sum by (${node}) (k8s_node_memory_working_set_bytes{${match}})`,
    // Ready nodes vs all the service's nodes (k8s_cluster node_conditions_to_report, Ready by
    // default; 1 = Ready). Two series, `nodes="ready"` / `"total"`.
    ready:
      `label_replace(sum(${selector('k8s_node_condition_ready_?', match)}), "nodes", "ready", "", "")` +
      ` or label_replace(count(${selector('k8s_node_condition_ready_?', match)}), "nodes", "total", "", "")`,
    nodeLabel: node,
  };
}

/** CPU utilization per host, as an expression (rates over `window`). */
const hostCpuUtilization = (m: string, host: string, window: string) =>
  `1 - sum by (${host}) (rate(system_cpu_time_seconds_total{${m},state="idle"}[${window}]))` +
  ` / sum by (${host}) (rate(system_cpu_time_seconds_total{${m}}[${window}]))`;

/** Instant query ranking hosts by CPU utilization, to pick the INFRA_TOP_N the charts show. */
export function getQueryHostRanking(hostIds: string[], style: InfraLabelStyle) {
  const host = infraLabel('host.id', style);
  return `topk(${INFRA_TOP_N}, ${hostCpuUtilization(hostMatcher(hostIds, style), host, '5m')})`;
}

/** Host chart queries for the hosts the charts show (at most INFRA_TOP_N). */
export function getHostInfraQueries(hostIds: string[], style: InfraLabelStyle) {
  const host = infraLabel('host.id', style);
  const m = hostMatcher(hostIds, style);
  return {
    cpu: hostCpuUtilization(m, host, '2m'),
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

/** Replica metrics of the workload kinds that have them (k8s_cluster; named by the workload). */
const WORKLOAD_REPLICAS: Partial<Record<K8sWorkloadKind, { ready: string; desired: string }>> = {
  deployment: { ready: 'k8s_deployment_available', desired: 'k8s_deployment_desired' },
  statefulset: { ready: 'k8s_statefulset_ready_pods', desired: 'k8s_statefulset_desired_pods' },
  daemonset: {
    ready: 'k8s_daemonset_ready_nodes',
    desired: 'k8s_daemonset_desired_scheduled_nodes',
  },
};

/**
 * Ready vs desired replicas of the service's workloads, as two series (`replicas="ready"` /
 * `"desired"`), summed over its workload scopes. Null when no scope is a Deployment, StatefulSet
 * or DaemonSet (namespace-only scopes, Jobs and CronJobs have no replica count).
 */
export function getK8sWorkloadQueries(scopes: K8sWorkloadScope[], style: InfraLabelStyle) {
  const workloads = scopes.filter(
    (s) => s.kind !== 'namespace' && WORKLOAD_REPLICAS[s.kind as K8sWorkloadKind]
  );
  if (workloads.length === 0) return null;
  const replicas = (s: K8sWorkloadScope) =>
    WORKLOAD_REPLICAS[s.kind as K8sWorkloadKind] as { ready: string; desired: string };
  const sum = (which: 'ready' | 'desired') =>
    `sum(${workloads
      .map((s) => selector(replicas(s)[which], k8sScopeMatchers(s, style)))
      .join(' or ')})`;
  return {
    replicas:
      `label_replace(${sum('ready')}, "replicas", "ready", "", "")` +
      ` or label_replace(${sum('desired')}, "replicas", "desired", "", "")`,
    metric: replicas(workloads[0]).ready,
    scope: workloads[0],
  };
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
 * One instant `count()` per chart metric, scoped to the service, so the tab can tell a
 * metric that isn't collected from one that is simply flat. Keyed by metric name.
 */
export function getInfraMetricPresenceQueries(
  scope: { scopes: K8sWorkloadScope[]; pods: K8sPodRef[]; nodes: string[]; hostIds: string[] },
  style: InfraLabelStyle
): Record<string, string> {
  const out: Record<string, string> = {};
  if (scope.scopes.length > 0) {
    const workload = getK8sWorkloadQueries(scope.scopes, style);
    if (workload) {
      out[workload.metric] = `count(${selector(
        workload.metric,
        k8sScopeMatchers(workload.scope, style)
      )})`;
    }
    const hpa = getK8sHpaQueries(scope.scopes, style);
    if (hpa) out.k8s_hpa_current_replicas = hpa.presence;
  }
  if (scope.pods.length > 0) {
    [
      'container_cpu_usage',
      'container_memory_working_set_bytes',
      'k8s_pod_network_io_bytes_total',
      'k8s_container_restarts',
    ].forEach((m) => (out[m] = `count(${selectPods(m, scope.pods, style)})`));
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
    const m = hostMatcher(scope.hostIds, style);
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

/** A metric name without the Data Prepper sink's trailing underscore. */
export const baseMetricName = (name: string) => name.replace(/_$/, '');

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
    sources.push({ kind: 'host', matchers: hostMatcher(scope.hostIds, style) });
  }
  // The name is copied to an ordinary label: some query paths drop `__name__` from results.
  return sources.map(({ kind, matchers }) => ({
    kind,
    matchers,
    query: `count by (${INFRA_METRIC_NAME_LABEL}) (label_replace({${matchers}}, "${INFRA_METRIC_NAME_LABEL}", "$1", "__name__", "(.+)"))`,
  }));
}

/** PromQL that opens one of the other metrics on the Metrics page, scoped like its source. */
export function getInfraMetricQuery(metric: string, matchers: string): string {
  return `${metric}{${matchers.replace(/^__name__=~"[^"]*",/, '')}}`;
}

/** Counters, by the name suffix the Explore metrics page uses (`inferMetricType`). */
export const isCounterMetric = (metric: string) => /_total$|_count$|_sum$|_created$/.test(metric);

/**
 * Default chart query for a metric the tab has no curated chart for, after the Explore metrics
 * page's query generator (`sum(rate())` for counters, `avg()` otherwise), broken down by the pod,
 * node or host it describes. Pod and host metrics are limited to the charted pods / hosts, so the
 * series set is fixed for the whole range.
 */
export function getInfraGenericQuery(
  metric: string,
  matchers: string,
  kind: InfraMetricSourceKind,
  style: InfraLabelStyle,
  charted: { pods?: K8sPodRef[]; hostIds?: string[] } = {}
): { query: string; labelField: string } {
  const counter = isCounterMetric(metric);
  const wrap = (sel: string) => (counter ? `rate(${sel}[2m])` : sel);
  const agg = counter ? 'sum' : 'avg';
  if (kind === 'pod' && charted.pods?.length) {
    const { cluster, namespace, pod } = infraPodKeyLabels(style);
    return {
      query: `${agg} by (${cluster}, ${namespace}, ${pod}) ${selectPods(
        metric,
        charted.pods,
        style,
        wrap
      )}`,
      labelField: pod,
    };
  }
  const by = infraLabel(
    kind === 'host' ? 'host.id' : kind === 'node' ? 'k8s.node.name' : 'k8s.pod.name',
    style
  );
  const series =
    kind === 'host' && charted.hostIds?.length
      ? `${metric}{${hostMatcher(charted.hostIds, style)}}`
      : getInfraMetricQuery(metric, matchers);
  return { query: `${agg} by (${by}) (${wrap(series)})`, labelField: by };
}

/*
 * Copyright OpenSearch Contributors
 * SPDX-License-Identifier: Apache-2.0
 */

/**
 * Constants of the service Infrastructure tab (RFC opensearch-project/dashboards-observability#2940).
 */

/** Resource attributes read from a service's spans (or service-map node) to scope its infrastructure. */
export const INFRA_SPAN_KEYS = [
  'cloud.platform',
  'k8s.cluster.name',
  'k8s.namespace.name',
  'k8s.deployment.name',
  'k8s.statefulset.name',
  'k8s.daemonset.name',
  'k8s.cronjob.name',
  'k8s.job.name',
  'host.id',
] as const;

/** Prefix of a platform key on a service-map node (Data Prepper platform detection). */
export const SERVICE_MAP_KEY_PREFIX = 'sourceNode.keyAttributes.';
/** The environment Data Prepper's otel_traces derives on SERVER spans. */
export const SPAN_DERIVED_ENVIRONMENT = 'attributes.derived.environment';
/** Normalized platform written by Data Prepper platform detection on every service node. */
export const APM_PLATFORM_KEY = 'apm.platform';
/**
 * `cluster|namespace|kind|name` tuples written by Data Prepper platform detection. The k8s keys
 * are independent sets, so only this key keeps the real cluster / namespace / workload tuples.
 */
export const K8S_SCOPE_KEY = 'apm.k8s.scope';

/** Charts show at most this many pods / hosts (the top ones by CPU at the range end). */
export const INFRA_TOP_N = 20;
/** Pods listed per service: those present at the range end first, then those replaced in it. */
export const INFRA_MAX_PODS = 50;
/** Hosts listed per service. */
export const INFRA_MAX_HOSTS = 50;
/** At most this many other (not curated) metrics are charted. */
export const INFRA_MAX_OTHER_METRICS = 200;
/** Results are reused for this long per service, data sources and time range; Refresh bypasses it. */
export const INFRA_CACHE_TTL_MS = 5 * 60 * 1000;
/** Cards shown at first and added per "Load more", as on the Explore metrics page. */
export const INFRA_PAGE_SIZE = 20;
/** Data ending this long (or one probe step, if longer) before the range end counts as stopped. */
export const INFRA_DATA_END_GRACE_SECONDS = 300;

/** Label the "other metrics" discovery copies each series' metric name into. */
export const INFRA_METRIC_NAME_LABEL = 'metric_name';
/**
 * Name prefixes of infrastructure metrics (kubeletstats, k8s_cluster, hostmetrics). Other metrics
 * on the same series labels (an app's own RED or runtime metrics) are not listed as infrastructure.
 */
export const INFRA_OTHER_METRIC_PREFIXES = ['container_', 'k8s_', 'system_', 'process_'];

/**
 * Order of the curated charts: the must-haves first (usage vs limit, restarts, network), then the
 * workload and node context. Every other collected metric follows, by name.
 */
export const INFRA_CHART_PRIORITY = [
  'cpu',
  'memory',
  'restarts',
  'network',
  'replicas',
  'hpa',
  'nodeCpu',
  'nodeMemory',
  'nodeReady',
  'hostCpu',
  'hostMemory',
  'hostLoad',
  'hostFs',
  'hostNetwork',
  'hostDisk',
  'hostNetworkErrors',
];

/**
 * Metrics the tab already charts or reads (names without the sink's trailing underscore). The
 * other-metrics list leaves them out.
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

/** Display name of each platform. */
export const INFRA_PLATFORM_LABEL = {
  eks: 'Amazon EKS',
  kubernetes: 'Kubernetes',
  ec2: 'Amazon EC2',
  host: 'Host',
  none: '',
} as const;

/** Logo of each platform's header chip. */
export const INFRA_PLATFORM_ICON = {
  eks: 'logoAWS',
  ec2: 'logoAWS',
  kubernetes: 'logoKubernetes',
  host: 'compute',
  none: 'compute',
} as const;

/** `k8s.pod.phase` values (k8s_cluster). */
export const INFRA_POD_PHASE: Record<number, { label: string; color: string }> = {
  1: { label: 'Pending', color: 'warning' },
  2: { label: 'Running', color: 'success' },
  3: { label: 'Succeeded', color: 'subdued' },
  4: { label: 'Failed', color: 'danger' },
  5: { label: 'Unknown', color: 'subdued' },
};

/** Platform type for each `apm.platform` value Data Prepper platform detection writes. */
export const APM_PLATFORM_TYPE: Record<string, string> = {
  eks: 'AWS::EKS',
  ecs: 'AWS::ECS',
  ec2: 'AWS::EC2',
  lambda: 'AWS::Lambda',
  elastic_beanstalk: 'AWS::ElasticBeanstalk',
  kubernetes: 'Kubernetes',
  host: 'Host',
  generic: 'Generic',
};

/** PromQL label matcher operators offered by the label filter. */
export const INFRA_LABEL_OPERATORS = ['=', '!=', '=~', '!~'] as const;

/**
 * How to collect each curated chart's metric, for the card shown when the service has no series
 * for it. Receivers are named with their current and their older (deprecated) component names.
 */
export const INFRA_METRIC_HINTS: Record<string, { source: string; detail: string }> = {
  container_cpu_usage: { source: 'kubelet_stats (kubeletstats)', detail: 'container.cpu.usage' },
  container_memory_working_set_bytes: {
    source: 'kubelet_stats (kubeletstats)',
    detail: 'container.memory.working_set',
  },
  k8s_pod_network_io_bytes_total: {
    source: 'kubelet_stats (kubeletstats)',
    detail: 'k8s.pod.network.io',
  },
  k8s_container_restarts: { source: 'k8s_cluster', detail: 'k8s.container.restarts' },
  k8s_node_cpu_usage: { source: 'kubelet_stats (kubeletstats)', detail: 'k8s.node.cpu.usage' },
  k8s_node_memory_working_set_bytes: {
    source: 'kubelet_stats (kubeletstats)',
    detail: 'k8s.node.memory.working_set',
  },
  system_cpu_time_seconds_total: { source: 'host_metrics (hostmetrics)', detail: 'scrapers: cpu' },
  system_memory_usage_bytes: { source: 'host_metrics (hostmetrics)', detail: 'scrapers: memory' },
  system_cpu_load_average_1m: { source: 'host_metrics (hostmetrics)', detail: 'scrapers: load' },
  system_filesystem_usage_bytes: {
    source: 'host_metrics (hostmetrics)',
    detail: 'scrapers: filesystem',
  },
  system_network_io_bytes_total: {
    source: 'host_metrics (hostmetrics)',
    detail: 'scrapers: network',
  },
};

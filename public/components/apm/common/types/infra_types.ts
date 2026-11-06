/*
 * Copyright OpenSearch Contributors
 * SPDX-License-Identifier: Apache-2.0
 */

import { INFRA_LABEL_OPERATORS, INFRA_SPAN_KEYS } from '../infra_constants';

/** Types of the service Infrastructure tab (RFC opensearch-project/dashboards-observability#2940). */

export type InfraSpanKey = (typeof INFRA_SPAN_KEYS)[number];

/**
 * How resource attributes appear as Prometheus labels, depending on the ingestion path:
 * `plain` (collector remote write with resource_to_telemetry_conversion, or promoted
 * attributes: `k8s_namespace_name`) or `resource` (Data Prepper prometheus sink:
 * `resource_k8s_namespace_name`).
 */
export type InfraLabelStyle = 'plain' | 'resource';

/** Platform of a service, as shown by the tab. */
export type InfraPlatform = 'eks' | 'kubernetes' | 'ec2' | 'host' | 'none';

/** Kubernetes workload kinds the tab matches pods by. */
export type K8sWorkloadKind = 'deployment' | 'statefulset' | 'daemonset' | 'cronjob' | 'job';

/** Kubernetes scope of a service: one cluster / namespace / workload combination. */
export interface K8sWorkloadScope {
  cluster?: string;
  namespace: string;
  /**
   * The workload kind; `namespace` is the fallback when no workload name is known, and then
   * scopes to every pod in the namespace.
   */
  kind: K8sWorkloadKind | 'namespace';
  workload: string;
}

/** One pod, identified by cluster + namespace + name (StatefulSet pod names repeat across them). */
export interface K8sPodRef {
  cluster?: string;
  namespace: string;
  pod: string;
}

/** Which entity a metric source's series describe; generic charts break a metric down by it. */
export type InfraMetricSourceKind = 'pod' | 'node' | 'host';

/** One way of finding the service's series: the label matchers, and a `count by` over them. */
export interface InfraMetricSource {
  kind: InfraMetricSourceKind;
  matchers: string;
  query: string;
}

/** An infra metric collected for the service that the tab has no curated chart for. */
export interface InfraOtherMetric {
  name: string;
  matchers: string;
  kind: InfraMetricSourceKind;
}

/** One row of the pod table. */
export interface InfraPodRow extends K8sPodRef {
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

/** What is missing from the APM configuration for the tab to query anything. */
export type InfraNotConfigured = 'prometheus' | 'traces';

/** Parts of the data that could not be read; the rest of the tab still shows. */
export type InfraWarning = 'serviceMap' | 'podTable' | 'presence' | 'otherMetrics' | 'hostRanking';

export interface ServiceInfrastructure {
  isLoading: boolean;
  error: Error | null;
  /** Set when the APM settings lack a data source the tab needs. */
  notConfigured?: InfraNotConfigured;
  /** Partial failures; the tab shows a warning and what did load. */
  warnings: InfraWarning[];
  platform: InfraPlatform;
  /** Kubernetes cluster / namespace / workload combinations of the service. */
  scopes: K8sWorkloadScope[];
  /** True when no workload name is known, so the scopes are whole namespaces. */
  namespaceOnly: boolean;
  /** Hosts (`host.id`) of the service, at most INFRA_MAX_HOSTS. */
  hostIds: string[];
  /** All hosts found, before the cap. */
  totalHosts: number;
  /** Hosts the charts show: the top INFRA_TOP_N by CPU. */
  chartHostIds: string[];
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
  /** Pods present at the range end first, then pods replaced during it; at most INFRA_MAX_PODS. */
  pods: InfraPodRow[];
  /** All pods found in the range, before the cap. */
  totalPods: number;
  /** Pods the charts show: the top INFRA_TOP_N present pods by CPU. */
  chartPods: K8sPodRef[];
  nodes: string[];
  /** Chart metrics with no series for this service (not collected, or not matching its labels). */
  missingMetrics: string[];
  /** Other infra metrics with series for this service, at most INFRA_MAX_OTHER_METRICS. */
  otherMetrics: InfraOtherMetric[];
  /** All other infra metrics found, before the cap. */
  totalOtherMetrics: number;
}

export type InfraLabelOperator = (typeof INFRA_LABEL_OPERATORS)[number];

/** A label filter of the toolbar. */
export interface InfraLabelFilter {
  /** Prometheus label name, e.g. `k8s_pod_name` or `resource_k8s_pod_name`. */
  name: string;
  operator: InfraLabelOperator;
  value: string;
}

/** A label the user can filter on, with the values seen for this service. */
export interface InfraFilterableLabel {
  name: string;
  values: string[];
}

export type InfraLayout = 'grid' | 'rows';

export type InfraChartType = 'gauge' | 'counter';

/** One card of the metrics grid. */
export interface InfraChart {
  id: string;
  title: string;
  /** Main metric of the query: shown in the tooltip and matched by the search. */
  metric: string;
  query: string;
  type: InfraChartType;
  format: (v: number) => string;
  labelField: string;
  /** Labels the query's series carry, so a label filter only narrows charts it applies to. */
  filterLabels: string[];
  testSubj: string;
  /**
   * `should`: optional context (replicas, HPA, node readiness, disk, network errors), hidden when
   * the service has no series for it. `other`: a collected metric without a curated chart.
   * Must-have charts (no tier) show how to collect a missing metric.
   */
  tier?: 'should' | 'other';
}

/*
 * Copyright OpenSearch Contributors
 * SPDX-License-Identifier: Apache-2.0
 */

import { i18n } from '@osd/i18n';
import {
  getHostInfraQueries,
  getInfraGenericQuery,
  getK8sHpaQueries,
  getK8sInfraQueries,
  getK8sNodeQueries,
  getK8sWorkloadQueries,
  infraLabel,
  isCounterMetric,
} from '../../query_services/query_requests/infra_queries';
import { INFRA_CHART_PRIORITY } from '../../common/infra_constants';
import { InfraChart, ServiceInfrastructure } from '../../common/types/infra_types';
import {
  formatBytes,
  formatCores,
  formatCount,
  formatLoad,
  formatPerSecond,
  formatRate,
  formatRatio,
  genericFormat,
} from './infra_format';

const t = (id: string, defaultMessage: string) =>
  i18n.translate(`observability.apm.serviceInfrastructure.${id}`, { defaultMessage });

/**
 * The metrics grid of the Infrastructure tab, in order: the curated charts by priority (optional
 * ones the service has no series for left out), then every other infra metric collected for the
 * service, by name, with the Explore metrics page's default query. Pod and host charts are limited
 * to the charted pods / hosts, so each chart draws at most INFRA_TOP_N series over the range.
 */
export function buildInfraCharts(state: ServiceInfrastructure): InfraChart[] {
  const { labelStyle: style, scopes, chartPods, nodes, chartHostIds } = state;
  if (!style) return [];
  const podLabel = infraLabel('k8s.pod.name', style);
  const nodeLabel = infraLabel('k8s.node.name', style);
  const hostLabel = infraLabel('host.id', style);
  const out: InfraChart[] = [];

  if (scopes.length > 0 && chartPods.length > 0) {
    const k8s = getK8sInfraQueries(chartPods, style);
    const pod = [podLabel, nodeLabel];
    out.push(
      {
        id: 'cpu',
        title: t('charts.cpu', 'CPU usage (cores) vs limit'),
        metric: 'container_cpu_usage',
        query: k8s.cpu,
        type: 'gauge',
        format: formatCores,
        labelField: k8s.podLabel,
        filterLabels: pod,
        testSubj: 'infraChartCpu',
      },
      {
        id: 'memory',
        title: t('charts.memory', 'Memory working set vs limit'),
        metric: 'container_memory_working_set_bytes',
        query: k8s.memory,
        type: 'gauge',
        format: formatBytes,
        labelField: k8s.podLabel,
        filterLabels: pod,
        testSubj: 'infraChartMemory',
      },
      {
        id: 'restarts',
        title: t('charts.restarts', 'Container restarts (total)'),
        metric: 'k8s_container_restarts',
        query: k8s.restarts,
        type: 'gauge',
        format: formatCount,
        labelField: k8s.podLabel,
        filterLabels: pod,
        testSubj: 'infraChartRestarts',
      },
      {
        id: 'network',
        title: t('charts.network', 'Pod network'),
        metric: 'k8s_pod_network_io_bytes_total',
        query: k8s.network,
        type: 'counter',
        format: formatRate,
        labelField: 'direction',
        filterLabels: pod,
        testSubj: 'infraChartNetwork',
      }
    );
    const workload = getK8sWorkloadQueries(scopes, style);
    if (workload) {
      out.push({
        id: 'replicas',
        title: t('charts.replicas', 'Replicas ready vs desired'),
        metric: workload.metric,
        query: workload.replicas,
        type: 'gauge',
        format: formatCount,
        labelField: 'replicas',
        filterLabels: [],
        testSubj: 'infraChartReplicas',
        tier: 'should',
      });
    }
    const hpa = getK8sHpaQueries(scopes, style);
    if (hpa) {
      out.push({
        id: 'hpa',
        title: t('charts.hpa', 'Autoscaler replicas vs max'),
        metric: 'k8s_hpa_current_replicas',
        query: hpa.replicas,
        type: 'gauge',
        format: formatCount,
        labelField: 'replicas',
        filterLabels: [],
        testSubj: 'infraChartHpa',
        tier: 'should',
      });
    }
    if (nodes.length > 0) {
      const node = getK8sNodeQueries(nodes, style);
      out.push(
        {
          id: 'nodeCpu',
          title: t('charts.nodeCpu', 'Node CPU usage (cores)'),
          metric: 'k8s_node_cpu_usage',
          query: node.cpu,
          type: 'gauge',
          format: formatCores,
          labelField: node.nodeLabel,
          filterLabels: [nodeLabel],
          testSubj: 'infraChartNodeCpu',
        },
        {
          id: 'nodeMemory',
          title: t('charts.nodeMemory', 'Node memory working set'),
          metric: 'k8s_node_memory_working_set_bytes',
          query: node.memory,
          type: 'gauge',
          format: formatBytes,
          labelField: node.nodeLabel,
          filterLabels: [nodeLabel],
          testSubj: 'infraChartNodeMemory',
        },
        {
          id: 'nodeReady',
          title: t('charts.nodeReady', 'Nodes ready vs total'),
          metric: 'k8s_node_condition_ready',
          query: node.ready,
          type: 'gauge',
          format: formatCount,
          labelField: 'nodes',
          filterLabels: [nodeLabel],
          testSubj: 'infraChartNodeReady',
          tier: 'should',
        }
      );
    }
  }

  if (scopes.length === 0 && chartHostIds.length > 0) {
    const host = getHostInfraQueries(chartHostIds, style);
    const h = [hostLabel];
    out.push(
      {
        id: 'hostCpu',
        title: t('charts.hostCpu', 'CPU utilization'),
        metric: 'system_cpu_time_seconds_total',
        query: host.cpu,
        type: 'gauge',
        format: formatRatio,
        labelField: host.hostLabel,
        filterLabels: h,
        testSubj: 'infraChartHostCpu',
      },
      {
        id: 'hostMemory',
        title: t('charts.hostMemory', 'Memory used'),
        metric: 'system_memory_usage_bytes',
        query: host.memory,
        type: 'gauge',
        format: formatRatio,
        labelField: host.hostLabel,
        filterLabels: h,
        testSubj: 'infraChartHostMemory',
      },
      {
        id: 'hostLoad',
        title: t('charts.hostLoad', 'Load average (1m)'),
        metric: 'system_cpu_load_average_1m',
        query: host.load,
        type: 'gauge',
        format: formatLoad,
        labelField: host.hostLabel,
        filterLabels: h,
        testSubj: 'infraChartHostLoad',
      },
      {
        id: 'hostFs',
        title: t('charts.hostFs', 'Filesystem used'),
        metric: 'system_filesystem_usage_bytes',
        query: host.filesystem,
        type: 'gauge',
        format: formatRatio,
        labelField: host.hostLabel,
        filterLabels: h,
        testSubj: 'infraChartHostFilesystem',
      },
      {
        id: 'hostNetwork',
        title: t('charts.hostNetwork', 'Network'),
        metric: 'system_network_io_bytes_total',
        query: host.network,
        type: 'counter',
        format: formatRate,
        labelField: 'direction',
        filterLabels: h,
        testSubj: 'infraChartHostNetwork',
      },
      {
        id: 'hostDisk',
        title: t('charts.hostDisk', 'Disk I/O'),
        metric: 'system_disk_io_bytes_total',
        query: host.diskIo,
        type: 'counter',
        format: formatRate,
        labelField: 'direction',
        filterLabels: h,
        testSubj: 'infraChartHostDisk',
        tier: 'should',
      },
      {
        id: 'hostNetworkErrors',
        title: t('charts.hostNetworkErrors', 'Network errors and drops'),
        metric: 'system_network_errors_total',
        query: host.networkErrors,
        type: 'counter',
        format: formatPerSecond,
        labelField: 'kind',
        filterLabels: h,
        testSubj: 'infraChartHostNetworkErrors',
        tier: 'should',
      }
    );
  }

  const curated = out
    .filter((c) => !(c.tier === 'should' && state.missingMetrics.includes(c.metric)))
    .sort((a, b) => INFRA_CHART_PRIORITY.indexOf(a.id) - INFRA_CHART_PRIORITY.indexOf(b.id));

  const others: InfraChart[] = state.otherMetrics.map((m) => {
    const counter = isCounterMetric(m.name);
    const { query, labelField } = getInfraGenericQuery(m.name, m.matchers, m.kind, style, {
      pods: chartPods,
      hostIds: chartHostIds,
    });
    return {
      id: `other-${m.name}`,
      title: m.name,
      metric: m.name,
      query,
      type: counter ? 'counter' : 'gauge',
      format: genericFormat(m.name, counter),
      labelField,
      filterLabels:
        m.kind === 'host' ? [hostLabel] : m.kind === 'node' ? [nodeLabel] : [podLabel, nodeLabel],
      testSubj: `infraChartOther-${m.name}`,
      tier: 'other',
    };
  });

  return [...curated, ...others];
}

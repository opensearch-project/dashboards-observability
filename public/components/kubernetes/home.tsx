/*
 * Copyright OpenSearch Contributors
 * SPDX-License-Identifier: Apache-2.0
 */

import React from 'react';
import { GroupDashboards } from './common/gourp_dashboards';
import { Line } from '../visualizations/charts/lines/line';
import { convertDateTime } from '../common/query_utils';
import { Pie } from '../visualizations/charts/pie/pie';

function determineExactSpan(startTime: number, endTime: number): string {
  const durationInSeconds = Math.round(
    (new Date(endTime).getTime() - new Date(startTime).getTime()) / 1000
  ); // Round to nearest second

  // Convert the duration into the appropriate PPL-compatible span format
  if (durationInSeconds < 60) {
    return `${durationInSeconds}s`; // Duration in seconds
  } else if (durationInSeconds < 3600) {
    return `${Math.floor(durationInSeconds / 60)}m`; // Duration in minutes
  } else if (durationInSeconds < 86400) {
    return `${Math.floor(durationInSeconds / 3600)}h`; // Duration in hours
  } else if (durationInSeconds < 604800) {
    return `${Math.floor(durationInSeconds / 86400)}d`; // Duration in days
  } else if (durationInSeconds < 2592000) {
    return `${Math.floor(durationInSeconds / 604800)}w`; // Duration in weeks
  } else if (durationInSeconds < 31536000) {
    return `${Math.floor(durationInSeconds / 2592000)}M`; // Duration in months
  } else {
    return `${Math.floor(durationInSeconds / 31536000)}y`; // Duration in years
  }
}

function getSpanFromTimeRange(startTime, endTime) {
  const durationInSeconds = new Date(endTime).getTime() - new Date(startTime).getTime();

  // Map specific time ranges to spans
  if (durationInSeconds < 3600 * 1000) {
    return '10s'; // Less than 1 hour, use seconds
  } else if (durationInSeconds < 24 * 3600 * 1000) {
    return '15m'; // Less than 1 day, use 15 minutes
  } else if (durationInSeconds < 7 * 24 * 3600 * 1000) {
    return '1h'; // Less than 1 week, use 1 hour
  } else {
    return '1d'; // More than 1 week, use 1 day
  }
}

export const Home = () => {
  const [startTime, setStart] = React.useState<string>('now-15m');
  const [endTime, setEnd] = React.useState<string>('now');

  const start = convertDateTime(startTime, true);
  const end = convertDateTime(endTime, false);
  const exactTimeInterval = determineExactSpan(start, end);
  const timeInterval = getSpanFromTimeRange(start, end);

  return (
    <GroupDashboards
      setStart={setStart}
      setEnd={setEnd}
      start={startTime}
      end={endTime}
      prometheusQueries={[
        {
          cluster: 'eks-cluster-with-vpc',
          name: 'clusterCPUUsage',
          title: 'Cluster Total CPU Usage',
          // query: `source = prometheus_k8s_cluster.\`cluster:node_cpu:sum_rate5m\` | where @timestamp >= '${start}' and @timestamp <= '${end}'`,
          query: `source = prometheus_k8s_cluster.container_cpu_usage_seconds_total | where @timestamp >= '${start}' and @timestamp <= '${end}' | where \`cluster\` = 'eks-cluster-with-vpc' | stats sum(@value) as total_cpu_usage by container, span(@timestamp,${timeInterval})`,
          endpoint: 'prometheus',
          datasource: { name: 'prometheus_k8s', type: 'prometheus' },
          vis: {
            component: Line,
            x: 'timestamp',
            y: 'total_cpu_usage',
            xaxisKey: '@timestamp',
            yaxisKey: 'total_cpu_usage',
            config: {
              type: 'line',
              mode: 'lines',
              line: {
                shape: 'spline', // This makes the line smooth
              },
            },
            xKeys: [`span(@timestamp,${timeInterval})`],
            yKeys: ['total_cpu_usage'],
            gKeys: ['container'],
          },
        },
        {
          cluster: 'eks-cluster-with-vpc',
          name: 'clusterMemoryUsage',
          title: 'Cluster Total Memory Usage',
          // query: `source = prometheus_k8s_cluster.\`cluster:node_cpu:sum_rate5m\` | where @timestamp >= '${start}' and @timestamp <= '${end}'`,
          query: `source = prometheus_k8s_cluster.node_memory_MemTotal_bytes | where cluster = 'eks-cluster-with-vpc' | stats sum(@value) as total_memory_usage by nodename, span(@timestamp, ${timeInterval})`,
          endpoint: 'prometheus',
          datasource: { name: 'prometheus_k8s', type: 'prometheus' },
          vis: {
            component: Line,
            x: 'timestamp',
            y: 'total_memory_usage',
            xaxisKey: '@timestamp',
            yaxisKey: 'total_memory_usage',
            config: {
              type: 'line',
              mode: 'lines',
              line: {
                shape: 'spline', // This makes the line smooth
              },
            },
            xKeys: [`span(@timestamp,${timeInterval})`],
            yKeys: ['total_memory_usage'],
            gKeys: ['nodename'],
          },
        },
        {
          cluster: 'eks-cluster-with-vpc',
          name: 'nodesCount',
          title: 'Nodes',
          query: `source = prometheus_k8s_cluster.\`count:up1\` |  where @timestamp >= '${start}' and @timestamp <= '${end}' and cluster = 'eks-cluster-with-vpc' and @value=1 | stats count() as running_node_count by span(@timestamp, ${exactTimeInterval})`,
          //query: `source = prometheus_k8s_cluster.\`count:up1\` | where \`cluster\` = 'eks-cluster-with-vpc' | dedup k8s_node_name | stats count() as running_node_count by k8s_node_name`,
          endpoint: 'prometheus',
          datasource: { name: 'prometheus_k8s', type: 'prometheus' },
          vis: {
            component: Pie,
            x: 'timestamp',
            y: 'Number of Nodes',
            xaxisKey: '@timestamp',
            yaxisKey: 'total_memory_usage',
            config: {
              type: 'indicator',
              mode: "number"
            },
            layout: {
              width: 250,
              height: 190
            },
            xKeys: [`k8s_node_name`],
            yKeys: ['running_node_count'],
            gKeys: [],
          },
        },
        {
          cluster: 'eks-cluster-with-vpc',
          name: 'namespacesCount',
          title: 'Namespaces',
          query: `source = prometheus_k8s_cluster.\`count:up1\` |  where @timestamp >= '${start}' and @timestamp <= '${end}' and cluster = 'eks-cluster-with-vpc' and @value=1 | stats count() as running_node_count by span(@timestamp, ${exactTimeInterval})`,
          //query: `source = prometheus_k8s_cluster.\`count:up1\` | where \`cluster\` = 'eks-cluster-with-vpc' | dedup k8s_node_name | stats count() as running_node_count by k8s_node_name`,
          endpoint: 'prometheus',
          datasource: { name: 'prometheus_k8s', type: 'prometheus' },
          vis: {
            component: Pie,
            x: 'timestamp',
            y: 'Number of Nodes',
            xaxisKey: '@timestamp',
            yaxisKey: 'total_memory_usage',
            config: {
              type: 'indicator',
              mode: "number"
            },
            layout: {
              width: 250,
              height: 190
            },
            xKeys: [`k8s_node_name`],
            yKeys: ['running_node_count'],
            gKeys: [],
          },
        },
        {
          cluster: 'eks-cluster-with-vpc',
          name: 'runningPodsCount',
          title: 'Running Pods',
          query: `source = prometheus_k8s_cluster.\`count:up1\` |  where @timestamp >= '${start}' and @timestamp <= '${end}' and cluster = 'eks-cluster-with-vpc' and @value=1 | stats count() as running_node_count by span(@timestamp, ${exactTimeInterval})`,
          //query: `source = prometheus_k8s_cluster.\`count:up1\` | where \`cluster\` = 'eks-cluster-with-vpc' | dedup k8s_node_name | stats count() as running_node_count by k8s_node_name`,
          endpoint: 'prometheus',
          datasource: { name: 'prometheus_k8s', type: 'prometheus' },
          vis: {
            component: Pie,
            x: 'timestamp',
            y: 'Number of Nodes',
            xaxisKey: '@timestamp',
            yaxisKey: 'total_memory_usage',
            config: {
              type: 'indicator',
              mode: "number"
            },
            layout: {
              width: 250,
              height: 190
            },
            xKeys: [`k8s_node_name`],
            yKeys: ['running_node_count'],
            gKeys: [],
          },
        },
        {
          cluster: 'eks-cluster-with-vpc',
          name: 'runningPodsCategory',
          title: 'Failed Pods',
          query: `source = prometheus_k8s_cluster.kube_pod_status_phase | where @timestamp >= '${start}' and @timestamp <= '${end}' and cluster = 'eks-cluster-with-vpc' | fields service_name | stats count() as node_count by service_name`,
          //query: `source = prometheus_k8s_cluster.\`count:up1\` | where \`cluster\` = 'eks-cluster-with-vpc' | dedup k8s_node_name | stats count() as running_node_count by k8s_node_name`,
          endpoint: 'prometheus',
          datasource: { name: 'prometheus_k8s', type: 'prometheus' },
          vis: {
            component: Pie,
            x: 'timestamp',
            y: 'Number of Nodes',
            xaxisKey: '@timestamp',
            yaxisKey: 'total_memory_usage',
            config: {
              type: 'pie',
              hole: .4,
              textposition: 'inside',
              showlegend: false
            },
            // layout: {
            //   width: 267,
            //   height: 190
            // },
            xKeys: [`pod`],
            yKeys: ['running_node_count'],
            gKeys: [],
          },
        },
        {
          cluster: 'eks-cluster-with-vpc',
          name: 'cpuCoreCount',
          title: 'Cluster CPU Cores',
          query: `source = prometheus_k8s_cluster.machine_cpu_cores | where @timestamp >= '${start}' and @timestamp <= '${end}' and cluster = 'eks-cluster-with-vpc' | fields @value | stats count() as core_count`,
          endpoint: 'prometheus',
          datasource: { name: 'prometheus_k8s', type: 'prometheus' },
          vis: {
            component: Pie,
            x: 'timestamp',
            y: 'Number of cores',
            xaxisKey: '@timestamp',
            yaxisKey: 'total_memory_usage',
            config: {
              type: 'indicator',
              mode: "number"
            },
            layout: {
              width: 250,
              height: 190
            },
            xKeys: [`k8s_node_name`],
            yKeys: ['core_count'],
            gKeys: [],
          },
        },
        // {
        //   cluster: 'play-db-cluster',
        //   name: 'clusterMemoryUsage',
        //   title: 'Cluster Memory',
        //   query: `source = prometheus_k8s.\`count:up1\` | stats count() as running_node_count by span(@timestamp, ${timeInterval})`,
        //   endpoint: 'prometheus',
        //   datasource: { name: 'prometheus_k8s', type: 'prometheus' },
        //   vis: { component: Line },
        // },
        // {
        //   cluster: 'play-db-cluster',
        //   name: 'nodesCount',
        //   title: 'Nodes',
        //   query:
        //     'source = prometheus_k8s.node_cpu_seconds_total | stats avg(@value) by span(@timestamp, 1m)',
        //   endpoint: 'prometheus',
        //   datasource: { name: 'prometheus_k8s', type: 'prometheus' },
        //   vis: { component: Line },
        // },
        // {
        //   cluster: 'play-db-cluster',
        //   name: 'namespacesCount',
        //   title: 'Namespaces',
        //   query:
        //     'source = prometheus_k8s.node_cpu_seconds_total | stats avg(@value) by span(@timestamp, 1m)',
        //   endpoint: 'prometheus',
        //   datasource: { name: 'prometheus_k8s', type: 'prometheus' },
        //   vis: { component: Pie },
        // },
        // {
        //   cluster: 'play-db-cluster',
        //   name: 'runningPodsCount',
        //   title: 'Running Pods',
        //   query:
        //     'source = prometheus_k8s.node_cpu_seconds_total | stats avg(@value) by span(@timestamp, 1m)',
        //   endpoint: 'prometheus',
        //   datasource: { name: 'prometheus_k8s', type: 'prometheus' },
        //   vis: { component: Line },
        // },
        // {
        //   cluster: 'play-db-cluster',
        //   name: 'runningPodsCategory',
        //   title: 'Running Pods',
        //   query:
        //     'source = prometheus_k8s.node_cpu_seconds_total | stats avg(@value) by span(@timestamp, 1m)',
        //   endpoint: 'prometheus',
        //   datasource: { name: 'prometheus_k8s', type: 'prometheus' },
        //   vis: { component: Line },
        // },
        // {
        //   cluster: 'play-db-cluster',
        //   name: 'totalNetworkTraffic',
        //   title: 'Total Network Traffic',
        //   query:
        //     'source = prometheus_k8s.node_cpu_seconds_total | stats avg(@value) by span(@timestamp, 1m)',
        //   endpoint: 'prometheus',
        //   datasource: { name: 'prometheus_k8s', type: 'prometheus' },
        //   vis: { component: Line },
        // },
        // {
        //   cluster: 'play-db-cluster',
        //   name: 'cpuUsageByNamespace',
        //   title: 'CPU Utilization by Namespace',
        //   query:
        //     'source = prometheus_k8s.node_cpu_seconds_total | stats avg(@value) by span(@timestamp, 1m)',
        //   endpoint: 'prometheus',
        //   datasource: { name: 'prometheus_k8s', type: 'prometheus' },
        //   vis: { component: Line },
        // },
        // {
        //   cluster: 'play-db-cluster',
        //   name: 'memoryUsageByNamespace',
        //   title: 'Memory Utilization by Namespace',
        //   query:
        //     'source = prometheus_k8s.node_cpu_seconds_total | stats avg(@value) by span(@timestamp, 1m)',
        //   endpoint: 'prometheus',
        //   datasource: { name: 'prometheus_k8s', type: 'prometheus' },
        //   vis: { component: Line },
        // },
        // {
        //   cluster: 'play-db-cluster',
        //   name: 'podNetworkUtilization',
        //   title: 'Pod Network Utilization',
        //   query:
        //     'source = prometheus_k8s.node_cpu_seconds_total | stats avg(@value) by span(@timestamp, 1m)',
        //   endpoint: 'prometheus',
        //   datasource: { name: 'prometheus_k8s', type: 'prometheus' },
        //   vis: { component: Line },
        // },
      ]}
    />
  );
};

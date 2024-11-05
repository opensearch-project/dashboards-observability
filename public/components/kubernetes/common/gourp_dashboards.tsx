/*
 * Copyright OpenSearch Contributors
 * SPDX-License-Identifier: Apache-2.0
 */

import React from 'react';
import { EuiPanel, EuiText, EuiFlexItem } from '@elastic/eui';
import { Responsive, WidthProvider } from 'react-grid-layout';
// import MetricCard from '../common/MetricCard';
// import TimeSeriesChart from '../common/TimeSeriesChart';
import 'react-grid-layout/css/styles.css';
import 'react-resizable/css/styles.css';

const ResponsiveGridLayout = WidthProvider(Responsive);

export const GroupDashboards = () => {
  // Define layouts for different breakpoints
  const layouts = {
    lg: [
      { i: 'globalCPUUsage', x: 0, y: 0, w: 2, h: 1 },
      { i: 'globalRAMUsage', x: 2, y: 0, w: 2, h: 1 },
      { i: 'nodes', x: 4, y: 0, w: 1, h: 1 },
      { i: 'namespaces', x: 5, y: 0, w: 1, h: 1 },
      { i: 'runningPods', x: 6, y: 0, w: 1, h: 1 },

      { i: 'clusterCPUUtilization', x: 0, y: 1, w: 3, h: 1 },
      { i: 'clusterMemoryUtilization', x: 3, y: 1, w: 4, h: 1 },

      { i: 'cpuUsage', x: 0, y: 2, w: 3, h: 1 },
      { i: 'ramUsage', x: 3, y: 2, w: 4, h: 1 },

      { i: 'networkTraffic', x: 0, y: 3, w: 4, h: 2 },
      { i: 'diskIO', x: 4, y: 3, w: 3, h: 2 },

      { i: 'cpuUsageByNamespace', x: 0, y: 5, w: 4, h: 2 },
      { i: 'memoryUsageByNamespace', x: 4, y: 5, w: 3, h: 2 },
    ],
    md: [
      { i: 'globalCPUUsage', x: 0, y: 0, w: 2, h: 1 },
      { i: 'globalRAMUsage', x: 2, y: 0, w: 2, h: 1 },
      { i: 'nodes', x: 4, y: 0, w: 1, h: 1 },
      { i: 'namespaces', x: 5, y: 0, w: 1, h: 1 },
      { i: 'runningPods', x: 6, y: 0, w: 1, h: 1 },

      { i: 'clusterCPUUtilization', x: 0, y: 1, w: 3, h: 1 },
      { i: 'clusterMemoryUtilization', x: 3, y: 1, w: 4, h: 1 },

      { i: 'cpuUsage', x: 0, y: 2, w: 3, h: 1 },
      { i: 'ramUsage', x: 3, y: 2, w: 4, h: 1 },

      { i: 'networkTraffic', x: 0, y: 3, w: 4, h: 2 },
      { i: 'diskIO', x: 4, y: 3, w: 3, h: 2 },

      { i: 'cpuUsageByNamespace', x: 0, y: 5, w: 4, h: 2 },
      { i: 'memoryUsageByNamespace', x: 4, y: 5, w: 3, h: 2 },
    ],
    sm: [
      { i: 'globalCPUUsage', x: 0, y: 0, w: 2, h: 1 },
      { i: 'globalRAMUsage', x: 0, y: 1, w: 2, h: 1 },
      { i: 'nodes', x: 0, y: 2, w: 1, h: 1 },
      { i: 'namespaces', x: 1, y: 2, w: 1, h: 1 },
      { i: 'runningPods', x: 0, y: 3, w: 2, h: 1 },

      { i: 'clusterCPUUtilization', x: 0, y: 4, w: 2, h: 1 },
      { i: 'clusterMemoryUtilization', x: 0, y: 5, w: 2, h: 1 },

      { i: 'cpuUsage', x: 0, y: 6, w: 2, h: 1 },
      { i: 'ramUsage', x: 0, y: 7, w: 2, h: 1 },

      { i: 'networkTraffic', x: 0, y: 8, w: 2, h: 2 },
      { i: 'diskIO', x: 0, y: 10, w: 2, h: 2 },

      { i: 'cpuUsageByNamespace', x: 0, y: 12, w: 2, h: 2 },
      { i: 'memoryUsageByNamespace', x: 0, y: 14, w: 2, h: 2 },
    ],
  };

  return (
    <ResponsiveGridLayout
      className="layout"
      layouts={layouts}
      breakpoints={{ lg: 1200, md: 996, sm: 768, xs: 480, xxs: 0 }}
      cols={{ lg: 7, md: 7, sm: 2, xs: 1, xxs: 1 }}
      rowHeight={200} // Increased row height for more vertical space
      isDraggable={true}
      isResizable={true}
      width={window.innerWidth}
    >
      {/* Define each panel as in previous code with adjusted layout keys */}

      <EuiFlexItem key="globalCPUUsage">
        <EuiPanel paddingSize="m">
          <EuiText>
            <h3>Global CPU Usage</h3>
          </EuiText>
        </EuiPanel>
      </EuiFlexItem>

      <EuiFlexItem key="globalRAMUsage">
        <EuiPanel paddingSize="m">
          <EuiText>
            <h3>Global RAM Usage</h3>
          </EuiText>
        </EuiPanel>
      </EuiFlexItem>

      <EuiFlexItem key="nodes">
        <EuiPanel paddingSize="m">
          <EuiText>
            <h3>Nodes</h3>
          </EuiText>
        </EuiPanel>
      </EuiFlexItem>

      <EuiFlexItem key="namespaces">
        <EuiPanel paddingSize="m">
          <EuiText>
            <h3>Namespaces</h3>
          </EuiText>
        </EuiPanel>
      </EuiFlexItem>

      <EuiFlexItem key="runningPods">
        <EuiPanel paddingSize="m">
          <EuiText>
            <h3>Running Pods</h3>
          </EuiText>
        </EuiPanel>
      </EuiFlexItem>

      <EuiFlexItem key="clusterCPUUtilization">
        <EuiPanel paddingSize="m">
          <EuiText>
            <h3>Cluster CPU Utilization</h3>
          </EuiText>
        </EuiPanel>
      </EuiFlexItem>

      <EuiFlexItem key="clusterMemoryUtilization">
        <EuiPanel paddingSize="m">
          <EuiText>
            <h3>Cluster Memory Utilization</h3>
          </EuiText>
        </EuiPanel>
      </EuiFlexItem>

      <EuiFlexItem key="cpuUsage">
        <EuiPanel paddingSize="m">
          <EuiText>
            <h3>CPU Usage</h3>
          </EuiText>
        </EuiPanel>
      </EuiFlexItem>

      <EuiFlexItem key="ramUsage">
        <EuiPanel paddingSize="m">
          <EuiText>
            <h3>RAM Usage</h3>
          </EuiText>
        </EuiPanel>
      </EuiFlexItem>

      <EuiFlexItem key="networkTraffic">
        <EuiPanel paddingSize="m">
          <EuiText>
            <h3>Total Network Traffic</h3>
          </EuiText>
        </EuiPanel>
      </EuiFlexItem>

      <EuiFlexItem key="diskIO">
        <EuiPanel paddingSize="m">
          <EuiText>
            <h3>Disk I/O</h3>
          </EuiText>
        </EuiPanel>
      </EuiFlexItem>

      <EuiFlexItem key="cpuUsageByNamespace">
        <EuiPanel paddingSize="m">
          <EuiText>
            <h3>CPU Utilization by Namespace</h3>
          </EuiText>
        </EuiPanel>
      </EuiFlexItem>

      <EuiFlexItem key="memoryUsageByNamespace">
        <EuiPanel paddingSize="m">
          <EuiText>
            <h3>Memory Utilization by Namespace</h3>
          </EuiText>
        </EuiPanel>
      </EuiFlexItem>
    </ResponsiveGridLayout>
  );
};

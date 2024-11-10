/*
 * Copyright OpenSearch Contributors
 * SPDX-License-Identifier: Apache-2.0
 */

import React from 'react';
import {
  EuiPage,
  EuiPageBody,
  EuiPageHeader,
  EuiPageHeaderSection,
  EuiTitle,
  EuiText,
  EuiLink,
  EuiFlexGroup,
  EuiFlexItem,
  EuiSelect,
  EuiStat,
  EuiPanel,
  EuiSpacer,
  EuiHorizontalRule,
  EuiProgress,
} from '@elastic/eui';
import { Plt } from '../visualizations/plotly/plot'; // Assuming Plt component is in the same directory

export const KubernetesOverview = () => {
  const statsData = [
    { label: 'Clusters', value: 1 },
    { label: 'Nodes', value: 2 },
    { label: 'Namespaces', value: 11 },
    { label: 'Workloads', value: 48 },
    { label: 'Pods', value: 68 },
    { label: 'Containers', value: 96 },
  ];

  const imageData = [
    { name: 'ghcr.io/grafana/quick...', count: 6 },
    { name: 'docker.io/grafana/allo...', count: 4 },
    { name: 'ghcr.io/jimmidyson/co...', count: 4 },
    { name: 'gke.gcr.io/gke-metrics...', count: 4 },
    { name: 'grafana/k6-httpbin:v0...', count: 4 },
    // Additional items...
  ];

  const cpuUsageData = [
    {
      x: ['06:50', '07:00', '07:10', '07:20', '07:30', '07:40'],
      y: [20, 21, 19, 20.5, 21, 21.9],
      name: 'play-db-cluster',
      type: 'scatter',
      mode: 'lines+markers',
      line: { color: '#1f77b4', width: 2 },
      marker: { size: 6 },
    },
  ];

  const memoryUsageData = [
    {
      x: ['06:50', '07:00', '07:10', '07:20', '07:30', '07:40'],
      y: [48, 49, 47, 48.5, 49, 49.1],
      name: 'play-db-cluster',
      type: 'scatter',
      mode: 'lines+markers',
      line: { color: '#9467bd', width: 2 },
      marker: { size: 6 },
    },
  ];

  return (
    <EuiPage paddingSize="l">
      <EuiPageBody>
        <EuiPageHeader>
          <EuiPageHeaderSection>
            <EuiTitle size="l">
              <h1>Kubernetes Overview</h1>
            </EuiTitle>
            <EuiText color="subdued">
              For tips on using this overview, visit the{' '}
              <EuiLink href="#" color="primary">documentation</EuiLink>
            </EuiText>
          </EuiPageHeaderSection>
        </EuiPageHeader>

        <EuiSpacer size="m" />

        {/* Filters */}
        <EuiFlexGroup gutterSize="m">
          <EuiFlexItem grow={false}>
            <EuiSelect
              options={[
                { value: 'cluster', text: 'Cluster' },
                { value: 'all', text: 'All' },
              ]}
              placeholder="Cluster"
            />
          </EuiFlexItem>
          <EuiFlexItem grow={false}>
            <EuiSelect
              options={[
                { value: 'namespace', text: 'Namespace' },
                { value: 'all', text: 'All' },
              ]}
              placeholder="Namespace"
            />
          </EuiFlexItem>
        </EuiFlexGroup>

        <EuiSpacer size="l" />

        {/* Summary Stats */}
        <EuiFlexGroup gutterSize="l">
          {statsData.map((stat, index) => (
            <EuiFlexItem key={index}>
              <EuiPanel
                paddingSize="m"
                style={{
                  textAlign: 'center',
                  borderRadius: '8px',
                }}
              >
                <EuiStat
                  title={stat.value}
                  description={stat.label}
                  titleSize="l"
                  titleColor="primary"
                />
              </EuiPanel>
            </EuiFlexItem>
          ))}
        </EuiFlexGroup>

        <EuiSpacer size="l" />

        {/* CPU and Memory Usage Charts */}
        <EuiFlexGroup gutterSize="l">
          <EuiFlexItem>
            <EuiPanel paddingSize="m" style={{ borderRadius: '8px' }}>
              <EuiTitle size="xs">
                <h2>CPU Usage by Cluster</h2>
              </EuiTitle>
              <EuiSpacer size="s" />
              <Plt data={cpuUsageData} layout={{ yaxis: { title: 'Percentage (%)' }, xaxis: { title: 'Time' } }} height="250px" />
            </EuiPanel>
          </EuiFlexItem>
          <EuiFlexItem>
            <EuiPanel paddingSize="m" style={{ borderRadius: '8px' }}>
              <EuiTitle size="xs">
                <h2>Memory Usage by Cluster</h2>
              </EuiTitle>
              <EuiSpacer size="s" />
              <Plt data={memoryUsageData} layout={{ yaxis: { title: 'Percentage (%)' }, xaxis: { title: 'Time' } }} height="250px" />
            </EuiPanel>
          </EuiFlexItem>
        </EuiFlexGroup>

        <EuiSpacer size="l" />

        {/* Deployed Container Images */}
        <EuiPanel paddingSize="m" style={{ borderRadius: '8px' }}>
          <EuiTitle size="xs">
            <h2>Deployed Container Images</h2>
          </EuiTitle>
          <EuiSpacer size="s" />
          {imageData.map((image, index) => (
            <div key={index} style={{ display: 'flex', alignItems: 'center', marginBottom: '8px' }}>
              <EuiText size="xs" style={{ flex: '1' }}>{image.name}</EuiText>
              <EuiProgress
                value={image.count}
                max={6}
                size="s"
                color="accent"
                style={{ flex: '2', marginRight: '8px' }}
              />
              <EuiText size="xs" style={{ flex: '0.3', textAlign: 'right' }}>{image.count}</EuiText>
            </div>
          ))}
        </EuiPanel>
      </EuiPageBody>
    </EuiPage>
  );
};

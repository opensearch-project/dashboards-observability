/*
 * Copyright OpenSearch Contributors
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState } from 'react';
import {
  EuiPage,
  EuiPageBody,
  EuiPageHeader,
  EuiPageHeaderSection,
  EuiTitle,
  EuiText,
  EuiLink,
  EuiTabs,
  EuiTab,
  EuiSpacer,
  EuiPanel,
  EuiFlexGroup,
  EuiFlexItem,
  EuiButton,
  EuiStat,
} from '@elastic/eui';
import { Plt } from '../../visualizations/plotly/plot';

export const NamespaceDetails = () => {
  const [cpuUsageData] = useState([
    {
      x: ['02:45', '02:50', '02:55', '03:00', '03:05', '03:10', '03:15', '03:20', '03:25', '03:30', '03:35', '03:40'],
      y: [0.04, 0.05, 0.06, 0.07, 0.08, 0.07, 0.09, 0.08, 0.07, 0.06, 0.05, 0.04],
      name: 'Sum of container CPU usage',
      type: 'scatter',
      mode: 'lines',
      line: { color: '#1f77b4', width: 2 },
    },
  ]);

  const [memoryUsageData] = useState([
    {
      x: ['02:45', '02:50', '02:55', '03:00', '03:05', '03:10', '03:15', '03:20', '03:25', '03:30', '03:35', '03:40'],
      y: [700, 750, 800, 850, 900, 850, 820, 780, 800, 850, 880, 860],
      name: 'Sum of container memory usage',
      type: 'scatter',
      mode: 'lines',
      line: { color: '#9467bd', width: 2 },
    },
  ]);

  return (
    <EuiPage paddingSize="l">
      <EuiPageBody>
        {/* Header Section */}
        <EuiPageHeader>
          <EuiPageHeaderSection>
            <EuiTitle size="l">
              <h1>argocd <EuiText color="subdued" component="span">namespace</EuiText></h1>
            </EuiTitle>
            <EuiText color="subdued">
              in cluster <EuiLink href="#" color="primary">do-nyc1-demo-infra</EuiLink>
            </EuiText>
          </EuiPageHeaderSection>
        </EuiPageHeader>

        <EuiSpacer size="m" />

        {/* Tabs */}
        <EuiTabs>
          <EuiTab isSelected>Overview</EuiTab>
          <EuiTab>Network</EuiTab>
          <EuiTab>Energy</EuiTab>
          <EuiTab>Logs & Events</EuiTab>
        </EuiTabs>

        <EuiSpacer size="m" />

        <EuiFlexGroup gutterSize="m">
          <EuiFlexItem grow={false}>
            <EuiButton>Explore pod status</EuiButton>
          </EuiFlexItem>
          <EuiFlexItem grow={false}>
            <EuiButton>Run Sift investigation</EuiButton>
          </EuiFlexItem>
        </EuiFlexGroup>

        <EuiSpacer size="l" />

        {/* Namespace Information */}
        <EuiPanel paddingSize="m">
          <EuiText><strong>Namespace information</strong></EuiText>
          <EuiSpacer size="s" />
          <EuiFlexGroup>
            <EuiFlexItem>
              <EuiText size="s"><strong>cluster:</strong> <EuiLink href="#">do-nyc1-demo-infra</EuiLink></EuiText>
              <EuiText size="s"><strong>workloads:</strong> 7</EuiText>
            </EuiFlexItem>
            <EuiFlexItem>
              <EuiText size="s"><strong>alerts:</strong> 0</EuiText>
              <EuiText size="s"><strong>phase:</strong> Active</EuiText>
            </EuiFlexItem>
          </EuiFlexGroup>
        </EuiPanel>

        <EuiSpacer size="l" />

        {/* Namespace Optimization */}
        <EuiText><strong>Namespace optimization</strong></EuiText>
        <EuiSpacer size="s" />
        <EuiFlexGroup gutterSize="l">
          <EuiFlexItem>
            <EuiPanel paddingSize="m">
              <EuiTitle size="xs">
                <h2>Namespace CPU</h2>
              </EuiTitle>
              <EuiSpacer size="s" />
              <Plt data={cpuUsageData} layout={{ title: '', yaxis: { title: 'Cores' }, xaxis: { title: 'Time' } }} height="250px" />
              <EuiSpacer size="s" />
              <EuiText size="xs">Min: 0.0149 cores | Mean: 0.0557 cores | Max: 0.0917 cores</EuiText>
            </EuiPanel>
          </EuiFlexItem>
          <EuiFlexItem>
            <EuiPanel paddingSize="m">
              <EuiTitle size="xs">
                <h2>Namespace Memory</h2>
              </EuiTitle>
              <EuiSpacer size="s" />
              <Plt data={memoryUsageData} layout={{ title: '', yaxis: { title: 'MiB' }, xaxis: { title: 'Time' } }} height="250px" />
              <EuiSpacer size="s" />
              <EuiText size="xs">Min: 640 MiB | Mean: 883 MiB | Max: 980 MiB</EuiText>
            </EuiPanel>
          </EuiFlexItem>
        </EuiFlexGroup>

        <EuiSpacer size="l" />

        {/* Cost and Optimization Stats */}
        <EuiFlexGroup gutterSize="m">
          <EuiFlexItem>
            <EuiPanel style={{ padding: '16px', textAlign: 'center' }}>
              <EuiStat title="$0.00137" description="CPU cost allocation" titleColor="primary" />
            </EuiPanel>
          </EuiFlexItem>
          <EuiFlexItem>
            <EuiPanel style={{ padding: '16px', textAlign: 'center' }}>
              <EuiStat title="$0.00352" description="Memory cost allocation" titleColor="primary" />
            </EuiPanel>
          </EuiFlexItem>
          <EuiFlexItem>
            <EuiPanel style={{ padding: '16px', textAlign: 'center' }}>
              <EuiStat title="$0.00490" description="Total cost (compute)" titleColor="primary" />
            </EuiPanel>
          </EuiFlexItem>
          <EuiFlexItem>
            <EuiPanel style={{ padding: '16px', textAlign: 'center' }}>
              <EuiStat title="No data" description="CPU idle cost" titleColor="primary" />
            </EuiPanel>
          </EuiFlexItem>
          <EuiFlexItem>
            <EuiPanel style={{ padding: '16px', textAlign: 'center' }}>
              <EuiStat title="No data" description="Memory idle cost" titleColor="primary" />
            </EuiPanel>
          </EuiFlexItem>
          <EuiFlexItem>
            <EuiPanel style={{ padding: '16px', textAlign: 'center' }}>
              <EuiStat title="No data" description="Total idle cost (compute)" titleColor="primary" />
            </EuiPanel>
          </EuiFlexItem>
        </EuiFlexGroup>

      </EuiPageBody>
    </EuiPage>
  );
};

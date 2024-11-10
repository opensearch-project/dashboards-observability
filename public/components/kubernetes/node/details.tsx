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
  EuiLink,
  EuiTabs,
  EuiTab,
  EuiFlexGroup,
  EuiFlexItem,
  EuiPanel,
  EuiText,
  EuiStat,
  EuiSpacer,
  EuiHorizontalRule,
  EuiButton,
  EuiBadge,
} from '@elastic/eui';
import { Plt } from '../../visualizations/plotly/plot';

export const NodeDetails = () => {
  const nodeInfo = [
    { label: 'cluster', value: 'eks-cluster-with-vpc' },
    { label: 'container_runtime_version', value: '1.6.28' },
    { label: 'internal_ip', value: '10.116.0.2' },
    { label: 'kernel_version', value: '6.1.0-21-amd64' },
    { label: 'kubelet_version', value: 'v1.28.10' },
    { label: 'create date', value: '7/1/2024 at 11:16:45 PM' },
  ];

  const additionalInfo = [
    { label: 'kubeproxy_version', value: 'v1.28.10' },
    { label: 'node', value: 'pool-e1ro5g0nq-rk82j' },
    { label: 'os_image', value: 'Debian GNU/Linux 12 (bookworm)' },
    { label: 'provider_id', value: 'digitalocean://429605399' },
    { label: 'system_uuid', value: 'f59831d8-457c-415c-b733-dd52b3cfe1df' },
  ];

  const cpuUsageData = [
    {
      x: [
        '18:30',
        '18:35',
        '18:40',
        '18:45',
        '18:50',
        '18:55',
        '19:00',
        '19:05',
        '19:10',
        '19:15',
        '19:20',
      ],
      y: [1.1, 1.2, 1.1, 1.3, 1.25, 1.1, 1.35, 1.4, 1.2, 1.1, 1.15],
      name: 'Node CPU usage',
      type: 'scatter',
      mode: 'lines',
      line: { color: '#1f77b4', width: 2 },
    },
  ];

  const memoryUsageData = [
    {
      x: [
        '18:30',
        '18:35',
        '18:40',
        '18:45',
        '18:50',
        '18:55',
        '19:00',
        '19:05',
        '19:10',
        '19:15',
        '19:20',
      ],
      y: [2.8, 3.1, 2.9, 3.0, 3.2, 3.1, 3.0, 2.9, 3.1, 3.05, 3.0],
      name: 'Node memory usage',
      type: 'scatter',
      mode: 'lines',
      line: { color: '#9467bd', width: 2 },
    },
  ];

  return (
    <EuiPage paddingSize="l">
      <EuiPageBody>
        {/* Header Section */}
        <EuiPageHeader>
          <EuiPageHeaderSection>
            <EuiTitle size="l">
              <h1>
                pool-e1ro5g0nq-rk82j <EuiBadge color="#FEA27F" style={{width: '44px'}}>node</EuiBadge>{' '}
              </h1>
            </EuiTitle>
            <EuiText color="subdued">
              {/* in cluster <EuiLink href="kubernetes-cluster/eks-cluster-with-vpc" color="primary">eks-cluster-with-vpc</EuiLink>
               */}
              in cluster eks-cluster-with-vpc
            </EuiText>
          </EuiPageHeaderSection>
        </EuiPageHeader>

        <EuiSpacer size="m" />

        {/* Tabs */}
        <EuiTabs>
          <EuiTab isSelected>Overview</EuiTab>
          {/* <EuiTab>Network</EuiTab>
          <EuiTab>Energy</EuiTab>
          <EuiTab>Logs & Events</EuiTab> */}
        </EuiTabs>

        {/* <EuiSpacer size="m" /> */}

        {/* <EuiButton color="primary">Explore node</EuiButton> */}

        <EuiSpacer size="m" />

        {/* Node Information */}
        <EuiFlexGroup gutterSize="m">
          <EuiFlexItem>
            <EuiPanel style={{ padding: '16px' }}>
              <EuiText color="subdued" size="s">
                Node information
              </EuiText>
              <EuiSpacer size="s" />
              {nodeInfo.map((item, index) => (
                <div
                  key={index}
                  style={{ display: 'flex', justifyContent: 'space-between', padding: '4px 0' }}
                >
                  <EuiText color="subdued" size="s">
                    {item.label}
                  </EuiText>
                  <EuiText size="s">{item.value}</EuiText>
                </div>
              ))}
            </EuiPanel>
          </EuiFlexItem>
          <EuiFlexItem>
            <EuiPanel style={{ padding: '16px' }}>
              <EuiSpacer size="s" />
              {additionalInfo.map((item, index) => (
                <div
                  key={index}
                  style={{ display: 'flex', justifyContent: 'space-between', padding: '4px 0' }}
                >
                  <EuiText color="subdued" size="s">
                    {item.label}
                  </EuiText>
                  <EuiText size="s">{item.value}</EuiText>
                </div>
              ))}
            </EuiPanel>
          </EuiFlexItem>
        </EuiFlexGroup>

        <EuiSpacer size="l" />

        <EuiHorizontalRule />

        {/* Node CPU and Memory Usage Charts */}
        <EuiFlexGroup gutterSize="l">
          <EuiFlexItem>
            <EuiPanel style={{ padding: '16px', borderRadius: '8px' }}>
              <EuiTitle size="xs">
                <h2>Node CPU</h2>
              </EuiTitle>
              <EuiSpacer size="s" />
              <Plt
                data={cpuUsageData}
                layout={{ title: '', yaxis: { title: 'Cores' }, xaxis: { title: 'Time' } }}
                height="250px"
              />
            </EuiPanel>
          </EuiFlexItem>
          <EuiFlexItem>
            <EuiPanel style={{ padding: '16px', borderRadius: '8px' }}>
              <EuiTitle size="xs">
                <h2>Node Memory</h2>
              </EuiTitle>
              <EuiSpacer size="s" />
              <Plt
                data={memoryUsageData}
                layout={{ title: '', yaxis: { title: 'GiB' }, xaxis: { title: 'Time' } }}
                height="250px"
              />
            </EuiPanel>
          </EuiFlexItem>
        </EuiFlexGroup>

        <EuiSpacer size="l" />

        {/* Cost Allocation */}
        <EuiFlexGroup gutterSize="m">
          <EuiFlexItem>
            <EuiPanel style={{ padding: '16px', textAlign: 'center' }}>
              <EuiStat title="$0.0632" description="CPU cost allocation" titleColor="primary" />
            </EuiPanel>
          </EuiFlexItem>
          <EuiFlexItem>
            <EuiPanel style={{ padding: '16px', textAlign: 'center' }}>
              <EuiStat title="$0.0162" description="Memory cost allocation" titleColor="primary" />
            </EuiPanel>
          </EuiFlexItem>
          <EuiFlexItem>
            <EuiPanel style={{ padding: '16px', textAlign: 'center' }}>
              <EuiStat title="$0.0794" description="Total cost (compute)" titleColor="primary" />
            </EuiPanel>
          </EuiFlexItem>
          <EuiFlexItem>
            <EuiPanel style={{ padding: '16px', textAlign: 'center' }}>
              <EuiStat title="$0.0127" description="CPU idle cost" titleColor="primary" />
            </EuiPanel>
          </EuiFlexItem>
          <EuiFlexItem>
            <EuiPanel style={{ padding: '16px', textAlign: 'center' }}>
              <EuiStat title="$0.0059" description="Memory idle cost" titleColor="primary" />
            </EuiPanel>
          </EuiFlexItem>
          <EuiFlexItem>
            <EuiPanel style={{ padding: '16px', textAlign: 'center' }}>
              <EuiStat
                title="$0.0178"
                description="Total idle cost (compute)"
                titleColor="primary"
              />
            </EuiPanel>
          </EuiFlexItem>
        </EuiFlexGroup>
      </EuiPageBody>
    </EuiPage>
  );
};

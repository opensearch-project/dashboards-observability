/*
 * Copyright OpenSearch Contributors
 * SPDX-License-Identifier: Apache-2.0
 */

import React from 'react';
// import { useNavigate } from 'react-router-dom';
import {
  EuiPage,
  EuiPageBody,
  EuiPageHeader,
  EuiPageHeaderSection,
  EuiTitle,
  EuiFlexGroup,
  EuiFlexItem,
  EuiCard,
  EuiPanel,
  EuiTable,
  EuiTableHeader,
  EuiTableHeaderCell,
  EuiTableBody,
  EuiTableRow,
  EuiTableRowCell,
  EuiSpacer,
  EuiBadge,
  EuiLink,
} from '@elastic/eui';

export const ClusterOverview = (props) => {
  console.log('clusterOverviewHome props: ', props);
  // const navigate = useNavigate();
  const fakeData = [
    {
      clusterName: 'eks-cluster-with-vpc',
      provider: 'digitalocean',
      nodes: 2,
      cpuUsage: { avg: '0.607 cores', max: '1.45 cores' },
      memoryUsage: { avg: '4.66 GiB', max: '5.01 GiB' },
      alerts: 2,
      resourceUsage: 'low',
    },
  ];

  // const handleClusterClick = (clusterName: string) => {
  //   navigate(`/${clusterName}`);
  // };

  return (
    <EuiPage>
      <EuiPageBody>
        <EuiPageHeader>
          <EuiPageHeaderSection>
            <EuiTitle size="l">
              <h1>Clusters</h1>
            </EuiTitle>
          </EuiPageHeaderSection>
        </EuiPageHeader>

        <EuiSpacer size="l" />

        <EuiPanel>
          {/* <EuiFlexGroup gutterSize="m">
            <EuiFlexItem>
              <EuiCard
                title="Usage"
                description=""
              />
            </EuiFlexItem>
            <EuiFlexItem>
              <EuiCard
                title="Cost"
                description=""
              />
            </EuiFlexItem>
            <EuiFlexItem>
              <EuiCard
                title="Explore Clusters"
                description=""
              />
            </EuiFlexItem>
          </EuiFlexGroup>

          <EuiSpacer size="m" /> */}

          <EuiTable>
            <EuiTableHeader>
              <EuiTableHeaderCell>Cluster</EuiTableHeaderCell>
              <EuiTableHeaderCell>Provider</EuiTableHeaderCell>
              <EuiTableHeaderCell>Nodes</EuiTableHeaderCell>
              <EuiTableHeaderCell>CPU Usage (Average)</EuiTableHeaderCell>
              <EuiTableHeaderCell>CPU Usage (Max)</EuiTableHeaderCell>
              <EuiTableHeaderCell>Memory Usage (Average)</EuiTableHeaderCell>
              <EuiTableHeaderCell>Memory Usage (Max)</EuiTableHeaderCell>
              <EuiTableHeaderCell>Alerts</EuiTableHeaderCell>
              <EuiTableHeaderCell>Resource Usage</EuiTableHeaderCell>
            </EuiTableHeader>

            <EuiTableBody>
              {fakeData.map((cluster, index) => (
                <EuiTableRow key={index}>
                  <EuiTableRowCell>
                    {/* <Link
                      to={`/${cluster.clusterName}`}
                      style={{ textDecoration: 'none', color: 'blue' }}
                    >
                      {cluster.clusterName}
                    </Link> */}
                    <EuiLink href={`kubernetes-cluster/${cluster.clusterName}`}>
                    {/* <EuiLink onClick={() => handleClusterClick(cluster.clusterName)}> */}
                      {cluster.clusterName}
                    </EuiLink>
                  </EuiTableRowCell>
                  <EuiTableRowCell>{cluster.provider}</EuiTableRowCell>
                  <EuiTableRowCell>{cluster.nodes}</EuiTableRowCell>
                  <EuiTableRowCell>{cluster.cpuUsage.avg}</EuiTableRowCell>
                  <EuiTableRowCell>{cluster.cpuUsage.max}</EuiTableRowCell>
                  <EuiTableRowCell>{cluster.memoryUsage.avg}</EuiTableRowCell>
                  <EuiTableRowCell>{cluster.memoryUsage.max}</EuiTableRowCell>
                  <EuiTableRowCell>
                    <EuiBadge color="warning">{cluster.alerts}</EuiBadge>
                  </EuiTableRowCell>
                  <EuiTableRowCell>
                    <EuiBadge color={cluster.resourceUsage === 'low' ? 'success' : 'danger'}>
                      {cluster.resourceUsage}
                    </EuiBadge>
                  </EuiTableRowCell>
                </EuiTableRow>
              ))}
            </EuiTableBody>
          </EuiTable>
        </EuiPanel>
      </EuiPageBody>
    </EuiPage>
  );
};

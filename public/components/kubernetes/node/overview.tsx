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
  EuiBadge,
  EuiButton,
  EuiSelect,
  EuiFieldSearch,
  EuiLink,
} from '@elastic/eui';

export const NodeOverview = () => {
  const fakeData = [
    {
      nodeName: 'pool-e1ro5g0nq-rk82j',
      clusterName: 'eks-cluster-with-vpc',
      provider: 'digitalocean',
      cpuUsage: { avg: '1.49 cores', max: '1.67 cores' },
      memoryUsage: { avg: '2.79 GiB', max: '2.9 GiB' },
      alerts: 1,
    },
    {
      nodeName: 'pool-e1ro5g0nq-rk82o',
      clusterName: 'eks-cluster-with-vpc',
      provider: 'digitalocean',
      cpuUsage: { avg: '1.54 cores', max: '1.71 cores' },
      memoryUsage: { avg: '2.05 GiB', max: '2.07 GiB' },
      alerts: 0,
    },
  ];

  return (
    <EuiPage paddingSize="l">
      <EuiPageBody>
        <EuiPageHeader>
          <EuiPageHeaderSection>
            <EuiTitle size="l">
              <h1>Nodes</h1>
            </EuiTitle>
          </EuiPageHeaderSection>
        </EuiPageHeader>

        {/* <EuiFlexGroup gutterSize="m" style={{ marginTop: '20px' }}>
          <EuiFlexItem>
            <EuiCard title="Usage" description="" />
          </EuiFlexItem>
          <EuiFlexItem>
            <EuiCard title="Cost" description="" />
          </EuiFlexItem>
          <EuiFlexItem>
            <EuiCard title="Explore nodes" description="" />
          </EuiFlexItem>
          <EuiFlexItem grow={false}>
            <EuiSelect
              options={[
                { value: 'Cluster', text: 'Cluster' },
                { value: 'Node', text: 'Node' },
              ]}
              aria-label="Select cluster or node filter"
            />
          </EuiFlexItem>
          <EuiFlexItem>
            <EuiFieldSearch placeholder="Filter by node" onChange={() => {}} isClearable={true} />
          </EuiFlexItem>
          <EuiFlexItem grow={false}>
            <EuiButton>Show filters</EuiButton>
          </EuiFlexItem>
        </EuiFlexGroup> */}

        <EuiPanel paddingSize="none" style={{ marginTop: '20px' }}>
          <EuiTable>
            <EuiTableHeader>
              <EuiTableHeaderCell>NODE</EuiTableHeaderCell>
              <EuiTableHeaderCell>CLUSTER</EuiTableHeaderCell>
              <EuiTableHeaderCell>PROVIDER</EuiTableHeaderCell>
              <EuiTableHeaderCell>CPU USAGE (Average)</EuiTableHeaderCell>
              <EuiTableHeaderCell>CPU USAGE (Max)</EuiTableHeaderCell>
              <EuiTableHeaderCell>MEMORY USAGE (Average)</EuiTableHeaderCell>
              <EuiTableHeaderCell>MEMORY USAGE (Max)</EuiTableHeaderCell>
              <EuiTableHeaderCell>ALERTS</EuiTableHeaderCell>
            </EuiTableHeader>

            <EuiTableBody>
              {fakeData.map((node, index) => (
                <EuiTableRow key={index}>
                  <EuiTableRowCell>
                    <EuiLink href={`kubernetes-node/${node.nodeName}`}>
                      {node.nodeName}
                    </EuiLink>
                  </EuiTableRowCell>
                  <EuiTableRowCell>
                    <EuiBadge color="hollow">{node.clusterName}</EuiBadge>
                  </EuiTableRowCell>
                  <EuiTableRowCell>{node.provider}</EuiTableRowCell>
                  <EuiTableRowCell>{node.cpuUsage.avg}</EuiTableRowCell>
                  <EuiTableRowCell>{node.cpuUsage.max}</EuiTableRowCell>
                  <EuiTableRowCell>{node.memoryUsage.avg}</EuiTableRowCell>
                  <EuiTableRowCell>{node.memoryUsage.max}</EuiTableRowCell>
                  <EuiTableRowCell>
                    {node.alerts > 0 ? (
                      <EuiBadge color="warning">{node.alerts}</EuiBadge>
                    ) : (
                      <span>None</span>
                    )}
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

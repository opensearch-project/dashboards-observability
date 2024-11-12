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
  EuiIcon,
  EuiLink,
} from '@elastic/eui';

export const NamespaceOverview = () => {
  const fakeData = [
    {
      namespace: 'argocd',
      cluster: 'do-nyc1-demo-infra',
      workloads: 7,
      cpuUsage: { avg: '0.0521 cores', max: '0.128 cores' },
      memoryUsage: { avg: '866.37 MiB', max: '1009.99 MiB' },
      alerts: 0,
    },
    {
      namespace: 'cert-manager',
      cluster: 'do-nyc1-demo-infra',
      workloads: 3,
      cpuUsage: { avg: '0.00199 cores', max: '0.00302 cores' },
      memoryUsage: { avg: '101.07 MiB', max: '101.17 MiB' },
      alerts: 0,
    },
    {
      namespace: 'ingress-nginx',
      cluster: 'do-nyc1-demo-infra',
      workloads: 1,
      cpuUsage: { avg: '0.176 cores', max: '0.215 cores' },
      memoryUsage: { avg: '92.9 MiB', max: '95.17 MiB' },
      alerts: 1,
    },
    // Additional rows with similar structure
  ];

  return (
    <EuiPage paddingSize="l">
      <EuiPageBody>
        <EuiPageHeader>
          <EuiPageHeaderSection>
            <EuiTitle size="l">
              <h1>Namespaces</h1>
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
            <EuiCard title="Explore namespaces" description="" />
          </EuiFlexItem>
          <EuiFlexItem grow={false}>
            <EuiFieldSearch
              placeholder="Filter Namespace"
              onChange={() => {}}
              isClearable={true}
            />
          </EuiFlexItem>
          <EuiFlexItem grow={false}>
            <EuiSelect
              options={[
                { value: 'Filter Clusters', text: 'Filter Clusters' },
                { value: 'Cluster 1', text: 'Cluster 1' },
                { value: 'Cluster 2', text: 'Cluster 2' },
              ]}
              aria-label="Select cluster filter"
            />
          </EuiFlexItem>
        </EuiFlexGroup> */}

        <EuiPanel paddingSize="none" style={{ marginTop: '20px' }}>
          <EuiTable>
            <EuiTableHeader>
              <EuiTableHeaderCell>NAMESPACE</EuiTableHeaderCell>
              <EuiTableHeaderCell>CLUSTER</EuiTableHeaderCell>
              <EuiTableHeaderCell>WORKLOADS</EuiTableHeaderCell>
              <EuiTableHeaderCell>CPU USAGE (Average)</EuiTableHeaderCell>
              <EuiTableHeaderCell>CPU USAGE (Max)</EuiTableHeaderCell>
              <EuiTableHeaderCell>MEMORY USAGE (Average)</EuiTableHeaderCell>
              <EuiTableHeaderCell>MEMORY USAGE (Max)</EuiTableHeaderCell>
              <EuiTableHeaderCell>ALERTS</EuiTableHeaderCell>
            </EuiTableHeader>

            <EuiTableBody>
              {fakeData.map((namespace, index) => (
                <EuiTableRow key={index}>
                  <EuiTableRowCell>
                    <EuiLink href={`kubernetes-namespaces/${namespace.namespace}`}>
                      {namespace.namespace}
                    </EuiLink>
                    {/* <EuiIcon type="arrowRight" /> {namespace.namespace} */}
                  </EuiTableRowCell>
                  <EuiTableRowCell>
                    <EuiBadge color="hollow">{namespace.cluster}</EuiBadge>
                  </EuiTableRowCell>
                  <EuiTableRowCell>{namespace.workloads}</EuiTableRowCell>
                  <EuiTableRowCell>{namespace.cpuUsage.avg || 'No data'}</EuiTableRowCell>
                  <EuiTableRowCell>{namespace.cpuUsage.max || 'No data'}</EuiTableRowCell>
                  <EuiTableRowCell>{namespace.memoryUsage.avg || 'No data'}</EuiTableRowCell>
                  <EuiTableRowCell>{namespace.memoryUsage.max || 'No data'}</EuiTableRowCell>
                  <EuiTableRowCell>
                    {namespace.alerts > 0 ? (
                      <EuiBadge color="warning">{namespace.alerts}</EuiBadge>
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

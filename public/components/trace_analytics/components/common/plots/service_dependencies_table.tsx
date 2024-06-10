/*
 * Copyright OpenSearch Contributors
 * SPDX-License-Identifier: Apache-2.0
 */

import { EuiHorizontalRule, EuiInMemoryTable, EuiPanel, EuiText } from '@elastic/eui';
import { truncate } from 'lodash';
import React, { useEffect, useMemo, useState } from 'react';
import { GraphVisEdge, GraphVisNode } from '../../../../../../common/types/trace_analytics';
import { ServiceTrendsPlots } from '../../services/service_trends_plots';
import { PanelTitle } from '../helper_functions';
import { ServiceObject } from './service_map';

interface ServiceDependenciesTableProps {
  serviceMap: ServiceObject;
  graph: { nodes: GraphVisNode[]; edges: GraphVisEdge[] };
}

export const ServiceDependenciesTable = ({ serviceMap, graph }: ServiceDependenciesTableProps) => {
  const [serviceDependencies, setServiceDependencies] = useState<
    Array<{
      id: number;
      name: string;
      average_latency: string;
      error_rate: string;
      throughput: string;
    }>
  >([]);

  useEffect(() => {
    const items = graph.nodes.map((node) => ({
      id: node.id,
      name: node.label,
      average_latency: serviceMap[node.label].latency,
      error_rate: serviceMap[node.label].error_rate,
      throughput: serviceMap[node.label].throughput,
    }));
    setServiceDependencies(items);
  }, [graph]);

  const columns = useMemo(
    () => [
      {
        field: 'name',
        name: 'Name',
        align: 'left',
        sortable: true,
        render: (item: any) => (
          <EuiText data-test-subj="service-dep-column">
            {item.length < 24 ? item : <div title={item}>{truncate(item, { length: 24 })}</div>}
          </EuiText>
        ),
      },
      {
        field: 'average_latency',
        name: 'Average duration (ms)',
        align: 'right',
        sortable: true,
        render: (item: any, row: any) => (
          <ServiceTrendsPlots
            item={item}
            row={row}
            isServiceTrendEnabled={false}
            fieldType="average_latency"
          />
        ),
      },
      {
        field: 'error_rate',
        name: 'Error rate',
        align: 'right',
        sortable: true,
        render: (item: any, row: any) => (
          <ServiceTrendsPlots
            item={item}
            row={row}
            isServiceTrendEnabled={false}
            fieldType="error_rate"
          />
        ),
      },
      {
        field: 'throughput',
        name: 'Request rate',
        align: 'right',
        sortable: true,
        truncateText: true,
        render: (item: any, row: any) => (
          <ServiceTrendsPlots
            item={item}
            row={row}
            isServiceTrendEnabled={false}
            fieldType="throughput"
          />
        ),
      },
    ],
    [serviceDependencies]
  );

  return (
    <EuiPanel>
      <PanelTitle title="Service Dependencies" />
      <EuiHorizontalRule margin="m" />
      <EuiInMemoryTable
        items={serviceDependencies}
        columns={columns}
        itemId="id"
        pagination={{
          initialPageSize: 5,
          pageSizeOptions: [5, 10, 15],
        }}
        sorting={{
          sort: {
            field: 'name',
            direction: 'asc',
          },
        }}
      />
    </EuiPanel>
  );
};

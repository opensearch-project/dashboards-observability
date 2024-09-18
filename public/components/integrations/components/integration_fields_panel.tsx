/*
 * Copyright OpenSearch Contributors
 * SPDX-License-Identifier: Apache-2.0
 */

import {
  EuiInMemoryTable,
  EuiPanel,
  EuiSpacer,
  EuiTableFieldDataColumnType,
  EuiText,
  EuiTitle,
} from '@elastic/eui';
import React from 'react';
import truncate from 'lodash/truncate';

export function IntegrationFields(props: any) {
  const config = props.integration;
  const mapping = props.integrationMapping;

  const search = {
    box: {
      incremental: true,
      compressed: true,
    },
  };

  const tableColumns = [
    {
      field: 'name',
      name: 'Name',
      sortable: true,
      truncateText: true,
      render: (value, record) => (
        <EuiText data-test-subj={`${record.name}IntegrationLink`}>
          {truncate(record.name, { length: 100 })}
        </EuiText>
      ),
    },
    {
      field: 'type',
      name: 'Type',
      sortable: true,
      truncateText: true,
      render: (value, record) => (
        <EuiText data-test-subj={`${record.type}IntegrationDescription`}>
          {truncate(record.type, { length: 100 })}
        </EuiText>
      ),
    },
    {
      field: 'category',
      name: 'Category',
      sortable: true,
      truncateText: true,
      render: (value, record) => (
        <EuiText data-test-subj={`${record.type}IntegrationDescription`}>
          {truncate(record.category, { length: 100 })}
        </EuiText>
      ),
    },
  ] as Array<EuiTableFieldDataColumnType<any>>;

  const traverseTypes = (
    properties: any,
    category?: string,
    prefix?: string
  ): Array<{
    name: string;
    type: string;
    category: string;
  }> => {
    const result: any[] = [];
    for (const p of Object.keys(properties)) {
      if (properties[p].type) {
        result.push({
          name: prefix ? prefix + '.' + p : p,
          type: properties[p].type,
          category: category ? category : 'None',
        });
      } else if (properties[p].properties) {
        result.push({
          name: prefix ? prefix + '.' + p : p,
          type: 'nested',
          category: category ? category : 'None',
        });
        result.push(
          ...traverseTypes(properties[p].properties, (prefix = prefix ? prefix + '.' + p : p))
        );
      }
    }
    return result;
  };

  return (
    <EuiPanel data-test-subj={`${config.name}-fields`}>
      <EuiTitle size="s">
        <h3>Fields</h3>
      </EuiTitle>
      <EuiSpacer size="s" />
      <EuiInMemoryTable
        itemId="id"
        loading={false}
        items={mapping ? traverseTypes(mapping.template.mappings.properties, config.type) : []}
        columns={tableColumns}
        pagination={{
          initialPageSize: 10,
          pageSizeOptions: [5, 10, 15],
        }}
        search={search}
      />
    </EuiPanel>
  );
}

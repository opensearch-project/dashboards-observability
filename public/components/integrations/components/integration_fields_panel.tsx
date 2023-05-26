import {
  EuiInMemoryTable,
  EuiPanel,
  EuiSpacer,
  EuiTableFieldDataColumnType,
  EuiText,
} from '@elastic/eui';
import React from 'react';
import _ from 'lodash';
import { FILTER_OPTIONS } from '../../../../common/constants/explorer';
import { PanelTitle } from '../../trace_analytics/components/common/helper_functions';

export function IntegrationFields(props: any) {
  const data =
    props.data.data.components.map((x: any) => ({
      name: x.name,
      version: x.version,
      mapping: JSON.parse(x.mappingBody),
    })) || [];

  const search = {
    box: {
      incremental: true,
    },
    filters: [
      {
        type: 'field_value_selection',
        field: 'type',
        name: 'Type',
        multiSelect: false,
        options: FILTER_OPTIONS.map((i) => ({
          value: i,
          name: i,
          view: i,
        })),
      },
    ],
  };

  const tableColumns = [
    {
      field: 'name',
      name: 'Name',
      sortable: true,
      truncateText: true,
      render: (value, record) => (
        <EuiText data-test-subj={`${record.name}IntegrationLink`}>
          {_.truncate(record.name, { length: 100 })}
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
          {_.truncate(record.type, { length: 100 })}
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
          {_.truncate(record.category, { length: 100 })}
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
    <EuiPanel>
      <PanelTitle title={props.data.data.name + ' Fields'} />
      <EuiSpacer size="l" />
      <EuiInMemoryTable
        itemId="id"
        loading={false}
        items={data
          .map((x: any) => {
            const properties = x.mapping.template.mappings.properties;
            return traverseTypes(properties, x.name);
          })
          .flat()}
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

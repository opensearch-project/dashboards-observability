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
} from '@elastic/eui';
import React from 'react';
import _ from 'lodash';
import { FILTER_OPTIONS } from '../../../../common/constants/explorer';
import { PanelTitle } from '../../trace_analytics/components/common/helper_functions';

export function IntegrationAssets(props: any) {
  const data = props.data.data.displayAssets.map((x: any) => JSON.parse(x.body)) || [];

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
        <EuiText data-test-subj={`${record.id}IntegrationLink`}>
          {_.truncate(record.attributes.title ? record.attributes.title : '(Unnamed)', {
            length: 100,
          })}
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
  ] as Array<EuiTableFieldDataColumnType<any>>;

  return (
    <EuiPanel>
      <PanelTitle title={props.data.data.name + ' Assets'} />
      <EuiSpacer size="l" />
      <EuiInMemoryTable
        itemId="id"
        loading={false}
        items={data.filter((x: any) => x.type !== undefined)}
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

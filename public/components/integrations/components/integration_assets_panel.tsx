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
import { PanelTitle } from '../../trace_analytics/components/common/helper_functions';
import { ASSET_FILTER_OPTIONS } from '../../../../common/constants/integrations';

export function IntegrationAssets(props: any) {
  const [config, assets] = [props.integration, props.integrationAssets];

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
        options: ASSET_FILTER_OPTIONS.map((i) => ({
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
      render: (_value, record) => (
        <EuiText data-test-subj={`${record.type}IntegrationDescription`}>
          {_.truncate(record.type, { length: 100 })}
        </EuiText>
      ),
    },
  ] as Array<EuiTableFieldDataColumnType<any>>;

  return (
    <EuiPanel data-test-subj={`${config.name}-assets`}>
      <PanelTitle title={'Assets'} />
      <EuiSpacer size="l" />
      <EuiInMemoryTable
        itemId="id"
        loading={false}
        items={
          assets?.savedObjects ? assets.savedObjects.filter((x: any) => x.type !== undefined) : []
        }
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

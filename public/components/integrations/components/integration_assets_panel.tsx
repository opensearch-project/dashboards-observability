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
import _ from 'lodash';
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
          {_.truncate(record.name, {
            length: 100,
          })}
        </EuiText>
      ),
    },
    {
      field: 'type',
      name: 'Type',
      truncateText: true,
      render: (_value, record) => (
        <EuiText data-test-subj={`${record.type}IntegrationDescription`}>
          {_.truncate(record.type, { length: 100 })}
        </EuiText>
      ),
    },
  ] as Array<EuiTableFieldDataColumnType<any>>;

  const entries = assets?.savedObjects
    ? assets.savedObjects
        .filter((x: any) => x.type !== undefined)
        .map((asset: any) => {
          const name = asset.attributes.title ? asset.attributes.title : '(Unnamed)';
          const type = asset.type;
          const id = asset.id;
          return { name, type, id, data: { name, type } };
        })
    : [];

  return (
    <EuiPanel data-test-subj={`${config.name}-assets`}>
      <EuiTitle>
        <h2>Assets</h2>
      </EuiTitle>
      <EuiSpacer size="l" />
      <EuiInMemoryTable
        itemId="id"
        loading={false}
        items={entries}
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

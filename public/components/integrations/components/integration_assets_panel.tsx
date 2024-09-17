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
import { ASSET_FILTER_OPTIONS } from '../../../../common/constants/integrations';
import { SavedObject } from '../../../../../../src/core/types';

export function IntegrationAssets(props: {
  integration: IntegrationConfig;
  integrationAssets?: ParsedIntegrationAsset[];
}) {
  const [config, assets] = [props.integration, props.integrationAssets];

  const search = {
    box: {
      incremental: true,
      compressed: true,
    },
    filters: [
      {
        type: 'field_value_selection' as const,
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
    compressed: true,
  };

  const tableColumns = [
    {
      field: 'name',
      name: 'Name',
      sortable: true,
      truncateText: true,
      render: (value, record) => (
        <EuiText data-test-subj={`${record.id}IntegrationLink`}>
          {truncate(record.name, {
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
          {truncate(record.type, { length: 100 })}
        </EuiText>
      ),
    },
  ] as Array<EuiTableFieldDataColumnType<{ name: string; id: string; type: string }>>;

  const entries =
    assets
      ?.filter(
        (asset: ParsedIntegrationAsset): asset is { type: 'savedObjectBundle'; data: object[] } =>
          asset.type === 'savedObjectBundle'
      )
      .flatMap((asset) => (asset.data as unknown) as Array<SavedObject<{ title?: string }>>)
      .map((asset: SavedObject<{ title?: string }>) => {
        const name = asset.attributes.title ?? '(Unnamed)';
        const type = asset.type;
        const id = asset.id;
        return { name, type, id, data: { name, type } };
      }) ?? [];

  return (
    <EuiPanel data-test-subj={`${config.name}-assets`}>
      <EuiTitle size="s">
        <h3>Assets</h3>
      </EuiTitle>
      <EuiSpacer size="s" />
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

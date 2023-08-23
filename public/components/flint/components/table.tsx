/*
 * Copyright OpenSearch Contributors
 * SPDX-License-Identifier: Apache-2.0
 */

import './accelerate.scss';
import {
  EuiFlexGroup,
  EuiFlexItem,
  EuiGlobalToastList,
  EuiLoadingSpinner,
  EuiOverlayMask,
  EuiPage,
  EuiPageBody,
  EuiSpacer,
  EuiTab,
  EuiTabs,
  EuiCheckableCard,
  htmlIdGenerator,
  EuiTitle,
  EuiText,
  EuiLink,
  EuiButton,
  EuiInMemoryTable,
  EuiTableFieldDataColumnType,
  EuiPageContent,
} from '@elastic/eui';
import React, { ReactChild, useEffect, useState } from 'react';
import httpClientMock from 'test/__mocks__/httpClientMock';
import { AccelerateHeader } from './accelerate_header';
import { AccelerateCallout } from './accelerate_callout';
import {
  ASSET_FILTER_OPTIONS,
  OPENSEARCH_DOCUMENTATION_URL,
} from '../../../../common/constants/integrations';
import { AccelerateFlyout } from './accelerate_flyout';

export function Table(props: any) {
  // const [isFlyoutVisible, setIsFlyoutVisible] = useState(false);
  const { table, dataSource, pplService } = props;
  console.log(table);

  const [tables, setTables] = useState([]);

  useEffect(() => {
    pplService
      .fetch({ query: `source = ${dataSource}.sql(\'DESCRIBE TABLE ${table}\')`, format: 'jdbc' })
      .then((data) =>
        setTables(
          data.jsonData.map((x: any) => {
            return { label: x.tableName, namespace: x.namespace, isTemporary: x.isTemporary };
          })
        )
      );
  }, []);

  const tableColumns = [
    {
      field: 'name',
      name: 'Table Name',
      sortable: true,
      truncateText: true,
      render: (value, record) => (
        <EuiLink
          data-test-subj={`${record.label}IntegrationDescription`}
          href={`#/accelerate/${dataSource}/${record.label}`}
        >
          {_.truncate(record.label, { length: 100 })}
        </EuiLink>
      ),
    },
    {
      field: 'namespace',
      name: 'Namespace',
      sortable: true,
      truncateText: true,
      render: (value, record) => (
        <EuiText data-test-subj={`${record.namespace}Namespace`}>
          {_.truncate(record.namespace, { length: 100 })}
        </EuiText>
      ),
    },
    {
      field: 'isTemporary',
      name: 'Is Temporary',
      sortable: true,
      truncateText: true,
      render: (value, record) => (
        <EuiText data-test-subj={`${record.isTemporary}temporary`}>
          {_.truncate(record.isTemporary, { length: 100 })}
        </EuiText>
      ),
    },
  ] as Array<EuiTableFieldDataColumnType<any>>;

  const search = {
    box: {
      incremental: true,
    },
    filters: [
      {
        type: 'field_value_selection',
        field: 'assetType',
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

  return (
    <EuiPage>
      <EuiPageContent data-test-subj="addedIntegrationsArea">
        {dataSource}
        {/* <EuiSpacer/>

      <EuiInMemoryTable
          loading={props.loading}
          items={tables}
          itemId="id"
          columns={tableColumns}
          tableLayout="auto"
          pagination={{
            initialPageSize: 10,
            pageSizeOptions: [5, 10, 15],
          }}
          search={search}
          allowNeutralSort={false}
          isSelectable={true}
        /> */}
      </EuiPageContent>
    </EuiPage>
  );
}

/*
 * Copyright OpenSearch Contributors
 * SPDX-License-Identifier: Apache-2.0
 */

import {
  EuiFlexGroup,
  EuiFlexItem,
  EuiIcon,
  EuiInMemoryTable,
  EuiLink,
  EuiPage,
  EuiPageBody,
  EuiPageContent,
  EuiTableFieldDataColumnType,
  EuiText,
} from '@elastic/eui';
import _ from 'lodash';
import React, { useEffect, useState } from 'react';
import { DataConnectionsHeader } from './datasources_header';
import { HomeProps } from '../home';
import { coreRefs } from '../../../framework/core_refs';
import { DatasourcesDescription } from './manage_datasource_description';
import sparkSvg from '../icons/spark_logo.svg';

interface DataConnection {
  connectionType: 'OPENSEARCH' | 'SPARK';
  name: string;
}

export function ManageDatasourcesTable(props: HomeProps) {
  const { http, chrome } = props;
  const { pplService } = coreRefs;

  const [data, setData] = useState([]);

  useEffect(() => {
    chrome.setBreadcrumbs([
      {
        text: 'Datasources',
        href: '#/',
      },
    ]);
    handleDataRequest();
  }, []);

  async function handleDataRequest() {
    pplService!.fetch({ query: 'show datasources', format: 'jdbc' }).then((datasources) =>
      setData(
        datasources.jsonData.map((x: any) => {
          return { name: x.DATASOURCE_NAME, connectionType: x.CONNECTOR_TYPE };
        })
      )
    );
  }

  const icon = (record: DataConnection) => {
    switch (record.connectionType) {
      case 'OPENSEARCH':
        return <EuiIcon type="logoOpenSearch" />;
      case 'SPARK':
        return <EuiIcon type={sparkSvg} />;

      default:
        return <></>;
    }
  };

  const tableColumns = [
    {
      field: 'name',
      name: 'Name',
      sortable: true,
      truncateText: true,
      render: (value, record: DataConnection) => (
        <EuiFlexGroup>
          <EuiFlexItem grow={false}>{icon(record)}</EuiFlexItem>
          <EuiFlexItem grow={false}>
            <EuiLink
              data-test-subj={`${record.name}DataConnectionsLink`}
              href={`#/manage/${record.name}`}
            >
              {_.truncate(record.name, { length: 100 })}
            </EuiLink>
          </EuiFlexItem>
        </EuiFlexGroup>
      ),
    },
    {
      field: 'connectionStatus',
      name: 'Connection Status',
      sortable: true,
      truncateText: true,
      render: (value, record) => (
        <EuiText data-test-subj={`${record.templateName}DatasourceConnectionHealth`}>
          {_.truncate(record.creationDate, { length: 100 })}
        </EuiText>
      ),
    },
    {
      field: 'actions',
      name: 'Actions',
      sortable: true,
      truncateText: true,
      render: (value, record) => (
        <EuiIcon
          type={'trash'}
          onClick={() => {
            /* Delete Datasource*/
          }}
        />
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
        field: 'templateName',
        name: 'Type',
        multiSelect: false,
        options: [].map((i) => ({
          value: i,
          name: i,
          view: i,
        })),
      },
    ],
  };

  const entries = data.map((dataconnection: DataConnection) => {
    const name = dataconnection.name;
    const connectionType = dataconnection.connectionType;
    return { connectionType, name, data: { name, connectionType } };
  });

  return (
    <EuiPage>
      <EuiPageBody component="div">
        <DataConnectionsHeader />
        <EuiPageContent data-test-subj="manageDataConnectionsarea">
          <DatasourcesDescription />
          <EuiInMemoryTable
            items={entries}
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
          />
        </EuiPageContent>
      </EuiPageBody>
    </EuiPage>
  );
}

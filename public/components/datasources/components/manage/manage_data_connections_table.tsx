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
  EuiOverlayMask,
  EuiPage,
  EuiPageBody,
  EuiPageContent,
  EuiTableFieldDataColumnType,
} from '@elastic/eui';
import _ from 'lodash';
import React, { useEffect, useState } from 'react';
import { DataConnectionsHeader } from '../data_connections_header';
import { HomeProps } from '../../home';
import { DataConnectionsDescription } from './manage_data_connections_description';
import { DATACONNECTIONS_BASE } from '../../../../../common/constants/shared';
import { useToast } from '../../../common/toast';
import { DeleteModal } from '../../../common/helpers/delete_modal';
import S3Logo from '../../icons/s3-logo.svg';
import { DatasourceType } from '../../../../../common/types/data_connections';

interface DataConnection {
  connectionType: DatasourceType;
  name: string;
}

export const ManageDataConnectionsTable = (props: HomeProps) => {
  const { http, chrome, pplService } = props;

  const { setToast } = useToast();

  const [data, setData] = useState<DataConnection[]>([]);
  const [isModalVisible, setIsModalVisible] = useState(false);
  const [modalLayout, setModalLayout] = useState(<EuiOverlayMask />);

  const deleteConnection = (connectionName: string) => {
    http!
      .delete(`${DATACONNECTIONS_BASE}/${connectionName}`)
      .then(() => {
        setToast(`Data connection ${connectionName} deleted successfully`);
        setData(
          data.filter((connection) => {
            return !(connection.name === connectionName);
          })
        );
      })
      .catch((err) => {
        setToast(`Data connection $${connectionName} not deleted. See output for more details.`);
      });
  };

  useEffect(() => {
    chrome.setBreadcrumbs([
      {
        text: 'Data sources',
        href: '#/',
      },
    ]);
    handleDataRequest();
  }, [chrome]);

  async function handleDataRequest() {
    pplService!.fetch({ query: 'show datasources', format: 'jdbc' }).then((dataconnections) =>
      setData(
        dataconnections.jsonData.map((x: any) => {
          return { name: x.DATASOURCE_NAME, connectionType: x.CONNECTOR_TYPE };
        })
      )
    );
  }

  const displayDeleteModal = (connectionName: string) => {
    setModalLayout(
      <DeleteModal
        onConfirm={() => {
          setIsModalVisible(false);
          deleteConnection(connectionName);
        }}
        onCancel={() => {
          setIsModalVisible(false);
        }}
        title={`Delete ${connectionName}`}
        message={`Are you sure you want to delete ${connectionName}?`}
      />
    );
    setIsModalVisible(true);
  };

  const icon = (record: DataConnection) => {
    switch (record.connectionType) {
      case 'S3GLUE':
        return <EuiIcon type={S3Logo} />;
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
      field: 'actions',
      name: 'Actions',
      sortable: true,
      truncateText: true,
      render: (value, record) => (
        <EuiIcon
          type={'trash'}
          onClick={() => {
            displayDeleteModal(record.name);
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
          <DataConnectionsDescription />

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
        {isModalVisible && modalLayout}
      </EuiPageBody>
    </EuiPage>
  );
};

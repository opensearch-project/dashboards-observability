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
import {
  DATACONNECTIONS_BASE,
  observabilityIntegrationsID,
  observabilityLogsID,
  observabilityMetricsID,
} from '../../../../../common/constants/shared';
import { useToast } from '../../../common/toast';
import { DeleteModal } from '../../../common/helpers/delete_modal';
import S3Logo from '../../icons/s3-logo.svg';
import PrometheusLogo from '../../icons/prometheus-logo.svg';
import { DatasourceType } from '../../../../../common/types/data_connections';
import { coreRefs } from '../../../../../public/framework/core_refs';

interface DataConnection {
  connectionType: DatasourceType;
  name: string;
}

export const ManageDataConnectionsTable = (props: HomeProps) => {
  const { http, chrome, pplService } = props;
  const { application } = coreRefs;

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

  const actions = [
    {
      name: 'Edit',
      isPrimary: true,
      icon: 'pencil',
      type: 'icon',
      onClick: (datasource: DataConnection) => {
        window.location.href = `#/manage/${datasource.name}`;
      },
      'data-test-subj': 'action-edit',
    },
    {
      name: (datasource: DataConnection) =>
        `Query in ${
          datasource.connectionType === 'PROMETHEUS' ? 'Metrics Analytics' : 'Observability Logs'
        }`,
      isPrimary: true,
      icon: 'discoverApp',
      type: 'icon',
      onClick: (datasource: DataConnection) => {
        application!.navigateToApp(
          datasource.connectionType === 'PROMETHEUS' ? observabilityMetricsID : observabilityLogsID
        );
      },
      'data-test-subj': 'action-query',
    },
    {
      name: 'Accelerate performance',
      isPrimary: false,
      icon: 'bolt',
      type: 'icon',
      available: (datasource: DataConnection) => datasource.connectionType !== 'PROMETHEUS',
      onClick: () => {
        application!.navigateToApp('opensearch-query-workbench');
      },
      'data-test-subj': 'action-accelerate',
    },
    {
      name: 'Integrate data',
      isPrimary: false,
      icon: 'integrationGeneral',
      type: 'icon',
      available: (datasource: DataConnection) => datasource.connectionType !== 'PROMETHEUS',
      onClick: () => {
        application!.navigateToApp(observabilityIntegrationsID);
      },
      'data-test-subj': 'action-integrate',
    },
    {
      name: 'Delete',
      description: 'Delete this data source',
      icon: 'trash',
      color: 'danger',
      type: 'icon',
      onClick: (datasource: DataConnection) => displayDeleteModal(datasource.name),
      isPrimary: false,
      'data-test-subj': 'action-delete',
    },
  ];

  const icon = (record: DataConnection) => {
    switch (record.connectionType) {
      case 'S3GLUE':
        return <EuiIcon type={S3Logo} />;
      case 'PROMETHEUS':
        return <EuiIcon type={PrometheusLogo} />;
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
      actions,
    },
  ] as Array<EuiTableFieldDataColumnType<any>>;

  const search = {
    box: {
      incremental: true,
    },
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
          <DataConnectionsDescription refresh={handleDataRequest} />

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

/*
 * Copyright OpenSearch Contributors
 * SPDX-License-Identifier: Apache-2.0
 */

import {
  EuiFlexGroup,
  EuiFlexItem,
  EuiHealth,
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
import {
  DATACONNECTIONS_BASE,
  observabilityMetricsID,
} from '../../../../../common/constants/shared';
import {
  DatasourceDetails,
  DatasourceStatus,
  DatasourceType,
} from '../../../../../common/types/data_connections';
import { coreRefs } from '../../../../../public/framework/core_refs';
import { DeleteModal } from '../../../common/helpers/delete_modal';
import { useToast } from '../../../common/toast';
import { HomeProps } from '../../home';
import PrometheusLogo from '../../icons/prometheus-logo.svg';
import S3Logo from '../../icons/s3-logo.svg';
import { DataConnectionsHeader } from '../data_connections_header';
import { DataConnectionsDescription } from './manage_data_connections_description';
import { getRenderCreateAccelerationFlyout } from '../../../../../public/plugin';
import { InstallIntegrationFlyout } from './integrations/installed_integrations_table';
import { redirectToExplorerS3 } from './associated_objects/utils/associated_objects_tab_utils';

interface DataConnection {
  connectionType: DatasourceType;
  name: string;
  dsStatus: DatasourceStatus;
}

export const ManageDataConnectionsTable = (props: HomeProps) => {
  const { http, chrome } = props;
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
        console.error(err);
        setToast(`Data connection $${connectionName} not deleted. See output for more details.`);
      });
  };

  const fetchDataSources = () => {
    http!
      .get(`${DATACONNECTIONS_BASE}`)
      .then((res: DatasourceDetails[]) => {
        const dataConnections = res.map((dataConnection: DatasourceDetails) => {
          return {
            name: dataConnection.name,
            connectionType: dataConnection.connector,
            dsStatus: dataConnection.status,
          };
        });
        setData(dataConnections);
      })
      .catch((err) => {
        console.error(err);
        setToast(`Could not fetch datasources`, 'danger');
      });
  };

  useEffect(() => {
    chrome.setBreadcrumbs([
      {
        text: 'Data sources',
        href: '#/',
      },
    ]);
    fetchDataSources();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [chrome]);

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

  const [showIntegrationsFlyout, setShowIntegrationsFlyout] = useState(false);
  const [integrationsFlyout, setIntegrationsFlyout] = useState<React.JSX.Element | null>(null);

  const actions = [
    {
      name: (datasource: DataConnection) =>
        `Query in ${
          datasource.connectionType === 'PROMETHEUS' ? 'Metrics Analytics' : 'Observability Logs'
        }`,
      isPrimary: true,
      icon: 'discoverApp',
      type: 'icon',
      onClick: (datasource: DataConnection) => {
        if (datasource.connectionType === 'PROMETHEUS') {
          application!.navigateToApp(observabilityMetricsID);
        } else if (datasource.connectionType === 'S3GLUE') {
          redirectToExplorerS3(datasource.name);
        }
      },
      'data-test-subj': 'action-query',
    },
    {
      name: 'Accelerate performance',
      isPrimary: false,
      icon: 'bolt',
      type: 'icon',
      available: (datasource: DataConnection) => datasource.connectionType !== 'PROMETHEUS',
      onClick: (datasource: DataConnection) => {
        renderCreateAccelerationFlyout(datasource.name);
      },
      'data-test-subj': 'action-accelerate',
    },
    {
      name: 'Integrate data',
      isPrimary: false,
      icon: 'integrationGeneral',
      type: 'icon',
      available: (datasource: DataConnection) => datasource.connectionType !== 'PROMETHEUS',
      onClick: (datasource: DataConnection) => {
        setIntegrationsFlyout(
          <InstallIntegrationFlyout
            closeFlyout={() => setShowIntegrationsFlyout(false)}
            datasourceType={datasource.connectionType}
            datasourceName={datasource.name}
          />
        );
        setShowIntegrationsFlyout(true);
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
      field: 'status',
      name: 'Status',
      sortable: true,
      truncateText: true,
      render: (value, record: DataConnection) =>
        record.dsStatus === 'ACTIVE' ? (
          <EuiHealth color="success">Active</EuiHealth>
        ) : (
          <EuiHealth color="subdued">Inactive</EuiHealth>
        ),
    },
    {
      field: 'actions',
      name: 'Actions',
      actions,
    },
  ] as Array<EuiTableFieldDataColumnType<unknown>>;

  const search = {
    box: {
      incremental: true,
    },
  };

  const entries = data.map((dataconnection: DataConnection) => {
    const name = dataconnection.name;
    const connectionType = dataconnection.connectionType;
    const dsStatus = dataconnection.dsStatus;
    return { connectionType, name, dsStatus, data: { name, connectionType } };
  });

  const renderCreateAccelerationFlyout = getRenderCreateAccelerationFlyout();

  return (
    <EuiPage>
      <EuiPageBody component="div">
        <DataConnectionsHeader />
        <EuiPageContent data-test-subj="manageDataConnectionsarea">
          <DataConnectionsDescription refresh={fetchDataSources} />
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
        {showIntegrationsFlyout && integrationsFlyout}
      </EuiPageBody>
    </EuiPage>
  );
};
